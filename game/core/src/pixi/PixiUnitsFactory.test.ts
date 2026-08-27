import { getCreaturesByLevel } from "@heroesofcrypto/common";
import { expect, test } from "bun:test";

import { images } from "@/generated/image_imports";

import { UNIT_ID_TO_NAME } from "../ui/unit_ui_constants";
import { staticBattlefieldTextureNameForUnit, TextureType, unitToTextureName } from "./PixiUnitsFactory";

test("uses every uploaded final battlefield figure independent of footprint", () => {
    const creatureIds = [1, 2, 3, 4].flatMap((level) => [...getCreaturesByLevel(level)]);
    for (const creatureId of creatureIds) {
        const name = UNIT_ID_TO_NAME[creatureId];
        const slug = name.toLowerCase().replaceAll(" ", "_");
        expect(`${slug}_final` in images).toBe(true);
        expect(staticBattlefieldTextureNameForUnit(name, 1, 1)).toBe(`${slug}_final`);
        expect(staticBattlefieldTextureNameForUnit(name, 2, 1)).toBe(`${slug}_final`);
        expect(staticBattlefieldTextureNameForUnit(name, 2, 2)).toBe(`${slug}_final`);
        expect(unitToTextureName(name, TextureType.SMALL, 1, 1)).toBe(`${slug}_final`);
    }
});

test("keeps card textures separate from battlefield figures", () => {
    expect(unitToTextureName("Scavenger", TextureType.LARGE, 1)).toBe("thief_model_full");
    expect(unitToTextureName("Wandering Mage", TextureType.LARGE, 1)).toBe("wandering_mage_512");
    expect(unitToTextureName("Thunderbird", TextureType.LARGE, 2)).toBe("thunderbird_512_v2");
});
