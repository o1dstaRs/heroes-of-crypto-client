import { expect, test } from "bun:test";

import { UNIT_ID_TO_NAME } from "../ui/unit_ui_constants";
import { staticBattlefieldTextureNameForUnit, TextureType, unitToTextureName } from "./PixiUnitsFactory";
import { isProductionOmittedUnreferencedAssetKey } from "./productionImageAssetPolicy";
import { isRetiredCreatureThumbnail } from "./retiredCreatureThumbnails";

test("retired thumbnails have current board replacements for every supported footprint", () => {
    for (const name of Object.values(UNIT_ID_TO_NAME)) {
        const slug = name.toLowerCase().replace(/ /g, "_");
        if (!isRetiredCreatureThumbnail(`${slug}_128`)) continue;
        expect(staticBattlefieldTextureNameForUnit(name)).toBeDefined();
        for (const [width, height] of [
            [1, 1],
            [2, 1],
            [1, 2],
            [2, 2],
        ]) {
            expect(isRetiredCreatureThumbnail(unitToTextureName(name, TextureType.SMALL, width, height))).toBe(false);
        }
        expect(isProductionOmittedUnreferencedAssetKey(`${slug}_128`)).toBe(true);
        expect(isProductionOmittedUnreferencedAssetKey(`${slug}_256`)).toBe(true);
    }
});

test("preserves approved portraits, current board cutouts and unrelated icons", () => {
    for (const key of [
        "peasant_512",
        "orc_model_full",
        "wolf_portrait_full",
        "troll_board_128",
        "peasant_battlefield_side_right_final_v1",
        "artifact_t2_titan_plate_256",
        "phoenix_256",
    ]) {
        expect(isRetiredCreatureThumbnail(key)).toBe(false);
    }
});
