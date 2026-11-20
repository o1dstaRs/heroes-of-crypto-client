import { expect, test } from "bun:test";

import { Sandbox } from "./Sandbox";

const scene = (state: { moving?: boolean; animating?: boolean; blocked?: boolean; active?: string }) => {
    const unit = (id: string) => ({ getId: () => id, hasUnfinishedCombatAnimation: () => !!state.animating });
    const units = new Map([
        ["aura", unit("aura")],
        ["other", unit("other")],
    ]);
    return Object.assign(Object.create(Sandbox.prototype), {
        unitsHolder: { getAllUnits: () => units },
        moveAnimManager: { isUnitMoving: () => !!state.moving },
        sc_moveBlocked: !!state.blocked,
        currentActiveUnit: state.active ? units.get(state.active) : undefined,
    }) as { isAuraOwnerInMotion(id: string): boolean };
};

test("an aura projects only while its owner stands still", () => {
    expect(scene({}).isAuraOwnerInMotion("aura")).toBe(false);
    expect(scene({ moving: true }).isAuraOwnerInMotion("aura")).toBe(true);
    // The strike itself, and the gap between the approach and the strike, are not standing still.
    expect(scene({ animating: true }).isAuraOwnerInMotion("aura")).toBe(true);
    expect(scene({ blocked: true, active: "aura" }).isAuraOwnerInMotion("aura")).toBe(true);
    // Another unit's action does not hide this stationary owner's aura.
    expect(scene({ blocked: true, active: "other" }).isAuraOwnerInMotion("aura")).toBe(false);
    expect(scene({}).isAuraOwnerInMotion("missing")).toBe(false);
});
