import { expect, test } from "bun:test";
import { CrusadeTriggers } from "./CrusadeTriggers";

test("Crusade fires once for a resolved movement gain, but not hydration or capped movement", () => {
    const triggers = new CrusadeTriggers();
    const initial = { x: 100, y: 100, attack: 25, armor: 25, eligible: true };
    expect(triggers.observe("champion", initial)).toBe(false);
    const moved = { ...initial, x: 200, attack: 27, armor: 27 };
    expect(triggers.observe("champion", moved)).toBe(true);
    expect(triggers.observe("champion", moved)).toBe(false);
    expect(triggers.observe("champion", { ...moved, attack: 50, armor: 50 })).toBe(false);
    expect(triggers.observe("champion", { ...moved, x: 300, attack: 50, armor: 50 })).toBe(false);
    triggers.clear();
    expect(triggers.observe("champion", moved)).toBe(false);
});

test("Crusade ignores absent cards, dead recipients and movement without gains", () => {
    const triggers = new CrusadeTriggers();
    const initial = { x: 0, y: 0, attack: 25, armor: 25, eligible: true };
    triggers.observe("champion", initial);
    expect(triggers.observe("champion", { ...initial, x: 100 })).toBe(false);
    expect(triggers.observe("champion", { ...initial, x: 200, attack: 26, eligible: false })).toBe(false);
    expect(triggers.observe("champion", { ...initial, x: 300, attack: 27 })).toBe(false);
    expect(triggers.observe("champion", { ...initial, x: 400, attack: 28 })).toBe(true);
});
