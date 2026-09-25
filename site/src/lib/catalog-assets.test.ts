import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

import { spells } from "./spells-data";
import { abilities, allUnits, factionUnits } from "./units-data";

interface AssetReference {
    owner: string;
    url: string;
}

const publicAssetPath = (url: string): string => {
    const pathname = url.split("?", 1)[0];
    return fileURLToPath(new URL(`../../public${pathname}`, import.meta.url));
};

const assetReferences = (): AssetReference[] => [
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
];

describe("public codex assets", () => {
    test("has a non-empty image for every game-derived faction, unit, ability, and spell", async () => {
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
        expect(empower?.icon).toBe("/assets/images/spells/empower_256.webp");

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
