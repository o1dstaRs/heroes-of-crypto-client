import { expect, mock, test } from "bun:test";
import { FactionVals, type UnitProperties } from "@heroesofcrypto/common";
import { Container, Texture } from "pixi.js";

import { PixiGameManager } from "./PixiGameManager";
import { PixiScene } from "./PixiScene";
import { RankedPlayScene } from "../scenes/RankedPlayScene";
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

for (const [raw, expected] of [
    [
        "Artifact. All army units may move over and stand in lava; on central lava they gain Made of Fire (+10% to all stats and abilities).;;",
        "Artifact. All army units may move over and stand in lava; on central lava they gain Made of Fire (+10% to all stats and abilities).",
    ],
    ["Gain {} attack; gain {} armor;2;3", "Gain 2 attack; gain 3 armor"],
    ["Cross lava; fly over it.", "Cross lava; fly over it."],
]) {
    test(`unit inspection preserves the complete effect text: ${raw}`, () => {
        const { overlay } = createOverlay();
        try {
            const unit = overlay.getUnitProperties("Peasant");
            unit.applied_buffs = ["Lava Striders"];
            unit.applied_buffs_laps = [15];
            unit.applied_buffs_descriptions = [raw];
            unit.applied_buffs_powers = [0];
            unit.applied_debuffs = ["Quagmire"];
            unit.applied_debuffs_laps = [2];
            unit.applied_debuffs_descriptions = [raw];
            unit.applied_debuffs_powers = [0];
            const scene = Object.create(PixiScene.prototype) as PixiScene;
            const impact = scene.getUnitVisibleImpact(unit);
            expect(impact.buffs.find((buff) => buff.name === "Lava Striders")?.description).toBe(expected);
            expect(impact.debuffs.find((debuff) => debuff.name === "Quagmire")?.description).toBe(expected);
        } finally {
            overlay.destroy();
        }
    });
}

