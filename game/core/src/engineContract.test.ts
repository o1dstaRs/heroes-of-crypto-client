/*
 * -----------------------------------------------------------------------------
 * This file is part of the game core of the Heroes of Crypto.
 *
 * Heroes of Crypto and Heroes of Crypto AI are registered trademarks.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 * -----------------------------------------------------------------------------
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { AttackVals, GridVals, HoCConfig, MovementVals, PlacementPositionType, TeamVals } from "@heroesofcrypto/common";

/**
 * Every ability the client asks for by name must exist in the engine it is PINNED to.
 *
 * The client reaches into the engine with string literals — `hasAbilityActive("Through Shot")` and
 * friends — and nothing type-checks those against the common submodule. A rename that lands in common
 * and in the client, but whose submodule pin drifts, therefore breaks silently: the lookup simply finds
 * nothing and the ability quietly loses its behaviour, card text and icon. Nothing fails to compile and
 * nothing throws.
 *
 * That is not hypothetical. Renaming the Squire's aura to "Arcane Ward Blessing" (common 3c51c0d,
 * client 270c6ebd) survived a rebase that took the other side's submodule pointer and put the client
 * back on d19ea33, where the ability is still called "Arcane Ward Aura" — the two commits were correct
 * individually and broken together. Git will not warn about this: the submodule is configured
 * `ignore = all`, so a drifted pin never appears in `git status`, and a rebase resolves the pointer to
 * one side without reporting a conflict.
 *
 * So the pin is checked here, by asking the engine the client actually imports.
 */

const CLIENT_SOURCE_ROOT = join(import.meta.dir);

/** Ability names are read through these; each takes the name as its first string argument. */
const ABILITY_LOOKUPS = ["hasAbilityActive", "getAbility", "hasAbility", "getAbilityPower"];

const isSourceFile = (name: string): boolean =>
    (name.endsWith(".ts") || name.endsWith(".tsx")) && !name.endsWith(".d.ts") && !name.includes(".test.");

const sourceFiles = (dir: string): string[] => {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
        if (entry === "node_modules" || entry === "generated") continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
        else if (isSourceFile(entry)) out.push(full);
    }
    return out;
};

/** Strip comments so prose placeholders like hasAbilityActive("<Ability>") are not read as lookups. */
const withoutComments = (source: string): string =>
    source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("the client only asks the pinned engine for abilities it has", () => {
    const referenced = new Map<string, string>();
    for (const file of sourceFiles(CLIENT_SOURCE_ROOT)) {
        const code = withoutComments(readFileSync(file, "utf8"));
        for (const lookup of ABILITY_LOOKUPS) {
            const pattern = new RegExp(`${lookup}\\(\\s*"([^"]+)"`, "g");
            for (const match of code.matchAll(pattern)) {
                const name = match[1];
                if (name && !referenced.has(name)) referenced.set(name, file);
            }
        }
    }

    test("the scan actually finds the lookups it is guarding", () => {
        // A refactor that renames the accessors must not turn this suite into a silent no-op.
        expect(referenced.size).toBeGreaterThan(30);
    });

    test("every referenced ability resolves in the pinned common", () => {
        const unresolved: string[] = [];
        for (const [name, file] of referenced) {
            try {
                HoCConfig.getAbilityConfig(name);
            } catch {
                unresolved.push(`${name}  (${file.slice(file.indexOf("/src/") + 1)})`);
            }
        }
        // Listing them keeps the failure self-explaining: the message names the ability AND the file,
        // so the reader can tell a typo from a submodule pin that needs advancing.
        expect(unresolved).toEqual([]);
    });
});

/**
 * The same drift, one level nastier: ENUM MEMBERS.
 *
 * A missing ability name merely fails to resolve. A missing enum member evaluates to `undefined`, and
 * `undefined === undefined` is TRUE — so a stale engine does not break loudly, it makes unrelated branches
 * agree. When TeamVals lost LEFT/RIGHT to a stale submodule, `placementTeam()` returned `TeamVals.RIGHT`
 * (undefined), `isGreenTeam()` compared undefined to undefined and answered "green" for BOTH zones, and the
 * red placement simply stopped being drawn. Nothing threw, nothing failed to compile, and the ability scan
 * above stayed green throughout.
 *
 * These run against the engine the working tree actually resolves, so a locally stale submodule fails here
 * while CI — which checks out the recorded pin — stays green. That difference is the point.
 */
describe("the client only reads engine enum members that exist", () => {
    const ENGINE_ENUMS: Record<string, Record<string, unknown>> = {
        TeamVals,
        AttackVals,
        GridVals,
        MovementVals,
        PlacementPositionType,
    };

    const referenced = new Map<string, Set<string>>();
    for (const file of sourceFiles(CLIENT_SOURCE_ROOT)) {
        const code = withoutComments(readFileSync(file, "utf8"));
        for (const enumName of Object.keys(ENGINE_ENUMS)) {
            // SCREAMING_CASE only — that is how the generated enums spell their members, and it keeps
            // helper methods and namespaced re-exports out of the scan.
            const pattern = new RegExp(`\\b${enumName}\\.([A-Z][A-Z0-9_]*)\\b`, "g");
            for (const match of code.matchAll(pattern)) {
                const member = match[1];
                if (!member) continue;
                if (!referenced.has(enumName)) referenced.set(enumName, new Set());
                referenced.get(enumName)!.add(member);
            }
        }
    }

    test("the scan actually finds the enum members it is guarding", () => {
        expect(referenced.get("TeamVals")?.size ?? 0).toBeGreaterThan(1);
        expect(referenced.get("PlacementPositionType")?.size ?? 0).toBeGreaterThan(1);
    });

    test("every referenced enum member is defined in the pinned common", () => {
        const missing: string[] = [];
        for (const [enumName, members] of referenced) {
            for (const member of [...members].sort()) {
                if (ENGINE_ENUMS[enumName]?.[member] === undefined) missing.push(`${enumName}.${member}`);
            }
        }
        // A non-empty list almost always means the submodule pin is stale — `ignore = all` hides that from
        // git status, so this is the only place it surfaces.
        expect(missing).toEqual([]);
    });
});
