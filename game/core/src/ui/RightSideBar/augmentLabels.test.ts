import { describe, expect, test } from "bun:test";
import { Augment } from "@heroesofcrypto/common";

import { armorAugmentLabel } from "./augmentLabels";

describe("armorAugmentLabel", () => {
    test.each([
        [Augment.ArmorAugment.LEVEL_1, "+6% Armor & +6 Magic Armor"],
        [Augment.ArmorAugment.LEVEL_2, "+13% Armor & +13 Magic Armor"],
        [Augment.ArmorAugment.LEVEL_3, "+21% Armor & +21 Magic Armor"],
    ])("formats armor augment %s with percentage armor and flat magic armor", (augment, expected) => {
        expect(armorAugmentLabel(augment)).toBe(expected);
    });
});
