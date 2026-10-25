import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import roster from "../../../../heroes-of-crypto-common/src/configuration/creatures.json";
import { Container, DOMAdapter } from "pixi.js";
import { GridSettings } from "@heroesofcrypto/common";
import { MoveAnimationManager, type IMoveAnimationContext } from "./MoveAnimationManager";
import { NomadChargeDust } from "./NomadChargeDust";
import { nomadHoofDistance, stepChargeEarth, type EarthBody } from "./NomadChargeEarthPhysics";

const adapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement }),
);
afterAll(() => DOMAdapter.set(adapter));

function simulate(name: string, charge: boolean, steps: number[], hasAbility = true) {
    const root = new Container();
    const gs = new GridSettings(16, 1024, 0, 1024, 0, 64, 32);
    let position = { x: 200, y: 200 },
        gait = 0,
        complete = 0,
        facing: -1 | 1 = 1;
    const samples: { x: number; y: number; gait: number }[] = [];
    const blur: number[] = [];
    const unit = {
        getUnitProperties: () => ({ name }),
        hasAbilityActive: () => hasAbility,
        canFly: () => false,
        isSmallSize: () => false,
        getName: () => name,
        getPosition: () => position,
        setPosition: (x: number, y: number) => {
            position = { x, y };
        },
        setBoardFacingFromMovement: (dx: number) => {
            if (dx) facing = dx < 0 ? -1 : 1;
        },
        getBoardFacingDirection: () => facing,
        getProjectileGroundPoint: () => position,
        startBoardWalkAnimation: () => {},
        stopBoardWalkAnimation: () => {},
        finishBoardWalkAnimationAfterFullCycle: () => {},
        syncVisual: () => {},
        setSpriteRotation: () => {},
        setBoardWalkDistanceCells: (d: number) => {
            gait = d;
        },
        setMotionBlur: (b: number) => blur.push(b),
        createAfterimageSprite: () => undefined,
    };
    const manager = new MoveAnimationManager({
        getGridSettings: () => gs,
        getWorldRoot: () => root,
        setMoveBlocked: () => {},
        updateSceneLog: () => {},
        requestVisibleStateUpdate: () => {},
        getHoverManager: () => ({ setSilhouetteLocked: () => {}, clearHoverSilhouette: () => {} }),
    } as unknown as IMoveAnimationContext);
    manager.startMoveAnimation(
        unit as never,
        [
            { x: 200, y: 200 },
            { x: 264, y: 264 },
            { x: 200, y: 328 },
        ],
        180,
        { x: 3, y: 5 },
        undefined,
        () => complete++,
        charge,
    );
    let arrivalAge = -1;
    const visibilityAfterArrival: number[] = [];
    for (const dt of steps) {
        if (arrivalAge >= 0) arrivalAge += dt;
        manager.update(dt);
        if (arrivalAge < 0 && position.x === 200 && position.y === 328) arrivalAge = 0;
        if (arrivalAge >= 0.3) visibilityAfterArrival.push(root.children.filter((c) => c.visible).length);
        samples.push({ ...position, gait });
    }
    const emitted = root.children.length;
    manager.cancel();
    expect(root.children.length).toBe(0);
    root.destroy();
    return { samples, complete, blur, emitted, visibilityAfterArrival };
}

