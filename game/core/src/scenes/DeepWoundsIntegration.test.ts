import { describe, expect, spyOn, test } from "bun:test";
import { Assets, Container, Sprite, Texture, TextureSource } from "pixi.js";

import { RenderableUnit } from "./RenderableUnit";
import { Sandbox } from "./Sandbox";
import { CombatVisuals } from "./sandbox/CombatVisuals";
import type { ICombatVisualsContext } from "./sandbox/CombatVisuals";

describe("Deep Wounds panel to flag integration", () => {
    test.each([1, 2, 3] as const)(
        "button %s renders at the actual recipient flag centre and follows it",
        async (level) => {
            const atlas = new Texture({ source: new TextureSource({ width: 1536, height: 1536 }) });
            const load = spyOn(Assets, "load").mockResolvedValue(atlas as unknown as Record<string, unknown>);
            const unload = spyOn(Assets, "unload").mockResolvedValue();
            const badge = new Container();
            badge.position.set(120, 230);
            const root = new Container();
            const unit = Object.assign(Object.create(RenderableUnit.prototype), {
                badgeContainer: badge,
                getId: () => "recipient",
                getName: () => "Behemoth",
                isDead: () => false,
            }) as RenderableUnit;
            const visuals = new CombatVisuals({
                getGridSettings: () => ({ getCellSize: () => 64 }),
                getUnitsHolder: () => ({ getAllUnits: () => new Map([["recipient", unit]]) }),
                attachToWorldRoot: (container: Container) => root.addChild(container),
            } as unknown as ICombatVisualsContext);
            const scene = Object.assign(Object.create(Sandbox.prototype), {
                moveAnimManager: { isMoving: () => false },
                creatureAnimationLabPlacedUnit: () => ({ ok: true, unit }),
                combatVisuals: visuals,
            }) as Sandbox;
            try {
                const state = `deep_wounds_${level}` as "deep_wounds_1" | "deep_wounds_2" | "deep_wounds_3";
                expect(scene.playCreatureAnimationLabState(state).ok).toBe(true);
                for (let tick = 0; tick < 5; tick++) await Promise.resolve();
                expect(root.children).toHaveLength(1);
                const effect = root.children[0];
                const sprite = effect.children[0] as Sprite;
                expect(effect.position).toMatchObject({ x: 120, y: 230 });
                expect(sprite.anchor).toMatchObject({ x: 0.5, y: 0.5 });
                badge.position.set(160, 280);
                visuals.update(0);
                expect(effect.position).toMatchObject({ x: 160, y: 280 });
            } finally {
                visuals.clear();
                await Promise.resolve();
                load.mockRestore();
                unload.mockRestore();
            }
        },
    );
});
