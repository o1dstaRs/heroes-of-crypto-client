import { describe, expect, test } from "bun:test";
import { Container, Rectangle, Sprite, Texture } from "pixi.js";
import type { GridSettings } from "@heroesofcrypto/common";
import { RenderableUnit } from "./RenderableUnit";
import { Sandbox } from "./Sandbox";

const gs = {} as GridSettings;

describe("projectiles hit the visible body", () => {
    test("Orc waist stays fixed across padded attack canvases and both facings", () => {
        for (const facing of [-1, 1]) {
            const root = new Container();
            root.scale.set(1.3, -0.8);
            const sprite = new Sprite(new Texture({ frame: new Rectangle(0, 0, 768, 768) }));
            root.addChild(sprite);
            sprite.position.set(200, 100);
            sprite.anchor.set(0.5, 730 / 768);
            sprite.scale.set(facing * 0.2, -0.2);
            const unit = Object.assign(Object.create(RenderableUnit.prototype), {
                sprite,
                getName: () => "Orc",
            }) as RenderableUnit;
            const idle = unit.getProjectileImpactPoint(gs);
            expect(idle.x).toBeCloseTo(200);
            expect(idle.y).toBeCloseTo(166);
            sprite.texture = new Texture({ frame: new Rectangle(0, 0, 1280, 1024) });
            sprite.anchor.set(0.5, 970 / 1024);
            const attack = unit.getProjectileImpactPoint(gs);
            expect(attack.x).toBeCloseTo(idle.x);
            expect(attack.y).toBeCloseTo(idle.y);
            root.destroy({ children: true });
        }
    });

    test("replays retain actual interceptors and captured anchors after their removal", () => {
        const victim = { getProjectileImpactPoint: () => ({ x: 300, y: 160 }) };
        const units = new Map([["screen", victim]]);
        const scene = Object.assign(Object.create(Sandbox.prototype), {
            unitsHolder: { getAllUnits: () => units },
            sc_sceneSettings: { getGridSettings: () => gs },
        });
        for (const intercepted of [false, true]) {
            const impact = { targetUnitId: "screen", targetPosition: { x: 320, y: 80 }, intercepted };
            const result = scene.resolveRangeProjectilePlaybackTarget(impact, {});
            expect(result.target).toBe(victim);
            expect(result.position).toEqual({ x: 300, y: 160 });
        }
        units.clear();
        const result = scene.resolveRangeProjectilePlaybackTarget(
            { targetUnitId: "screen", targetPosition: { x: 320, y: 80 }, intercepted: true },
            {},
            { x: 300, y: 160 },
        );
        expect(result.position).toEqual({ x: 300, y: 160 });
    });

    test("outgoing and counter replay shots use each receiving figure's torso", async () => {
        const launches: unknown[] = [];
        const scene = Object.assign(Object.create(Sandbox.prototype), {
            sc_sceneSettings: { getGridSettings: () => gs },
            fireUnitProjectile: async (_unit: unknown, opts: unknown) => launches.push(opts),
        });
        const unit = (x: number) => ({
            getName: () => "Orc",
            hasAbilityActive: () => false,
            getVisualCenter: () => ({ x, y: 0 }),
            getProjectileImpactPoint: () => ({ x, y: 66 }),
            getRangedProjectileOrigin: () => ({ x, y: 80 }),
        });
        const left = unit(100);
        const right = unit(400);
        await scene.playReplayProjectile(left, right);
        await scene.playReplayProjectile(right, left);
        expect(launches).toMatchObject([
            { from: { x: 100, y: 80 }, to: { x: 400, y: 66 } },
            { from: { x: 400, y: 80 }, to: { x: 100, y: 66 } },
        ]);
    });
});
