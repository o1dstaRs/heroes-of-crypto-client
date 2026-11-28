import { describe, expect, spyOn, test } from "bun:test";
import { Assets, Container, Sprite, Texture, TextureSource } from "pixi.js";

import { RenderableUnit } from "./RenderableUnit";
import { Sandbox } from "./Sandbox";
import { CombatVisuals } from "./sandbox/CombatVisuals";
import type { ICombatVisualsContext } from "./sandbox/CombatVisuals";

describe("Deep Wounds preview placement", () => {
    test.each([1, 2, 3] as const)("button %s draws on the recipient's sprite and follows its recoil", async (level) => {
        const atlas = new Texture({ source: new TextureSource({ width: 1536, height: 1536 }) });
        const load = spyOn(Assets, "load").mockResolvedValue(atlas as unknown as Record<string, unknown>);
        const unload = spyOn(Assets, "unload").mockResolvedValue();
        const root = new Container();
        const figure = new Sprite(Texture.WHITE);
        figure.anchor.set(0.5, 0.9);
        figure.width = 80;
        figure.height = 100;
        figure.scale.y *= -1;
        figure.position.set(120, 185);
        root.addChild(figure);
        const unit = Object.assign(Object.create(RenderableUnit.prototype), {
            sprite: figure,
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
            expect(root.children).toHaveLength(2);
            const effect = root.children[1];
            const sprite = effect.children[0] as Sprite;
            expect(effect.position).toMatchObject({ x: 120, y: 230 });
            expect(sprite.anchor).toMatchObject({ x: 0.5, y: 0.5 });
            figure.position.set(160, 235);
            visuals.update(0);
            expect(effect.position).toMatchObject({ x: 160, y: 280 });
        } finally {
            visuals.clear();
            await Promise.resolve();
            load.mockRestore();
            unload.mockRestore();
            root.destroy({ children: true });
            atlas.destroy(true);
        }
    });
});
