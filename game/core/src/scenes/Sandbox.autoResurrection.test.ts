import { beforeAll, describe, expect, mock, test } from "bun:test";
import {
    AbilityFactory,
    EffectFactory,
    Grid,
    GridConstants,
    GridMath,
    GridSettings,
    GridVals,
    HoCConfig,
    TeamVals,
    Unit,
    UnitsHolder,
    UnitVals,
    type GameEvent,
    type TeamType,
} from "@heroesofcrypto/common";
import { BufferImageSource, Container, Texture, type Sprite } from "pixi.js";
import { animationAtlases } from "../generated/animation_atlases";
import { RenderableUnit } from "./RenderableUnit";
import { RankedPlayScene } from "./RankedPlayScene";
import { Sandbox } from "./Sandbox";

beforeAll(() => {
    if (typeof document === "undefined")
        (globalThis as { document?: unknown }).document = {
            cookie: "",
            createElement: () => ({ getContext: () => null, setAttribute: () => {} }),
            querySelector: () => null,
        };
});

const texture = (width: number, height: number) =>
    new Texture({ source: new BufferImageSource({ resource: new Uint8Array(4), width, height }) });
const baseTexture = texture(768, 768);
const atlases = Object.fromEntries(
    ["idle", "death", "hit", "cast", "melee_attack"].map((state) => {
        const meta = animationAtlases["Angel Lab"][state];
        return [`angel_lab_${state}_atlas`, texture(meta.atlasWidth, meta.atlasHeight)];
    }),
);
type Resurrection = Extract<GameEvent, { type: "unit_resurrected" }>;
type Scene = {
    syncResurrectedUnit(event: Resurrection, units: ReadonlyMap<string, RenderableUnit>): void;
    destroySpecificUnits(units: RenderableUnit[], force: boolean, isDead: boolean): void;
};

function fixture(mode: "legacy" | "sandbox" | "ranked", team: TeamType, amount: number) {
    const gs = new GridSettings(
        GridConstants.GRID_SIZE,
        GridConstants.MAX_Y,
        GridConstants.MIN_Y,
        GridConstants.MAX_X,
        GridConstants.MIN_X,
        GridConstants.MOVEMENT_DELTA,
        GridConstants.UNIT_SIZE_DELTA,
    );
    const grid = new Grid(gs, GridVals.NORMAL);
    const effects = new EffectFactory();
    const unit = RenderableUnit.fromBase(
        Unit.createUnit(
            HoCConfig.getCreatureConfig(team, "Life", "Angel", "angel_512", amount),
            gs,
            team,
            UnitVals.CREATURE,
            new AbilityFactory(effects),
            effects,
            false,
        ),
        (key) => atlases[key] ?? baseTexture,
    );
    const unitsHolder = new UnitsHolder(grid);
    unitsHolder.addUnit(unit);
    const root = new Container();
    const position = GridMath.getPositionForCell({ x: 4, y: 4 }, gs.getMinX(), gs.getStep(), gs.getHalfStep())!;
    unit.setPosition(position.x, position.y);
    unit.setCreatureAnimationLabPreviewEnabled(true);
    unit.ensureVisual(root, gs);
    const view = unit as unknown as { sprite: Sprite };
    const idleTexture = view.sprite.texture;
    const idleScale = view.sprite.scale.clone();
    const idleAnchor = view.sprite.anchor.clone();
    const pending: (() => void)[] = [];
    const scene = Object.assign(Object.create(mode === "ranked" ? RankedPlayScene.prototype : Sandbox.prototype), {
        unitsHolder,
        grid,
        layoutVersion: 0,
        drawer: { getUnitsContainer: () => root },
        sc_sceneSettings: { getGridSettings: () => gs },
        sc_sceneLog: { updateLog: () => {} },
        combatVisuals: { spawnAngelResurrectionPop: mock() },
        renderResurrectionVfx: mock(),
        scheduleSceneTimeout: (callback: () => void) => pending.push(callback),
    }) as Scene;

    const resurrect = () => {
        const hp = unit.getMaxHp();
        unit.setRemainingStats(0, 0, amount);
        if (mode === "legacy") {
            scene.destroySpecificUnits([unit], true, true);
        } else {
            if (mode === "sandbox") expect(unitsHolder.deleteUnitById(unit.getId(), true)).toBe(false);
            scene.syncResurrectedUnit(
                {
                    type: "unit_resurrected",
                    unitId: unit.getId(),
                    team,
                    amount: Math.max(1, Math.floor(amount / 2)),
                    hp,
                    position,
                },
                new Map([[unit.getId(), unit]]),
            );
        }
    };
    return {
        unit,
        view,
        idleTexture,
        idleScale,
        idleAnchor,
        pending,
        resurrect,
        cleanup: () => {
            unit.destroyVisuals();
            root.destroy({ children: true });
        },
    };
}

describe("Angel automatic resurrection presentation", () => {
    for (const mode of ["legacy", "sandbox", "ranked"] as const)
        for (const team of [TeamVals.LEFT, TeamVals.RIGHT])
            test.each([1, 5])(`${mode}, team ${team}, stack %s returns to a living pose`, (amount) => {
                const f = fixture(mode, team, amount);
                try {
                    f.resurrect();
                    expect(f.unit.isDead()).toBe(false);
                    expect(f.unit.getAmountAlive()).toBe(Math.max(1, Math.floor(amount / 2)));
                    expect(f.unit.isPlayingOneShotAnimation("death")).toBe(true);
                    f.unit.stepOneShotAnimation(10_000);
                    expect(f.pending).toHaveLength(1);
                    expect(f.view.sprite.alpha).toBe(0.25);
                    const corpseTexture = f.view.sprite.texture;

                    // Run the scene's delayed rise immediately; the test never sleeps in real time.
                    f.pending.shift()!();
                    f.unit.stepSpawnAnimation(1);
                    expect(f.unit.isPlayingOneShotAnimation()).toBe(false);
                    expect(f.view.sprite.texture).toBe(f.idleTexture);
                    expect(f.view.sprite.texture).not.toBe(corpseTexture);
                    expect(f.view.sprite.visible).toBe(true);
                    expect(f.view.sprite.alpha).toBe(1);
                    expect(f.view.sprite.scale.x).toBeCloseTo(f.idleScale.x);
                    expect(f.view.sprite.scale.y).toBeCloseTo(f.idleScale.y);
                    expect(f.view.sprite.anchor.x).toBe(f.idleAnchor.x);
                    expect(f.view.sprite.anchor.y).toBe(f.idleAnchor.y);

                    // A later real death must still retain its corpse pose, with no repeated rise.
                    f.unit.setRemainingStats(0, 0, amount);
                    expect(f.unit.playOneShotAnimation("death")).toBe(true);
                    f.unit.stepOneShotAnimation(10_000);
                    expect(f.unit.isPlayingOneShotAnimation("death")).toBe(true);
                    expect(f.view.sprite.texture).toBe(corpseTexture);
                    expect(f.pending).toHaveLength(0);
                } finally {
                    f.cleanup();
                }
            });
});
