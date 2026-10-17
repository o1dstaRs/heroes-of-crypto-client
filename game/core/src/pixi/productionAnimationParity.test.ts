import { expect, test } from "bun:test";
import { approvedAnimationAssetKeysForUnit } from "./creatureAnimationSettings";
import { isProductionOmittedAssetKey } from "./imageAssetTiers";
import { isProductionOmittedDisabledUnitAnimationAssetKey } from "./productionImageAssetPolicy";

test("production retains the same approved animation packages as local combat", () => {
    for (const unit of ["Mantis", "Black Dragon", "Griffin", "Abomination", "Arbalester"]) {
        const keys = approvedAnimationAssetKeysForUnit(unit);
        expect(keys.length).toBeGreaterThan(0);
        for (const key of keys) {
            expect(isProductionOmittedAssetKey(key)).toBe(false);
            expect(isProductionOmittedDisabledUnitAnimationAssetKey(key)).toBe(false);
        }
    }
});

test("native idle pages remain available without being eagerly preloaded", () => {
    for (const key of ["arbalester_idle_page_00_atlas", "abomination_lab_idle_page_02_atlas"]) {
        expect(isProductionOmittedAssetKey(key)).toBe(false);
        expect(isProductionOmittedDisabledUnitAnimationAssetKey(key)).toBe(false);
    }
});
