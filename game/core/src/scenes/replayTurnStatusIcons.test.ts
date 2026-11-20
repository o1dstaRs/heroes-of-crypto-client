import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
    AbilityFactory,
    EffectFactory,
    FightStateManager,
    GridSettings,
    HoCConfig,
    TeamVals,
    Unit,
    UnitVals,
} from "@heroesofcrypto/common";

import { RenderableUnit } from "./RenderableUnit";
import { Sandbox, type SandboxSceneState, type SandboxSceneUnitState } from "./Sandbox";

/**
 * The hourglass and stun badges in a REPLAY.
 *
 * A replay never runs the live snapshot path: it turns each snapshot into a SandboxSceneState and hydrates
 * it, which destroys and rebuilds every unit. Three things the icons need therefore have to travel inside
 * that state, because a rebuilt unit cannot derive them:
 *   - `onHourglass`  — the wait flag (the engine sets it live in sandbox; nothing sets it on a rebuild),
 *   - `skipping`     — Stun/Blindness are EFFECTS, and effects are neither on the ranked wire nor rebuilt
 *                      from a unit's properties, so the stun badge could never light up in a replay,
 *   - `upNext`       — a hydrate resets FightStateManager, so the strip kept the queue it was last given.
 *
 * Behavioural coverage of the badges themselves lives in RenderableUnit.test.ts. The queue's restore inside a
 * full hydrate is driven in replayBoardTerrain.test.ts.
 */
const settings = new GridSettings(16, 2048, 0, 1024, -1024, 5, 0.06);
const originalFight = FightStateManager.getInstance().getFightProperties();
beforeEach(() => FightStateManager.getInstance().reset());
afterEach(() => FightStateManager.getInstance().setFightProperties(originalFight));

const createUnit = (name = "Squire"): RenderableUnit => {
    const effects = new EffectFactory();
    return RenderableUnit.fromBase(
        Unit.createUnit(
            HoCConfig.getCreatureConfig(TeamVals.LEFT, "Life", name, "", 1),
            settings,
            TeamVals.LEFT,
            UnitVals.CREATURE,
            new AbilityFactory(effects),
            effects,
            false,
        ),
        () => undefined,
    );
};

interface SceneInternals {
    createRenderableUnitFromSceneState(state: SandboxSceneUnitState): RenderableUnit;
    captureSceneState(): SandboxSceneState;
}

const scene = (units: RenderableUnit[] = []): SceneInternals => {
    const effects = new EffectFactory();
    return Object.assign(Object.create(Sandbox.prototype), {
        sc_sceneSettings: { getGridSettings: () => settings },
        abilityFactory: new AbilityFactory(effects),
        texAny: () => undefined,
        unitsHolder: { getAllUnits: () => new Map(units.map((unit) => [unit.getId(), unit])) },
        grid: {
            getOccupantUnitId: () => "",
            getArtifactBarrels: () => [],
            getScatteredMountainsStanding: () => [],
        },
        dungeonVisuals: { isCenterDried: () => false, hasScatteredMountains: () => false },
        getFightResultSetup: () => undefined,
    }) as SceneInternals;
};

const skippingForDisplay = (unit: Unit): boolean =>
    (Sandbox as unknown as { skippingForDisplay(unit: Unit): boolean }).skippingForDisplay(unit);

describe("replay turn-status icons", () => {
    test.each([true, false])("a rebuilt unit is given back its wait, stun and retaliation flags (%p)", (flag) => {
        const source = createUnit();
        const restored = scene().createRenderableUnitFromSceneState({
            properties: source.getAllProperties(),
            team: TeamVals.LEFT,
            placed: true,
            dead: false,
            cells: [{ x: 2, y: 2 }],
            baseCell: { x: 2, y: 2 },
            onHourglass: flag,
            skipping: flag,
            responded: flag,
        });

        expect(restored.isOnHourglass()).toBe(flag);
        expect(restored.isSkippingApplied()).toBe(flag);
        expect(skippingForDisplay(restored)).toBe(flag);
        expect(restored.getResponded()).toBe(flag);
        restored.destroyVisuals();
        source.destroyVisuals();
    });

    test("the capture records what a rebuild cannot recompute", () => {
        // Effects and FightProperties are both gone after a hydrate, so a sandbox replay needs all of these.
        // (The board half of the capture is covered in replayBoardTerrain.test.ts.)
        const waiting = createUnit();
        const stunned = createUnit("Peasant");
        waiting.setOnHourglass(true);
        stunned.setSkipping(true);
        stunned.setResponded(true);
        const fightProps = FightStateManager.getInstance().getFightProperties();
        fightProps.enqueueHourglass(waiting.getId());
        fightProps.enqueueUpNext(stunned.getId());
        fightProps.enqueueUpNext(waiting.getId());

        const state = scene([waiting, stunned]).captureSceneState();

        const byId = new Map(state.units.map((unit) => [unit.properties.id, unit]));
        expect(byId.get(waiting.getId())).toMatchObject({
            onHourglass: true,
            hasHourglassed: true,
            skipping: false,
            responded: false,
        });
        expect(byId.get(stunned.getId())).toMatchObject({
            onHourglass: false,
            hasHourglassed: false,
            skipping: true,
            responded: true,
        });
        expect(state.upNext).toEqual([...fightProps.getUpNextQueueIterable()]);
        expect(state.upNext).toHaveLength(2);
        waiting.destroyVisuals();
        stunned.destroyVisuals();
    });

    test("the Up Next strip reads the DISPLAYED skip state, which tolerates an engine-summoned plain Unit", () => {
        // In ranked (live and replay) the Stun effect never reaches the client, so the effect-only
        // isSkippingThisTurn() is always false there; the strip must read the synced flag a snapshot set.
        const synced = createUnit();
        synced.setSkipping(true);
        expect(synced.isSkippingThisTurn()).toBe(false);
        expect(skippingForDisplay(synced)).toBe(true);

        const effects = new EffectFactory();
        const plain = Unit.createUnit(
            HoCConfig.getCreatureConfig(TeamVals.LEFT, "Life", "Squire", "", 1),
            settings,
            TeamVals.LEFT,
            UnitVals.CREATURE,
            new AbilityFactory(effects),
            effects,
            true,
        );
        expect(skippingForDisplay(plain)).toBe(false);
        synced.destroyVisuals();

        // Building the strip needs the whole activation path, so its read is guarded at the source: no
        // queue entry may fall back to the effect-only check.
        const source = readFileSync(join(import.meta.dir, "Sandbox.ts"), "utf8");
        const activation = source.indexOf("private handleNextUnitActivation(");
        const strip = source.slice(
            source.indexOf("const unitsNext: IVisibleUnit[] = [];", activation),
            source.indexOf("this.sc_visibleState.upNext = unitsNext;", activation),
        );
        expect(strip.match(/isSkipping: Sandbox\.skippingForDisplay\(/g)).toHaveLength(2);
        expect(strip).not.toContain(".isSkippingThisTurn()");
    });
});
