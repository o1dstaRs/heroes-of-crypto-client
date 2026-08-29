import { CreatureVals } from "@heroesofcrypto/common";
import { describe, expect, test } from "bun:test";

import { ASH_MOTH_CREATURE_ID, draftAttackIconKind } from "./attackTypeIcon";

describe("draftAttackIconKind", () => {
    test("shows the magic book icon for melee caster-role creatures", () => {
        expect(draftAttackIconKind(ASH_MOTH_CREATURE_ID, "MELEE")).toBe("MAGIC");
        expect(draftAttackIconKind(CreatureVals.BATTLE_MAGE, "MELEE")).toBe("MAGIC");
        expect(draftAttackIconKind(CreatureVals.OGRE_MAGE, "MELEE")).toBe("MAGIC");
        expect(draftAttackIconKind(CreatureVals.MAGIC_DRAGON, "MELEE")).toBe("MAGIC");
    });

    test("keeps the configured icon for other units", () => {
        expect(draftAttackIconKind(CreatureVals.MERMAID, "MELEE")).toBe("MELEE");
        expect(draftAttackIconKind(CreatureVals.ELF, "RANGE")).toBe("RANGE");
    });
});
