import { CreatureVals } from "@heroesofcrypto/common";
import { describe, expect, test } from "bun:test";

import { draftAttackIconKind } from "./attackTypeIcon";

describe("draftAttackIconKind", () => {
    test("shows the existing magic book icon for Wandering Mage", () => {
        expect(draftAttackIconKind(CreatureVals.ASH_MOTH, "MELEE")).toBe("MAGIC");
    });

    test("keeps the configured icon for other units", () => {
        expect(draftAttackIconKind(CreatureVals.MERMAID, "MELEE")).toBe("MELEE");
        expect(draftAttackIconKind(CreatureVals.ELF, "RANGE")).toBe("RANGE");
    });
});
