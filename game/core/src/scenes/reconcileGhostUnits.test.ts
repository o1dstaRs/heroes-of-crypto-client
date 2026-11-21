import { hasActiveTimeDenial, type Unit } from "@heroesofcrypto/common";
import { expect, test } from "bun:test";

import { Sandbox } from "./Sandbox";

const ghostUnit = (id: string, abilities: string[] = []) => ({
    getId: () => id,
    isDead: () => false,
    hasAbilityActive: (name: string) => abilities.includes(name),
    destroyVisuals: () => undefined,
    getAttackRange: () => 1,
    isSmallSize: () => false,
});

// A ranked replay applies a kill's events without removing the unit; the next snapshot drops it, but only
// after that snapshot has already activated the next unit and computed its toolbar.
test("dropping a dead Time Denial holder recomputes the toolbar, so Wait is offered that same turn", () => {
    const units = new Map([
        ["nightmare", ghostUnit("nightmare", ["Time Denial"])],
        ["squire", ghostUnit("squire")],
    ]);
    const deniedAtRefresh: boolean[] = [];
    const scene = Object.create(Sandbox.prototype) as Sandbox;
    Object.assign(scene, {
        unitsHolder: {
            getAllUnits: () => units,
            deleteUnitById: (id: string) => units.delete(id),
        },
        grid: { cleanupAll: () => undefined, getMatrix: () => [], getMatrixNoUnits: () => [] },
        dyingVisualUnits: new Set(),
        refreshUnits: () => undefined,
        buttonManager: {
            refreshButtons: () =>
                deniedAtRefresh.push(hasActiveTimeDenial(units.values() as unknown as Iterable<Unit>)),
        },
    });

    (scene as unknown as { reconcileGhostUnits(ids: Set<string>): void }).reconcileGhostUnits(new Set(["squire"]));

    expect([...units.keys()]).toEqual(["squire"]);
    expect(deniedAtRefresh).toEqual([false]);
});

test("a snapshot that drops nobody leaves the toolbar alone", () => {
    const units = new Map([["squire", ghostUnit("squire")]]);
    let refreshes = 0;
    const scene = Object.create(Sandbox.prototype) as Sandbox;
    Object.assign(scene, {
        unitsHolder: { getAllUnits: () => units, deleteUnitById: (id: string) => units.delete(id) },
        buttonManager: { refreshButtons: () => refreshes++ },
    });

    (scene as unknown as { reconcileGhostUnits(ids: Set<string>): void }).reconcileGhostUnits(new Set(["squire"]));

    expect(refreshes).toBe(0);
});
