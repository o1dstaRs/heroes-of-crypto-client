import { expect, mock, test } from "bun:test";
import { FactionVals, type UnitProperties } from "@heroesofcrypto/common";
import { Container, Texture } from "pixi.js";

import { PixiGameManager } from "./PixiGameManager";
import { PixiScene } from "./PixiScene";
import { UnitsOverlay } from "../scenes/UnitsOverlay";
import type { UnitChip } from "../scenes/UnitChip";
import type { IUnitInspection } from "../scenes/VisibleState";

const createOverlay = () => {
    const app = {
        renderer: { width: 1280, height: 720 },
        stage: new Container(),
        ticker: { add: () => undefined, remove: () => undefined },
    } as unknown as ConstructorParameters<typeof UnitsOverlay>[0];
    const selected = mock(() => undefined);
    const overlay = new UnitsOverlay(app, () => Texture.EMPTY, selected);
    overlay.build();
    return { overlay, selected };
};

test("roster hover exposes a creature without selecting it, and clears on exit", () => {
    const { overlay, selected } = createOverlay();
    try {
        const chip = (overlay as unknown as { allChips: UnitChip[] }).allChips[0];
        const bounds = chip.getBounds();
        overlay.handlePointerMove(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
        expect(overlay.getHoveredUnitProperties()?.name).toBe(chip.nameKey);
        expect(selected).not.toHaveBeenCalled();
        expect(overlay.hasSelection()).toBe(false);
        overlay.setVisible(false);
        expect(overlay.getHoveredUnitProperties()).toBeUndefined();
        overlay.setVisible(true);
        overlay.handlePointerMove(-100, -100);
        expect(overlay.getHoveredUnitProperties()).toBeUndefined();
    } finally {
        overlay.destroy();
    }
});

test("hover card uses the real abilities without mutating selected unit or faction", () => {
    const { overlay } = createOverlay();
    try {
        const unit = overlay.getUnitProperties("Peasant");
        const selected = { name: "Wolf" } as UnitProperties;
        const scene = Object.create(PixiScene.prototype) as PixiScene;
        scene.sc_selectedUnitProperties = selected;
        scene.sc_selectedFactionType = FactionVals.NATURE;
        scene.sc_unitPropertiesUpdateNeeded = false;
        const impact = scene.getUnitVisibleImpact(unit);
        expect(impact.abilities.map((ability) => ability.name)).toEqual(unit.abilities);
        expect(scene.sc_selectedUnitProperties).toBe(selected);
        expect(scene.sc_selectedFactionType).toBe(FactionVals.NATURE);
        expect(scene.sc_unitPropertiesUpdateNeeded).toBe(false);
    } finally {
        overlay.destroy();
    }
});

test("board inspection emits separately, refreshes live stats, and clears when the pointer leaves", () => {
    const manager = new PixiGameManager();
    const unit = { name: "Peasant" } as UnitProperties;
    const impact = { abilities: [], buffs: [], debuffs: [] };
    const scene = {
        sc_hoveredUnitProperties: unit,
        sc_unitPropertiesUpdateNeeded: false,
        getUnitVisibleImpact: mock(() => impact),
    };
    const internal = manager as unknown as {
        m_scene: unknown;
        m_hoveringCanvas: boolean;
        updateUnitInspection(): void;
    };
    internal.m_scene = scene;
    internal.m_hoveringCanvas = true;
    const updates: (IUnitInspection | null)[] = [];
    const selection = mock(() => undefined);
    manager.onSelectionCombined.connect(selection);
    manager.onUnitInspectionUpdated.connect((value) => updates.push(value));
    internal.updateUnitInspection();
    internal.updateUnitInspection();
    expect(updates).toEqual([{ unit, impact }]);
    expect(scene.getUnitVisibleImpact).toHaveBeenCalledTimes(1);
    scene.sc_unitPropertiesUpdateNeeded = true;
    internal.updateUnitInspection();
    expect(updates).toHaveLength(2);
    internal.m_hoveringCanvas = false;
    internal.updateUnitInspection();
    expect(updates.at(-1)).toBeNull();
    expect(selection).not.toHaveBeenCalled();
});
