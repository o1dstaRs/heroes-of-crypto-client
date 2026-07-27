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

    test("uses the approved distinct Empower spell art", async () => {
        const empower = spells.find((spell) => spell.book === "Chaos" && spell.name === "Empower");
        expect(empower?.icon).toBe("/assets/images/spells/empower_256.webp");

        const asset = Bun.file(publicAssetPath(empower!.icon));
        expect(asset.size).toBe(40_308);
        const digest = new Bun.CryptoHasher("sha256").update(await asset.arrayBuffer()).digest("hex");
        expect(digest).toBe("1414bf3777e74d79ec1e9d1c70bef8b4ccdba6ac2d54ea993e8568fe5999b993");
    });
});
