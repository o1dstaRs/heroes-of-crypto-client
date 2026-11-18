import { expect, spyOn, test } from "bun:test";
import type { GridSettings, UnitsHolder } from "@heroesofcrypto/common";
import { Container, Texture } from "pixi.js";

import type { RenderableUnit } from "../RenderableUnit";
import { FLOATING_RESULT_DURATION_MS, OVERHEAD_EFFECT_DURATION_MS } from "../../settings/statusEffectTiming";
import { CombatVisuals } from "./CombatVisuals";

test.each(["buff", "debuff"] as const)(
    "a %s retains its height through the complete damage-to-effect lifetime",
    (kind) => {
        let now = 1000;
        const clock = spyOn(performance, "now").mockImplementation(() => now);
        const root = new Container();
        root.scale.y = -0.7;
        const anchor = { x: 100, y: 200, unitId: "unit" };
        const unit = {
            getId: () => "unit",
            isDead: () => false,
            getFlagEffectAnchor: () => anchor,
        } as unknown as RenderableUnit;
        const visuals = new CombatVisuals({
            legacyEffectsEnabled: false,
            getGridSettings: () => ({ getCellSize: () => 64 }) as GridSettings,
            attachToWorldRoot: (object) => root.addChild(object),
            getUnitsHolder: () => ({ getAllUnits: () => new Map([["unit", unit]]) }) as unknown as UnitsHolder,
            getSelectedUnitProperties: () => undefined,
            updateSelectedUnitProperties: () => undefined,
            setUnitPropertiesUpdateNeeded: () => undefined,
        });
        try {
            visuals.showFloatingDamage(anchor, 120, undefined, 0, undefined, undefined, anchor);
            visuals.spawnDebuffPop(anchor, Texture.WHITE, kind === "buff" ? "Blessing" : "Misfortune", 0, kind, unit);
            visuals.update(0);
            const pop = root.children.find((child) =>
                child.children.some((nested) => nested.label === "effect-caption"),
            )!;
            expect(pop).toBeDefined();
            const y = pop.y;
            // Additional impacts share horizontal result lanes instead of pushing this cue higher.
            visuals.showFloatingDamage(anchor, 30, undefined, 0, undefined, undefined, anchor);
            visuals.showFloatingDamage(anchor, 20, undefined, 0, undefined, undefined, anchor);
            visuals.update(0);
            expect(pop.y).toBe(y);
            // Another unit's taller damage/loss block must not reserve space for our flag.
            visuals.showFloatingDamage(anchor, 80, undefined, 4, undefined, undefined, {
                x: anchor.x + 20,
                y: anchor.y,
                unitId: "neighbor",
            });
            visuals.update(0);
            expect(pop.y).toBe(y);
            for (const age of [
                FLOATING_RESULT_DURATION_MS - 1,
                FLOATING_RESULT_DURATION_MS,
                FLOATING_RESULT_DURATION_MS + 1,
                1000,
                OVERHEAD_EFFECT_DURATION_MS - 1,
            ]) {
                now = 1000 + age;
                visuals.update(0);
                expect(pop.destroyed).toBe(false);
                expect(pop.y).toBe(y);
            }
            now = 1000 + OVERHEAD_EFFECT_DURATION_MS;
            visuals.update(0);
            expect(pop.destroyed).toBe(true);
        } finally {
            visuals.clear();
            root.destroy({ children: true });
            clock.mockRestore();
        }
    },
);
