import type { GridSettings, UnitsHolder } from "@heroesofcrypto/common";
import { expect, spyOn, test } from "bun:test";
import { Container, Text } from "pixi.js";

import { releaseBoardMirror, setBoardMirror } from "../../pixi/boardMirror";
import { CombatVisuals } from "./CombatVisuals";

test("Devour Essence shows the gained HP immediately above its essence cue with a body heal burst", () => {
    let now = 0;
    const clock = spyOn(performance, "now").mockImplementation(() => now);
    const root = new Container();
    const visuals = new CombatVisuals({
        legacyEffectsEnabled: false,
        getGridSettings: () => ({ getCellSize: () => 64 }) as GridSettings,
        getUnitsHolder: () => ({ getAllUnits: () => new Map() }) as unknown as UnitsHolder,
        attachToWorldRoot: (node, z) => {
            node.zIndex = z ?? 0;
            root.addChild(node);
        },
        getSelectedUnitProperties: () => undefined,
        updateSelectedUnitProperties: () => {},
        setUnitPropertiesUpdateNeeded: () => {},
    });
    try {
        visuals.showHealPop({ x: 100, y: 200 }, 37);
        const label = root.children.find((node) => node.children.some((child) => child instanceof Text))!;
        expect(label.children[0]).toBeInstanceOf(Text);
        expect((label.children[0] as Text).text).toBe("+37 HP");
        expect(label.alpha).toBe(1);
        expect(label.zIndex).toBe(5521);
        const burst = root.children.find((node) => node !== label)!;
        expect(burst).toBeDefined();
        now = 100;
        visuals.update(0.1);
        expect(burst.renderable).toBe(true);
        visuals.clear({ keepDetachedOverlays: true });
        expect(label.destroyed).toBe(false);
        now += 3_000;
        visuals.update(3);
        expect(label.destroyed).toBe(true);
        visuals.showHealPop({ x: 100, y: 200 }, 0);
        visuals.showHealPop({ x: 100, y: 200 }, NaN);
        expect(root.children).toHaveLength(0);
    } finally {
        visuals.clear();
        root.destroy({ children: true });
        clock.mockRestore();
    }
});

test("rejuvenation HP text stays readable on a mirrored battlefield", () => {
    const root = new Container();
    root.scale.set(-0.65, -0.65);
    const visuals = new CombatVisuals({
        getGridSettings: () => ({ getCellSize: () => 64 }) as GridSettings,
        getUnitsHolder: () => ({ getAllUnits: () => new Map() }) as unknown as UnitsHolder,
        attachToWorldRoot: (node) => {
            root.addChild(node);
        },
        getSelectedUnitProperties: () => undefined,
        updateSelectedUnitProperties: () => {},
        setUnitPropertiesUpdateNeeded: () => {},
    });
    setBoardMirror(visuals, true);
    try {
        visuals.showHealPop({ x: 100, y: 200 }, 37);
        const label = root.children.find((node) => node.children.some((child) => child instanceof Text))!;
        expect(label.scale.x * root.scale.x).toBeGreaterThan(0);
        expect(label.scale.y * root.scale.y).toBeGreaterThan(0);
        visuals.update(0.1);
        expect(label.scale.x * root.scale.x).toBeGreaterThan(0);
    } finally {
        visuals.clear();
        releaseBoardMirror(visuals);
        root.destroy({ children: true });
    }
});
