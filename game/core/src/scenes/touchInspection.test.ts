import { beforeEach, describe, expect, mock, test } from "bun:test";
import { FightStateManager, type UnitProperties } from "@heroesofcrypto/common";

import { RenderableUnit } from "./RenderableUnit";
import { Sandbox } from "./Sandbox";

beforeEach(() => FightStateManager.getInstance().reset());

describe("touch inspection", () => {
    test("inspecting an own stack stays read-only and never invokes shift-splitting", () => {
        const properties = { id: "inspected", name: "Berserker", amount_alive: 10 } as UnitProperties;
        const unit = Object.create(RenderableUnit.prototype) as RenderableUnit;
        Object.assign(unit, { getUnitProperties: () => properties, setBoardSelected: mock(() => {}) });
        const scene = Object.create(Sandbox.prototype) as Sandbox;
        const split = mock(() => true);
        const select = mock(() => {});
        Object.assign(scene, {
            getLogicalBattlefieldPoint: (point: { x: number; y: number }) => point,
            getInspectableUnitAtPosition: () => unit,
            tryBeginPlacementSplit: split,
            setSelectedUnitProperties: select,
            hasActiveSelection: false,
        });
        scene.InspectTouchUnit({ x: 100, y: 200 });
        expect(scene.sc_selectedUnitProperties).toBe(properties);
        expect(select).toHaveBeenCalledWith(properties);
        expect(split).not.toHaveBeenCalled();
        expect(Reflect.get(scene, "hasActiveSelection")).toBe(false);
    });
    test("a placement in progress always requires confirmation, including during a visual animation", () => {
        const scene = Object.create(Sandbox.prototype) as Sandbox;
        Object.assign(scene, { hasActiveSelection: true, sc_isAnimating: true });
        expect(scene.getTouchConfirmationLabel({ x: 100, y: 200 })).toBe("Place here");
    });
    test("cosmetic animation does not invalidate an otherwise unchanged confirmation", () => {
        const scene = Object.create(Sandbox.prototype) as Sandbox;
        Object.assign(scene, { sc_isAnimating: false });
        const before = scene.getTouchInteractionKey();
        Object.assign(scene, { sc_isAnimating: true });
        expect(scene.getTouchInteractionKey()).toBe(before);
    });
});