describe("Nomad Rapid Charge", () => {
    test("doubles only the gait; keeps every position and the melee completion tick identical through a corner", () => {
        const steps = Array.from({ length: 120 }, (_, i) => (i % 3 === 0 ? 1 / 30 : 1 / 60));
        const before = simulate("Knight", true, steps);
        const after = simulate("Nomad", true, steps);
        expect(after.complete).toBe(1);
        expect(before.complete).toBe(after.complete);
        for (let i = 0; i < steps.length; i++) {
            expect(after.samples[i].x).toBe(before.samples[i].x);
            expect(after.samples[i].y).toBe(before.samples[i].y);
            expect(after.samples[i].gait).toBeCloseTo(before.samples[i].gait * 2, 9);
        }
        expect(after.blur.every((b) => b === 0)).toBe(true);
        expect(after.emitted).toBeGreaterThan(0);
        expect(after.visibilityAfterArrival.length).toBeGreaterThan(0);
        expect(after.visibilityAfterArrival.every((count) => count === 0)).toBe(true);
    });
    test("every catalog Rapid Charge owner gets debris, no blur, and a 0.3 s arrival cleanup", () => {
        const owners = Object.values(roster)
            .filter((f) => typeof f === "object")
            .flatMap((f) => Object.values(f))
            .filter((c) => c.abilities.includes("Rapid Charge"));
        expect(owners.map((c) => c.name).sort()).toEqual(["Champion", "Nomad", "Wolf Rider"]);
        const steps = Array.from({ length: 180 }, () => 1 / 60);
        for (const owner of owners) {
            const result = simulate(owner.name, true, steps);
            expect(result.emitted).toBeGreaterThan(0);
            expect(result.complete).toBe(1);
            expect(result.blur.every((b) => b === 0)).toBe(true);
            expect(result.visibilityAfterArrival.length).toBeGreaterThan(0);
            expect(result.visibilityAfterArrival.every((n) => n === 0)).toBe(true);
            expect(simulate(owner.name, false, steps).emitted).toBe(0);
            expect(simulate(owner.name, true, steps, false).emitted).toBe(0);
        }
    });
    test("ordinary Nomad movement retains its cadence and has no charge particles", () => {
        const steps = [0, 0.1, 0.3, 0.2];
        expect(simulate("Nomad", false, steps)).toEqual(simulate("Knight", false, steps));
    });
    test("hoof contacts repeat at authored support phases, independent of path segmentation", () => {
        expect([0, 1, 2, 3, 4].map(nomadHoofDistance)).toEqual([0, 0.24375000000000002, 0.325, 0.56875, 0.65]);
    });
    test("debris loses energy, bounces no more than twice, and settles on the floor", () => {
        const body: EarthBody = { x: 0, y: 0, z: 0, vx: -100, vy: 40, vz: 160, bounces: 0 };
        const impacts: number[] = [];
        for (let i = 0; i < 360; i++) if (stepChargeEarth(body, 1 / 120, 64)) impacts.push(body.vz);
        expect(impacts.length).toBe(2);
        expect(impacts[1]).toBeLessThan(impacts[0]);
        expect(body.z).toBe(0);
        expect(Math.abs(body.vx)).toBeLessThan(0.001);
        expect(body.x).toBeLessThan(0);
    });
    test("a saturated pool keeps emitting at the newest hoof contact", () => {
        const root = new Container();
        const dust = new NomadChargeDust(root);
        for (let i = 0; i < 80; i++) {
            dust.contact(i, 0, 64, 1, 0);
            dust.update(1 / 240);
        }
        dust.contact(10000, 0, 64, 1, 0);
        dust.update(1 / 60);
        expect(root.children.filter((c) => c.visible && c.x > 9900).length).toBeGreaterThan(2);
        dust.destroy();
        root.destroy();
    });
    test("arrival fades every layer within 0.3 seconds, even across a large frame", () => {
        for (const steps of [[0.15, 0.149, 0.001], [0.3], [0.5]]) {
            const root = new Container();
            const dust = new NomadChargeDust(root);
            dust.contact(0, 0, 64, 1, 0);
            dust.update(0.1);
            dust.finish();
            for (const dt of steps) dust.update(dt);
            expect(root.children.every((c) => !c.visible)).toBe(true);
            dust.update(0.5);
            expect(root.children.every((c) => !c.visible)).toBe(true);
            dust.contact(1000, 0, 64, 1, 0);
            dust.update(0.05);
            expect(root.children.some((c) => c.visible && c.x > 900)).toBe(true);
            dust.destroy();
            root.destroy();
        }
    });
    test("arrival fade is smooth and repeating finish does not extend the deadline", () => {
        const root = new Container();
        const dust = new NomadChargeDust(root);
        dust.contact(0, 0, 64, 1, 0);
        dust.update(0.05);
        dust.finish();
        dust.update(0.15);
        expect(root.children.some((c) => c.visible)).toBe(true);
        expect(root.children.filter((c) => c.visible).every((c) => c.alpha <= 0.5)).toBe(true);
        dust.finish();
        dust.update(0.15);
        expect(root.children.every((c) => !c.visible)).toBe(true);
        dust.destroy();
        root.destroy();
    });
    test("long repeated charges have bounded display objects and dispose all owned resources", () => {
        const root = new Container();
        const dust = new NomadChargeDust(root);
        for (let i = 0; i < 300; i++) {
            dust.contact(i, 0, 64, 1, 0);
            dust.update(1 / 120);
        }
        expect(root.children.length).toBeLessThanOrEqual(48 + 128 * 2);
        for (let i = 0; i < 240; i++) dust.update(1 / 120);
        expect(root.children.every((c) => !c.visible)).toBe(true);
        dust.destroy();
        expect(root.children.length).toBe(0);
        root.destroy();
    });
});