test("sandbox roster inspection emits separately, refreshes live stats, and clears when the pointer leaves", () => {
    const manager = new PixiGameManager();
    const unit = { name: "Peasant" } as UnitProperties;
    const impact = { abilities: [], buffs: [], debuffs: [] };
    const scene = {
        getUnitsOverlay: () => ({ getHoveredUnitProperties: () => unit }),
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

test("fight hover preserves the selected sidebar and clears an existing sandbox roster preview", () => {
    const manager = new PixiGameManager();
    const selected = { name: "Wolf" } as UnitProperties;
    const hovered = { name: "Peasant" } as UnitProperties;
    let rosterHover = hovered;
    const impact = { abilities: [], buffs: [], debuffs: [] };
    const scene = {
        sc_selectedUnitProperties: selected,
        sc_hoveredUnitProperties: hovered,
        getUnitsOverlay: () => ({ getHoveredUnitProperties: () => rosterHover }),
        sc_unitPropertiesUpdateNeeded: false,
        getUnitVisibleImpact: mock(() => impact),
    };
    const internal = manager as unknown as {
        m_scene: unknown;
        m_hoveringCanvas: boolean;
        started: boolean;
        updateUnitInspection(): void;
    };
    internal.m_scene = scene;
    internal.m_hoveringCanvas = true;
    const updates: (IUnitInspection | null)[] = [];
    manager.onUnitInspectionUpdated.connect((value) => updates.push(value));
    internal.updateUnitInspection();
    expect(updates).toEqual([{ unit: hovered, impact }]);

    internal.started = true;
    internal.updateUnitInspection();
    expect(updates.at(-1)).toBeNull();
    scene.sc_hoveredUnitProperties = { name: "Elf" } as UnitProperties;
    rosterHover = scene.sc_hoveredUnitProperties;
    scene.sc_unitPropertiesUpdateNeeded = true;
    internal.updateUnitInspection();
    expect(updates).toHaveLength(2);
    expect(scene.getUnitVisibleImpact).toHaveBeenCalledTimes(1);
    expect(scene.sc_selectedUnitProperties).toBe(selected);

    internal.started = false;
    internal.updateUnitInspection();
    expect(updates.at(-1)?.unit.name).toBe("Elf");
});

test.each([false, true])("board hover never replaces the selected sidebar, started=%s", (started) => {
    const manager = new PixiGameManager();
    const selected = { name: "Wolf" } as UnitProperties;
    const scene = {
        sc_selectedUnitProperties: selected,
        sc_hoveredUnitProperties: { name: "Peasant" } as UnitProperties,
        sc_unitPropertiesUpdateNeeded: true,
        getUnitsOverlay: () => ({ getHoveredUnitProperties: () => undefined }),
        getUnitVisibleImpact: mock(() => ({ abilities: [], buffs: [], debuffs: [] })),
    };
    const internal = manager as unknown as {
        m_scene: unknown;
        m_hoveringCanvas: boolean;
        started: boolean;
        updateUnitInspection(): void;
    };
    Object.assign(internal, { m_scene: scene, m_hoveringCanvas: true, started });
    const inspect = mock(() => undefined);
    manager.onUnitInspectionUpdated.connect(inspect);
    internal.updateUnitInspection();
    scene.sc_hoveredUnitProperties = { name: "Elf" } as UnitProperties;
    internal.updateUnitInspection();
    expect(inspect).not.toHaveBeenCalled();
    expect(scene.getUnitVisibleImpact).not.toHaveBeenCalled();
    expect(scene.sc_selectedUnitProperties).toBe(selected);
});

test("leaving the sandbox creature picker for a board unit clears its temporary preview", () => {
    const manager = new PixiGameManager();
    const selected = { name: "Wolf" } as UnitProperties;
    let rosterHover: UnitProperties | undefined = { name: "Peasant" } as UnitProperties;
    const scene = {
        sc_selectedUnitProperties: selected,
        sc_hoveredUnitProperties: { name: "Elf" } as UnitProperties,
        getUnitsOverlay: () => ({ getHoveredUnitProperties: () => rosterHover }),
        getUnitVisibleImpact: mock(() => ({ abilities: [], buffs: [], debuffs: [] })),
    };
    const internal = manager as unknown as {
        m_scene: unknown;
        m_hoveringCanvas: boolean;
        updateUnitInspection(): void;
    };
    Object.assign(internal, { m_scene: scene, m_hoveringCanvas: true });
    const updates: (IUnitInspection | null)[] = [];
    manager.onUnitInspectionUpdated.connect((value) => updates.push(value));
    internal.updateUnitInspection();
    expect(updates.at(-1)?.unit).toBe(rosterHover);
    rosterHover = undefined;
    internal.updateUnitInspection();
    expect(updates).toHaveLength(2);
    expect(updates.at(-1)).toBeNull();
    expect(scene.getUnitVisibleImpact).toHaveBeenCalledTimes(1);
    expect(scene.sc_selectedUnitProperties).toBe(selected);
});

test("ranked placement cannot inspect its hidden creature picker or hovered board unit", () => {
    const manager = new PixiGameManager();
    const hovered = { name: "Peasant" } as UnitProperties;
    const scene = Object.assign(Object.create(RankedPlayScene.prototype), {
        sandboxCoop: false,
        sc_hoveredUnitProperties: hovered,
        unitsOverlay: { getHoveredUnitProperties: () => hovered },
        getUnitVisibleImpact: mock(() => ({ abilities: [], buffs: [], debuffs: [] })),
    });
    expect(scene.getUnitsOverlay()).toBeUndefined();
    const internal = manager as unknown as {
        m_scene: unknown;
        m_hoveringCanvas: boolean;
        updateUnitInspection(): void;
    };
    Object.assign(internal, { m_scene: scene, m_hoveringCanvas: true });
    const inspect = mock(() => undefined);
    manager.onUnitInspectionUpdated.connect(inspect);
    internal.updateUnitInspection();
    expect(inspect).not.toHaveBeenCalled();
    expect(scene.getUnitVisibleImpact).not.toHaveBeenCalled();
});
