import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

import { artifacts } from "./artifacts-data";
import { catalogIconUrl } from "./catalog-icon";
import { spells } from "./spells-data";
import { synergyIcons } from "./synergy-icons";
import { abilities, allUnits, factionUnits } from "./units-data";
import runtimeArt from "../../../game/core/animation-release.json";
import { TIER1_ARTIFACT_LIST, TIER2_ARTIFACT_LIST } from "@heroesofcrypto/common/src/artifacts/artifact_properties";

interface AssetReference {
    owner: string;
    url: string;
}

const publicAssetPath = (url: string): string => {
    const pathname = url.split("?", 1)[0];
    return fileURLToPath(new URL(`../../public${pathname}`, import.meta.url));
};

const assetReferences = (): AssetReference[] => [
    ...["armor", "might", "empower", "sniper", "movement", "board"].map((augment) => ({
        owner: `${augment} augment`,
        url: catalogIconUrl(`/assets/images/units/abilities/${augment}_augment_256.webp`),
    })),
    ...artifacts.map((artifact) => ({ owner: `${artifact.name} artifact`, url: artifact.icon })),
    ...factionUnits.map((faction) => ({
        owner: `${faction.faction} faction`,
        url: faction.icon,
    })),
    ...allUnits.map((unit) => ({
        owner: `${unit.name} portrait`,
        url: unit.portrait,
    })),
    ...abilities.map((ability) => ({
        owner: `${ability.name} ability`,
        url: ability.icon,
    })),
    ...spells.map((spell) => ({
        owner: `${spell.book}:${spell.name} spell`,
        url: spell.icon,
    })),
    ...Object.entries(synergyIcons).map(([key, url]) => ({ owner: `${key} synergy`, url })),
];

describe("public codex assets", () => {
    test("every flat catalog icon URL changes with its exported image bytes", async () => {
        const references = assetReferences().filter((reference) => !reference.url.includes("/portraits/"));
        for (const reference of references) {
            const url = new URL(reference.url, "https://heroesofcrypto.io");
            const bytes = await Bun.file(publicAssetPath(reference.url)).arrayBuffer();
            expect(url.searchParams.get("v"), reference.owner).toBe(
                new Bun.CryptoHasher("sha256").update(bytes).digest("hex").slice(0, 12),
            );
        }
    });

    test("shared flat icons match the published game-art pins without a private art checkout", async () => {
        const pins: Record<string, { sha256: string; bytes: number }> = runtimeArt.files;
        const mismatches: string[] = [];
        const checked = new Set<string>();
        const artifactSources = new Map(
            [...TIER1_ARTIFACT_LIST, ...TIER2_ARTIFACT_LIST].map((artifact) => [
                `artifact_t${artifact.tier}_${artifact.slug}_256.webp`,
                `${artifact.imageKey}.webp`,
            ]),
        );
        for (const reference of assetReferences()) {
            const filename = reference.url.split("?", 1)[0].split("/").at(-1)!;
            const sourceName =
                artifactSources.get(filename) ??
                (filename === "rallying_volley_blessing_256.webp" ? "rallying_volley_aura_256.webp" : filename);
            const pin = pins[`images/${sourceName}`];
            if (reference.url.includes("/artifacts/")) expect(pin, sourceName).toBeDefined();
            if (!pin || checked.has(reference.url)) continue;
            checked.add(reference.url);
            const bytes = await Bun.file(publicAssetPath(reference.url)).arrayBuffer();
            if (
                bytes.byteLength !== pin.bytes ||
                new Bun.CryptoHasher("sha256").update(bytes).digest("hex") !== pin.sha256
            )
                mismatches.push(`${reference.owner}: ${reference.url}`);
        }
        expect(checked.size).toBeGreaterThan(0);
        expect(mismatches).toEqual([]);
    });

    test("has a non-empty image for every game-derived faction, unit, ability, spell, artifact, and synergy", async () => {
        const missing: string[] = [];

        for (const reference of assetReferences()) {
            const asset = Bun.file(publicAssetPath(reference.url));
            if (!(await asset.exists()) || asset.size === 0) {
                missing.push(`${reference.owner}: ${reference.url}`);
            }
        }

        expect(missing).toEqual([]);
    });

    // Empower must have art of its own rather than borrowing another spell's icon. This used to be pinned
    // as an exact size and SHA of the file, which asserted "these precise bytes" — so it failed the first
    // time the art was legitimately refreshed from the art source, for a reason that had nothing to do
    // with what it was guarding. Assert the property instead: distinct art, shared with no other spell.
    test("gives Empower spell art of its own", async () => {
        const empower = spells.find((spell) => spell.name === "Empower");
        expect(empower?.icon.split("?", 1)[0]).toBe("/assets/images/spells/empower_256.webp");

        const digestOf = async (url: string): Promise<string> => {
            const asset = Bun.file(publicAssetPath(url));
            return new Bun.CryptoHasher("sha256").update(await asset.arrayBuffer()).digest("hex");
        };

        const empowerDigest = await digestOf(empower!.icon);
        expect(Bun.file(publicAssetPath(empower!.icon)).size).toBeGreaterThan(0);

        const sharedWith: string[] = [];
        for (const spell of spells) {
            if (spell.name === "Empower" || spell.icon === empower!.icon) {
                continue;
            }
            if ((await digestOf(spell.icon)) === empowerDigest) {
                sharedWith.push(spell.name);
            }
        }
        expect(sharedWith).toEqual([]);
    });
});
