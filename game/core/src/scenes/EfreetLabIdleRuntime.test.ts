import { beforeAll, expect, test } from "bun:test";
import {
    AbilityFactory,
    EffectFactory,
    GridConstants,
    GridSettings,
    HoCConfig,
    TeamVals,
    Unit,
    UnitVals,
} from "@heroesofcrypto/common";
import { BufferImageSource, Container, DOMAdapter, Texture } from "pixi.js";
import { RenderableUnit } from "./RenderableUnit";

beforeAll(() => {
    if (typeof document === "undefined") {
        (globalThis as { document?: unknown }).document = {
            cookie: "",
            createElement: () => ({ getContext: () => null, setAttribute: () => undefined }),
            querySelector: () => null,
        };
    }
    DOMAdapter.set({
        ...DOMAdapter.get(),
        createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement,
    });
});

for (const labPreview of [false, true]) {
    test(`Efreet keeps fire and registration through all states with lab preview ${labPreview}`, () => {
        const grid = new GridSettings(
            GridConstants.GRID_SIZE,
            GridConstants.MAX_Y,
            GridConstants.MIN_Y,
            GridConstants.MAX_X,
            GridConstants.MIN_X,
            GridConstants.MOVEMENT_DELTA,
            GridConstants.UNIT_SIZE_DELTA,
        );
        const effects = new EffectFactory();
        const base = Unit.createUnit(
            HoCConfig.getCreatureConfig(TeamVals.LEFT, "Chaos", "Efreet", "efreet_512", 1),
            grid,
            TeamVals.LEFT,
            UnitVals.CREATURE,
            new AbilityFactory(effects),
            effects,
            false,
        );
        const texture = new Texture({
            source: new BufferImageSource({ resource: new Uint8Array(4), width: 8192, height: 8192 }),
        });
        const unit = RenderableUnit.fromBase(base, () => texture);
        const world = new Container();
        unit.setPosition(0, 1024);
        unit.ensureVisual(world, grid);
        unit.setCreatureAnimationLabPreviewEnabled(labPreview);
        unit.setBoardSelected(true);
        const state = unit as unknown as {
            selectionAnimFrames: Texture[];
            selectionAnimFrameIndex: number;
            selectionAnimationStartedAtMs: number;
            sprite: {
                y: number;
                texture: Texture;
                anchor: { x: number; y: number };
                scale: { x: number; y: number };
                filters: { resources: { fire: { uniforms: Record<string, number> } } }[];
            };
            walkAnim?: { frames: Texture[]; frameIndex: number; completedCycles: number };
            shadow?: { alpha: number };
            silhouetteShadow?: { alpha: number };
            oneShotAnim?: { frames: Texture[]; frameIndex: number; finished?: boolean; frameDurationsMs?: number[] };
        };
        expect(state.selectionAnimFrames).toHaveLength(36);
        for (const action of [
            "idle",
            "walk",
            "hit",
            "death",
            "cast",
            "melee_attack",
            "melee_attack_up",
            "melee_attack_down",
        ]) {
            expect(unit.getAnimationTextureKey(action)).toBe(`efreet_lab_${action === "walk" ? "idle" : action}_atlas`);
        }
        const start = state.selectionAnimationStartedAtMs;
        for (const elapsed of [5300, 11300, 17300]) {
            unit.stepSelectionAnimation(start + elapsed);
            expect(state.selectionAnimFrameIndex).toBe(29);
            expect(state.sprite.texture).toBe(state.selectionAnimFrames[29]);
        }
        unit.ensureVisual(world, grid);
        expect(unit.hasAnimationState("walk")).toBe(true);
        const idleScale = { x: state.sprite.scale.x, y: state.sprite.scale.y };
        const idleAnchor = state.sprite.anchor.y;
        expect(idleScale.x).toBeCloseTo(0.43854922279792746 * 0.9, 6);
        expect(idleScale.y).toBeCloseTo(-0.6210396634615385 * 0.9, 6);
        const expectLowerFireRegistration = () => {
            const lowerFireWorldY = state.sprite.y + (642 - state.sprite.anchor.y * 768) * state.sprite.scale.y;
            expect(lowerFireWorldY).toBeCloseTo(980.3151514423078, 6);
        };
        expectLowerFireRegistration();
        unit.startBoardWalkAnimation(1, 5.2, 1);
        unit.ensureVisual(world, grid);
        expect(state.sprite.scale.x).toBeGreaterThan(0);
        expect(state.walkAnim?.frames).toHaveLength(12);
        expect(state.sprite.anchor.y).toBe(idleAnchor);
        expectLowerFireRegistration();
        expect(state.sprite.scale.y).toBeCloseTo(idleScale.y, 6);
        expect(Math.abs(state.sprite.scale.x)).toBeCloseTo(Math.abs(idleScale.x), 6);
        const fire = state.sprite.filters.find((f) => f.resources?.fire)?.resources.fire.uniforms;
        expect(fire).toBeDefined();
        // Exact spatial boundaries, two loops, diagonal travel and a route corner.
        for (let step = 0; step <= 24; step++) {
            const distance = (step / 12) * 1.3;
            if (step === 15) {
                unit.setBoardFacingFromMovement(-1);
                unit.ensureVisual(world, grid);
                expect(state.sprite.scale.x).toBeLessThan(0);
            }
            unit.setBoardWalkDistanceCells(distance);
            expect(state.walkAnim?.frameIndex).toBe(step % 12);
            expect(state.walkAnim?.completedCycles).toBe(Math.floor(step / 12));
            expect(fire?.uWindPhase).toBeCloseTo((distance / 1.3) * Math.PI * 2, 6);
            expect(fire?.uClapping).toBe(0);
            const previousFrame = state.sprite.texture;
            unit.stepSelectionAnimation(start + 20000 + step * 200);
            expect(state.sprite.texture).toBe(previousFrame);
        }
        unit.setBoardWalkDistanceCells(Math.SQRT2);
        expect(state.walkAnim?.frameIndex).toBe(Math.floor(Math.SQRT2 / (1.3 / 12)) % 12);
        expect(unit.finishBoardWalkAnimationAfterFullCycle()).toBe(false);
        expect(state.walkAnim).toBeUndefined();
        unit.ensureVisual(world, grid);
        expect(state.sprite.anchor.y).toBe(idleAnchor);
        expectLowerFireRegistration();
        expect(state.sprite.filters.find((f) => f.resources?.fire)).toBeDefined();
        let hitComplete = 0;
        for (const action of ["melee_attack", "melee_attack_up", "melee_attack_down", "cast"]) {
            let complete = 0;
            expect(unit.hasAnimationState(action)).toBe(true);
            expect(unit.playOneShotAnimation(action, () => complete++)).toBe(true);
            expect(state.oneShotAnim?.frames).toHaveLength(8);
            expect(state.oneShotAnim?.frameDurationsMs?.reduce((sum, ms) => sum + ms, 0)).toBe(
                action === "cast" ? 1200 : 650,
            );
            const durations = [...state.oneShotAnim!.frameDurationsMs!];
            for (let frame = 0; frame < 8; frame++) {
                unit.ensureVisual(world, grid);
                expect(state.oneShotAnim?.frameIndex).toBe(frame);
                expect(state.sprite.texture.width).toBe(768);
                expect(state.sprite.texture.height).toBe(768);
                expect(state.sprite.anchor.x).toBe(0.5);
                expect(state.sprite.anchor.y).toBe(idleAnchor);
                expectLowerFireRegistration();
                expect(state.sprite.scale.y).toBeCloseTo(idleScale.y, 6);
                expect(Math.abs(state.sprite.scale.x)).toBeCloseTo(Math.abs(idleScale.x), 6);
                expect(fire?.uAuthoredReaction).toBe(1);
                expect(fire?.uMeleeFire).toBe(1);
                expect(fire?.uCastFire).toBe(action === "cast" ? 1 : 0);
                expect(fire?.uHitWidthScale).toBe(1);
                if (frame < 7) unit.stepOneShotAnimation(durations[frame]);
            }
            unit.stepOneShotAnimation(durations[7] - 1);
            expect(complete).toBe(0);
            unit.stepOneShotAnimation(1);
            expect(complete).toBe(1);
            expect(state.oneShotAnim).toBeUndefined();
            unit.ensureVisual(world, grid);
            expect(state.sprite.texture.width).toBe(512);
            expect(fire?.uMeleeFire).toBe(0);
            expect(fire?.uCastFire).toBe(0);
        }
        expect(unit.hasAnimationState("hit")).toBe(true);
        expect(unit.hasAnimationState("death")).toBe(true);
        unit.startBoardWalkAnimation(1, 3);
        expect(unit.playOneShotAnimation("hit", () => hitComplete++)).toBe(true);
        expect(state.walkAnim).toBeUndefined();
        expect(state.oneShotAnim?.frames).toHaveLength(8);
        expect(state.oneShotAnim?.frameDurationsMs?.reduce((sum, ms) => sum + ms, 0)).toBe(560);
        unit.ensureVisual(world, grid);
        expect(state.sprite.anchor.y).toBe(idleAnchor);
        expectLowerFireRegistration();
        expect(state.sprite.scale.y).toBeCloseTo(idleScale.y, 6);
        expect(Math.abs(state.sprite.scale.x)).toBeCloseTo(Math.abs(idleScale.x), 6);
        expect(fire?.uAuthoredReaction).toBe(1);
        unit.stepOneShotAnimation(45);
        expect(state.oneShotAnim?.frameIndex).toBe(1);
        unit.stepOneShotAnimation(514);
        expect(hitComplete).toBe(0);
        unit.stepOneShotAnimation(1);
        expect(hitComplete).toBe(1);
        expect(state.oneShotAnim).toBeUndefined();
        unit.ensureVisual(world, grid);
        expect(fire?.uAuthoredReaction).toBe(0);
        let deathComplete = 0;
        expect(unit.playOneShotAnimation("death", () => deathComplete++)).toBe(true);
        expect(state.oneShotAnim?.frames).toHaveLength(12);
        expect(state.oneShotAnim?.frameDurationsMs?.reduce((sum, ms) => sum + ms, 0)).toBeCloseTo(1280, 6);
        unit.ensureVisual(world, grid);
        expect(state.sprite.anchor.y).toBe(idleAnchor);
        expectLowerFireRegistration();
        expect(state.sprite.scale.y).toBeCloseTo(idleScale.y, 6);
        expect((state.sprite.filters ?? []).some((f) => f.resources?.fire)).toBe(false);
        unit.stepOneShotAnimation(1279);
        expect(deathComplete).toBe(0);
        unit.stepOneShotAnimation(1);
        expect(state.oneShotAnim?.frameIndex).toBe(11);
        expect(state.oneShotAnim?.finished).toBe(true);
        expect(deathComplete).toBe(1);
        const ashes = state.sprite.texture;
        unit.stepOneShotAnimation(5000);
        unit.ensureVisual(world, grid);
        expect(state.sprite.texture).toBe(ashes);
        expect(state.shadow?.alpha).toBe(0);
        expect(state.silhouetteShadow?.alpha ?? 0).toBe(0);
        expect(deathComplete).toBe(1);
        unit.returnToIdleAnimation(true);
        unit.ensureVisual(world, grid);
        expect(state.oneShotAnim).toBeUndefined();
        expect(state.sprite.anchor.y).toBe(idleAnchor);
        expectLowerFireRegistration();
        unit.destroyVisuals();
        world.destroy({ children: true });
    });
}
