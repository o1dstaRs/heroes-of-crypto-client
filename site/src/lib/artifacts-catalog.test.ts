import { describe, expect, test } from "bun:test";
import { statSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
    formatArtifactDescription,
    TIER1_ARTIFACT_LIST,
    TIER2_ARTIFACT_LIST,
} from "@heroesofcrypto/common/src/artifacts/artifact_properties";

import { artifacts } from "./artifacts-data";

// The codex is DERIVED from the game's artifact_properties.ts (it used to be a hand-written mirror, and it
// went stale: Rime Charm advertised 30% for a whole balance patch after the game moved it to 60%). These
// checks therefore guard the derivation rather than a copy — that every game artifact reaches the page, and
// that the effect text arrives with its numbers actually substituted.
const gameArtifacts = [...TIER1_ARTIFACT_LIST, ...TIER2_ARTIFACT_LIST];

describe("artifact codex", () => {
    test("lists every artifact the game offers", () => {
        const codexSlugs = new Set(artifacts.map((artifact) => `${artifact.tier}:${artifact.slug}`));
        const missing = gameArtifacts
            .filter((props) => !codexSlugs.has(`${props.tier}:${props.slug}`))
            .map((props) => `tier ${props.tier} ${props.slug}`);

        expect(missing).toEqual([]);
    });

    test("omits retired artifacts", () => {
        const codexSlugs = artifacts.map((artifact) => artifact.slug);

        expect(codexSlugs).not.toContain("broken_aegis");
        expect(codexSlugs).not.toContain("holy_cross");
    });

    // The spell codex hides artifacts by comparing normalized names, so a codex name that drifts from the
    // game's would list the artifact twice — once here and once as a bogus "System spell".
    test("names each one the way the game does, apostrophes aside", () => {
        const normalize = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "");
        const codexNames = new Map(artifacts.map((artifact) => [`${artifact.tier}:${artifact.slug}`, artifact.name]));

        const mismatched = gameArtifacts
            .filter((props) => {
                const codexName = codexNames.get(`${props.tier}:${props.slug}`);
                return codexName !== undefined && normalize(codexName) !== normalize(props.name);
            })
            .map(
                (props) =>
                    `${props.slug}: game "${props.name}" vs codex "${codexNames.get(`${props.tier}:${props.slug}`)}"`,
            );

        expect(mismatched).toEqual([]);
    });

    // catalog-assets.test.ts covers factions, units, abilities and spells, but artifacts were never in it --
    // which is how the arcane rings reached this branch declaring icons that did not exist anywhere. A codex
    // card whose art 404s is worse than a missing card: it looks like a bug in the page rather than a gap in
    // the assets.
    test("has real art behind every card", () => {
        const broken = artifacts
            .map((artifact) => {
                const pathname = artifact.icon.split("?", 1)[0];
                const file = fileURLToPath(new URL(`../../public${pathname}`, import.meta.url));
                try {
                    return statSync(file).size > 0 ? undefined : `${artifact.slug} (empty file)`;
                } catch {
                    return `${artifact.slug} (${artifact.icon})`;
                }
            })
            .filter(Boolean);

        expect(broken).toEqual([]);
    });

    // The failure mode that survives a derived codex: a new artifact missing from ARTIFACT_DESCRIPTION_VALUES
    // renders its raw template, so the page advertises "{}% chance" instead of a number.
    test("substitutes every power placeholder, leaving no template markers on the page", () => {
        const unsubstituted = artifacts
            .filter((artifact) => /\{\}|\[\]|<>/.test(artifact.description))
            .map((artifact) => `${artifact.slug}: ${artifact.description}`);

        expect(unsubstituted).toEqual([]);
        expect(artifacts.every((artifact) => artifact.description.trim().length > 0)).toBe(true);
    });

    // The numbers themselves come from the game, so a rebalance needs no edit here at all. This is the check
    // that would have caught the 30%-vs-60% drift the day it happened.
    test("states the same effect the game does, numbers included", () => {
        const codex = new Map(artifacts.map((artifact) => [`${artifact.tier}:${artifact.slug}`, artifact.description]));
        const wrong = gameArtifacts
            .map((props) => {
                const shown = codex.get(`${props.tier}:${props.slug}`);
                if (shown === undefined) {
                    return undefined;
                }
                // The page drops the "Artifact." marker and the "Lasts till the end of the fight." line that
                // is true of every artifact; everything else must match the game verbatim.
                const expected = formatArtifactDescription(props)
                    .replace(/^Artifact\.\s*/, "")
                    .replace(/\s*Lasts till the end of the fight\.\s*$/, "")
                    .trim();
                return shown === expected ? undefined : `${props.slug}: codex "${shown}" vs game "${expected}"`;
            })
            .filter(Boolean);

        expect(wrong).toEqual([]);
    });

    test("tags exactly the artifacts whose effect declares a downside", () => {
        const cursed = artifacts.filter((artifact) => artifact.cursed).map((artifact) => artifact.slug);

        expect(cursed).toEqual(["cursed_ward", "pendant_of_vitality", "berserkers_bond"]);
    });

    test("has no duplicate entries", () => {
        const keys = artifacts.map((artifact) => `${artifact.tier}:${artifact.slug}`);

        expect(keys).toHaveLength(new Set(keys).size);
    });
});
