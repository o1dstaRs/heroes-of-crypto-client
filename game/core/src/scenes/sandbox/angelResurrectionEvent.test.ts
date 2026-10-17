import { expect, test } from "bun:test";
import type { GameEvent } from "@heroesofcrypto/common";
import { angelResurrectionActor } from "./angelResurrectionEvent";

test("manual resurrection marks the caster and automatic resurrection marks the recipient", () => {
    const event = (value: unknown) => value as GameEvent;
    expect(
        angelResurrectionActor(
            event({ type: "spell_cast", casterId: "angel", spellName: "Resurrection", resurrected: ["ally"] }),
        ),
    ).toBe("angel");
    expect(angelResurrectionActor(event({ type: "spell_cast", casterId: "angel", spellName: "Resurrection" }))).toBe(
        "angel",
    );
    expect(angelResurrectionActor(event({ type: "unit_resurrected", unitId: "angel" }))).toBe("angel");
    expect(angelResurrectionActor(event({ type: "spell_cast", casterId: "mage", spellName: "Heal" }))).toBeUndefined();
    expect(angelResurrectionActor(event({ type: "unit_damaged", unitId: "angel" }))).toBeUndefined();
});
