import { describe, expect, test } from "bun:test";
import { statSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { TIER1_ARTIFACT_LIST, TIER2_ARTIFACT_LIST } from "@heroesofcrypto/common/src/artifacts/artifact_properties";

import { artifacts } from "./artifacts-data";

// The codex mirrors the game's artifact_properties.ts by hand, so an artifact added to the game can quietly
// go missing here. The check runs ONE way on purpose — every game artifact must have a codex entry, but a
// codex entry is allowed to run ahead of the pinned common submodule, which is exactly the state between
// "the artifact lands in common" and "the client bumps its pin".
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
            .map((props) => `${props.slug}: game "${props.name}" vs codex "${codexNames.get(`${props.tier}:${props.slug}`)}"`);

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

    test("has no duplicate entries", () => {
        const keys = artifacts.map((artifact) => `${artifact.tier}:${artifact.slug}`);

        expect(keys).toHaveLength(new Set(keys).size);
    });
});
