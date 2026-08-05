import { describe, expect, test } from "bun:test";

import {
    AbilityFactory,
    CreatureVals,
    EffectFactory,
    FightStateManager,
    Grid,
    GridConstants,
    GridMath,
    GridSettings,
    GridVals,
    TeamVals,
    Unit,
    UnitVals,
    UnitsHolder,
    scatteredMountainsForSeed,
    type GameEvent,
} from "@heroesofcrypto/common";

import type { AuthoritativeGameSnapshot, AuthoritativeUnitState } from "../game_action_transport";
import {
    authoritativeSnapshotToSandboxSceneState,
    planScatteredMountainSync,
    applyRankedUnitMechanicalEffects,
    applyRankedUnitSnapshotStats,
    effectsAppliedSceneLogLines,
    rankedUnitMechanicsMatch,
    rankedUnitAliveHealth,
    rankedSecondarySceneLogLines,
    rankedSpellPrimaryDamageSummary,
    rankedUnitStartAmount,
    rankedUnitStartHealth,
    multiHitSceneLogLines,
    restoreRankedStepsMoraleMultiplier,
    revealedOpponentRowScale,
    revealedOpponentRowX,
    revealedOpponentRowY,
    shouldPublishRankedFinish,
    spellAbilityTransferSceneLogSuffix,
    spellCastNarratedPairs,
    spellOutcomeSceneLogLines,
} from "./RankedPlayScene";
import { RenderableUnit } from "./RenderableUnit";
import { shouldDisplayAppliedBuff } from "../pixi/PixiScene";

const unitState = (overrides: Partial<AuthoritativeUnitState>): AuthoritativeUnitState => ({
    id: "unit",
    team: TeamVals.LOWER,
    name: "Peasant",
    creatureId: CreatureVals.PEASANT,
    amountAlive: 10,
    amountDied: 0,
    hp: 10,
    maxHp: 10,
    attackType: 0,
    size: 1,
    baseCell: { x: 0, y: 0 },
    cells: [],
    speed: 0,
    morale: 0,
    dead: false,
    placed: false,
    stackPower: 0,
    rangeShots: 0,
    luck: 0,
    onHourglass: false,
    ...overrides,
});

const placementSnapshot = (units: AuthoritativeUnitState[]): AuthoritativeGameSnapshot => ({
    gameId: "game-1",
    viewerTeam: TeamVals.LOWER,
    phase: 1,
    gridType: 1,
    currentLap: 0,
    fightStarted: false,
    fightFinished: false,
    currentUnitId: "",
    currentTurnTeam: 0,
    latestSequence: 1,
    narrowingLayers: 0,
    centerDried: false,
    units,
    upNext: [],
});

describe("ranked placement scene state", () => {
    test("carries authoritative mountain HP into the scene state for reconnect hydrates", () => {
        // The live report (game 89ec52d4 on prod): the right BLOCK_CENTER mountain was mined to 0 and
        // the server legally moved a Frenzied Boar onto its freed cells, but a client that loads after
        // the fact never sees the obstacle_attacked events (SSE starts after the snapshot's sequence)
        // and re-drew the destroyed rock solid — with the boar standing on it. The snapshot now carries
        // the counts, and hydrateSceneState prefers them and re-clears a side at 0.
        const withHits = authoritativeSnapshotToSandboxSceneState({
            ...placementSnapshot([]),
            gridType: 4,
            fightStarted: true,
            centerObstacleHitsLeft: 2,
            centerObstacleHitsRight: 0,
        });
        expect(withHits.obstacleHitsLeftLeft).toBe(2);
        expect(withHits.obstacleHitsLeftRight).toBe(0);

        // An older server omits the fields — the scene must keep its locally-tracked values.
        const withoutHits = authoritativeSnapshotToSandboxSceneState(placementSnapshot([]));
        expect(withoutHits.obstacleHitsLeftLeft).toBeUndefined();
        expect(withoutHits.obstacleHitsLeftRight).toBeUndefined();
    });

    test("restores the server movement penalty used by ranked AI pathfinding", () => {
        const manager = FightStateManager.getInstance();
        manager.reset();
        const fightProperties = manager.getFightProperties();

        try {
            expect(restoreRankedStepsMoraleMultiplier(0.15)).toBe(true);
            expect(fightProperties.getStepsMoraleMultiplier()).toBeCloseTo(0.15);
            expect(restoreRankedStepsMoraleMultiplier(0.15)).toBe(false);

            // An older snapshot omits the field; it must clear any value retained from a previous game.
            expect(restoreRankedStepsMoraleMultiplier(undefined)).toBe(true);
            expect(fightProperties.getStepsMoraleMultiplier()).toBe(0);
        } finally {
            manager.reset();
        }
    });

    test("publishes terminal stats when finishFight retained a pre-final ranked report", () => {
        const terminalSnapshot = {
            ...placementSnapshot([]),
            phase: 3,
            fightStarted: true,
            fightFinished: true,
        };
        const preFinalStats = {
            winner: TeamVals.NO_TEAM,
            series: [],
            lowerDeaths: [],
            upperDeaths: [],
            lowerStartTotal: 10,
            upperStartTotal: 12,
            lowerKilledTotal: 0,
            upperKilledTotal: 0,
            totalLaps: 1,
        };
        const visibleStateAfterFinishEvent = {
            hasFinished: true,
            teamWin: TeamVals.UPPER,
            fightStats: preFinalStats,
        };

        // A terminal snapshot must replace these pre-final stats even though their roster totals are
        // populated. The results overlay requires fightStats.winner to match teamWin.
        expect(shouldPublishRankedFinish(terminalSnapshot, visibleStateAfterFinishEvent)).toBe(true);
        expect(
            shouldPublishRankedFinish(terminalSnapshot, {
                ...visibleStateAfterFinishEvent,
                fightStats: { ...preFinalStats, winner: TeamVals.UPPER },
            }),
        ).toBe(false);
        expect(
            shouldPublishRankedFinish(terminalSnapshot, {
                ...visibleStateAfterFinishEvent,
                fightStats: { ...preFinalStats, winner: TeamVals.LOWER },
            }),
        ).toBe(true);
    });

    test("carries server-computed morale and speed onto reconstructed units", () => {
        const state = authoritativeSnapshotToSandboxSceneState(
            placementSnapshot([unitState({ id: "own", team: TeamVals.LOWER, morale: 9, speed: 7 })]),
        );
        const own = state.units.find((unit) => unit.properties.id === "own");
        // The server (common engine) computes these and ships them in the snapshot; the client must
        // not reset them to base creature config.
        expect(own?.properties.morale).toBe(9);
        expect(own?.properties.speed).toBe(7);
    });

    test("carries the server hasHourglassed flag onto reconstructed units (drives ranked canHourglass sync)", () => {
        const state = authoritativeSnapshotToSandboxSceneState(
            placementSnapshot([
                unitState({ id: "waited", team: TeamVals.LOWER, hasHourglassed: true }),
                unitState({ id: "fresh", team: TeamVals.LOWER, hasHourglassed: false }),
            ]),
        );
        // Sandbox.applyAuthoritativeSnapshot folds this per-unit flag into fightProperties.alreadyHourglass so
        // the ranked client's canHourglass matches the server (else the AI re-requests a rejected wait -> skip).
        expect(state.units.find((unit) => unit.properties.id === "waited")?.hasHourglassed).toBe(true);
        expect(state.units.find((unit) => unit.properties.id === "fresh")?.hasHourglassed).toBe(false);
    });

    test("populates applied_debuffs (name/laps/description) so the ranked HUD renders server-applied effects", () => {
        const state = authoritativeSnapshotToSandboxSceneState(
            placementSnapshot([
                unitState({
                    id: "victim",
                    team: TeamVals.UPPER,
                    debuffs: ["Deep Wounds"],
                    debuffLaps: [3],
                    debuffDescriptions: ["Next attack with Deep Wounds ability will deal 12% more damage."],
                }),
            ]),
        );
        // The ranked client can't run the engine, so it fills the DISPLAY arrays (only) from the snapshot; the
        // HUD reads applied_debuffs to show combat debuffs/effects (Deep Wounds, Rime slow, Shatter Armor, …).
        const props = state.units.find((unit) => unit.properties.id === "victim")?.properties;
        expect(props?.applied_debuffs).toEqual(["Deep Wounds"]);
        expect(props?.applied_debuffs_laps).toEqual([3]);
        expect(props?.applied_debuffs_descriptions).toEqual([
            "Next attack with Deep Wounds ability will deal 12% more damage.",
        ]);
        // All four applied_debuffs* arrays MUST be equal length: deleteBuff/deleteDebuff only prune them
        // when the lengths match, so a desynced powers array made artifact-debuff cleanup silently no-op
        // and every refreshUnits() re-appended the cursed-artifact marker (the "million debuffs" runaway).
        expect(props?.applied_debuffs_powers).toEqual([0]);
        expect(props?.applied_debuffs_powers?.length).toBe(props?.applied_debuffs?.length);
    });

    test("mechanically applies and clears ranked Break before Angelic Host refresh", () => {
        FightStateManager.getInstance().reset();
        const angelCell = { x: 2, y: 2 };
        const flyerCell = { x: 10, y: 8 };
        const snapshotWithBreak = authoritativeSnapshotToSandboxSceneState({
            ...placementSnapshot([
                unitState({
                    id: "angel",
                    name: "Angel",
                    creatureId: CreatureVals.ANGEL,
                    placed: true,
                    baseCell: angelCell,
                    cells: [angelCell],
                    debuffs: ["Break", "Deep Wounds"],
                    debuffLaps: [1, 3],
                    debuffDescriptions: [
                        "Disables all the unit's abilities for one turn.",
                        "Next attack with Deep Wounds ability will deal 12% more damage.",
                    ],
                }),
                unitState({
                    id: "flyer",
                    name: "Griffin",
                    creatureId: CreatureVals.GRIFFIN,
                    placed: true,
                    baseCell: flyerCell,
                    cells: [flyerCell],
                }),
            ]),
            phase: 2,
            fightStarted: true,
            currentLap: 1,
        });
        const angelState = snapshotWithBreak.units.find((state) => state.properties.id === "angel")!;
        const flyerState = snapshotWithBreak.units.find((state) => state.properties.id === "flyer")!;

        // Break is the sole mechanical effect reconstructed from ranked's combined debuff/effect list;
        // unrelated effects remain display-only and their parallel metadata stays aligned.
        expect(angelState.mechanicalBreakLaps).toBe(1);
        expect(angelState.properties.applied_debuffs).toEqual(["Deep Wounds"]);
        expect(angelState.properties.applied_debuffs_laps).toEqual([3]);
        expect(angelState.properties.applied_debuffs_descriptions).toEqual([
            "Next attack with Deep Wounds ability will deal 12% more damage.",
        ]);

        const gridSettings = new GridSettings(
            GridConstants.GRID_SIZE,
            GridConstants.MAX_Y,
            GridConstants.MIN_Y,
            GridConstants.MAX_X,
            GridConstants.MIN_X,
            GridConstants.MOVEMENT_DELTA,
            GridConstants.UNIT_SIZE_DELTA,
        );
        const grid = new Grid(gridSettings, GridVals.NORMAL);
        const unitsHolder = new UnitsHolder(grid);
        const makeRenderable = (properties: typeof angelState.properties): RenderableUnit => {
            const effectFactory = new EffectFactory();
            return RenderableUnit.fromBase(
                Unit.createUnit(
                    structuredClone(properties),
                    gridSettings,
                    properties.team,
                    UnitVals.CREATURE,
                    new AbilityFactory(effectFactory),
                    effectFactory,
                    false,
                ),
                undefined as never,
            );
        };
        const place = (unit: RenderableUnit, cell: { x: number; y: number }): void => {
            const position = GridMath.getPositionForCell(
                cell,
                gridSettings.getMinX(),
                gridSettings.getStep(),
                gridSettings.getHalfStep(),
            );
            unit.setPosition(position.x, position.y);
            grid.occupyCell(
                cell,
                unit.getId(),
                unit.getTeam(),
                unit.getAttackRange(),
                unit.hasAbilityActive("Made of Fire"),
                unit.hasAbilityActive("Made of Water"),
            );
            unitsHolder.addUnit(unit);
        };
        const angel = makeRenderable(angelState.properties);
        const flyer = makeRenderable(flyerState.properties);
        place(angel, angelCell);
        place(flyer, flyerCell);

        expect(applyRankedUnitMechanicalEffects(angel, angelState)).toBe(true);
        unitsHolder.refreshStackPowerForAllUnits();
        const stepsWhileBroken = flyer.getSteps();
        expect(angel.hasEffectActive("Break")).toBe(true);
        expect(angel.hasAbilityActive("Angelic Host")).toBe(false);
        expect(flyer.hasBuffActive("Angelic Host")).toBe(false);

        const stateWithoutBreak = { ...angelState, mechanicalBreakLaps: undefined };
        expect(applyRankedUnitMechanicalEffects(angel, stateWithoutBreak)).toBe(true);
        unitsHolder.refreshStackPowerForAllUnits();
        expect(angel.hasEffectActive("Break")).toBe(false);
        expect(angel.hasAbilityActive("Angelic Host")).toBe(true);
        expect(flyer.hasBuffActive("Angelic Host")).toBe(true);
        expect(flyer.getSteps()).toBe(stepsWhileBroken + 1);

        // A later same-board snapshot can re-apply Break and immediately remove the movement preview bonus.
        expect(applyRankedUnitMechanicalEffects(angel, angelState)).toBe(true);
        unitsHolder.refreshStackPowerForAllUnits();
        expect(flyer.hasBuffActive("Angelic Host")).toBe(false);
        expect(flyer.getSteps()).toBe(stepsWhileBroken);
    });

    test("collapses the Visible debuff the ranked seam applies on top of the snapshot's own entry", () => {
        FightStateManager.getInstance().reset();
        const tigerCell = { x: 4, y: 4 };
        const enemyCell = { x: 5, y: 4 };
        const state = authoritativeSnapshotToSandboxSceneState({
            ...placementSnapshot([
                unitState({
                    id: "tiger",
                    name: "White Tiger",
                    creatureId: CreatureVals.WHITE_TIGER,
                    team: TeamVals.LOWER,
                    placed: true,
                    baseCell: tigerCell,
                    cells: [tigerCell],
                    // The server ships its engine's own applied_debuffs verbatim, so a White Tiger with an
                    // enemy inside its Disguise Aura arrives already carrying Visible.
                    debuffs: ["Visible"],
                    debuffLaps: [1],
                    debuffDescriptions: ["This unit is visible."],
                }),
                unitState({
                    id: "enemy",
                    team: TeamVals.UPPER,
                    placed: true,
                    baseCell: enemyCell,
                    cells: [enemyCell],
                }),
            ]),
            phase: 2,
            fightStarted: true,
            currentLap: 1,
        });

        const gridSettings = new GridSettings(
            GridConstants.GRID_SIZE,
            GridConstants.MAX_Y,
            GridConstants.MIN_Y,
            GridConstants.MAX_X,
            GridConstants.MIN_X,
            GridConstants.MOVEMENT_DELTA,
            GridConstants.UNIT_SIZE_DELTA,
        );
        const grid = new Grid(gridSettings, GridVals.NORMAL);
        const unitsHolder = new UnitsHolder(grid);
        const place = (id: string, cell: { x: number; y: number }): RenderableUnit => {
            const properties = state.units.find((unit) => unit.properties.id === id)!.properties;
            const effectFactory = new EffectFactory();
            const unit = RenderableUnit.fromBase(
                Unit.createUnit(
                    structuredClone(properties),
                    gridSettings,
                    properties.team,
                    UnitVals.CREATURE,
                    new AbilityFactory(effectFactory),
                    effectFactory,
                    false,
                ),
                undefined as never,
            );
            const position = GridMath.getPositionForCell(
                cell,
                gridSettings.getMinX(),
                gridSettings.getStep(),
                gridSettings.getHalfStep(),
            );
            unit.setPosition(position.x, position.y);
            grid.occupyCell(cell, unit.getId(), unit.getTeam(), unit.getAttackRange(), false, false);
            unitsHolder.addUnit(unit);
            return unit;
        };
        const tiger = place("tiger", tigerCell);
        place("enemy", enemyCell);

        expect(tiger.getUnitProperties().applied_debuffs).toEqual(["Visible"]);

        unitsHolder.refreshAuraEffectsForAllUnits();
        unitsHolder.refreshStackPowerForAllUnits();

        // Reproduces the report: ranked fills the DISPLAY arrays but leaves this.debuffs empty, so common's
        // "if (!u.hasDebuffActive('Visible'))" guard sees nothing and appends a SECOND entry — the sidebar
        // then lists Visible twice. If this expectation ever drops to 1, common stopped diverging and the
        // collapse below is redundant rather than wrong.
        expect(tiger.getUnitProperties().applied_debuffs.filter((name) => name === "Visible")).toHaveLength(2);

        expect(tiger.dropDuplicateAppliedDisplayEntries()).toBe(true);
        const properties = tiger.getUnitProperties();
        expect(properties.applied_debuffs.filter((name) => name === "Visible")).toHaveLength(1);
        expect(properties.applied_debuffs_laps).toHaveLength(properties.applied_debuffs.length);
        expect(properties.applied_debuffs_descriptions).toHaveLength(properties.applied_debuffs.length);
        expect(properties.applied_debuffs_powers).toHaveLength(properties.applied_debuffs.length);
        // The kept entry is the snapshot's, so the HUD keeps the server's laps/description.
        expect(properties.applied_debuffs_descriptions[properties.applied_debuffs.indexOf("Visible")]).toBe(
            "This unit is visible.",
        );
        expect(tiger.hasDebuffActive("Visible")).toBe(true);
    });

    test("suppresses only the redundant Angelic Host beneficiary marker on its active provider", () => {
        expect(shouldDisplayAppliedBuff("Angelic Host", ["Angelic Host"])).toBe(false);
        expect(shouldDisplayAppliedBuff("Angelic Host", [])).toBe(true);
        expect(shouldDisplayAppliedBuff("Morale", ["Morale"])).toBe(true);
    });

    test("maps 1-based ranged shots, falling back to base when the field is absent", () => {
        const rangedOf = (rangeShots: number) => {
            const state = authoritativeSnapshotToSandboxSceneState(
                placementSnapshot([
                    unitState({
                        id: "archer",
                        team: TeamVals.LOWER,
                        name: "Orc",
                        creatureId: CreatureVals.ORC,
                        rangeShots,
                    }),
                ]),
            );
            return state.units.find((unit) => unit.properties.id === "archer")!.properties.range_shots;
        };

        // Absent on the wire (older server / proto3 zero-default) => fall back to base config (Orc = 6),
        // so ranged units never read as 0 just because the server didn't send the field.
        expect(rangedOf(0)).toBe(6);
        // 1-based: wire 1 => a genuine 0 shots left; wire 5 => 4 shots remaining.
        expect(rangedOf(1)).toBe(0);
        expect(rangedOf(5)).toBe(4);
    });

    test("keeps revealed opponent units visible while hiding unknown opponent placeholders", () => {
        const state = authoritativeSnapshotToSandboxSceneState(
            placementSnapshot([
                unitState({ id: "own", team: TeamVals.LOWER, name: "Peasant", creatureId: CreatureVals.PEASANT }),
                unitState({
                    id: "known-op",
                    team: TeamVals.UPPER,
                    name: "Orc",
                    creatureId: CreatureVals.ORC,
                    placed: true,
                    cells: [{ x: 9, y: 13 }],
                    baseCell: { x: 9, y: 13 },
                }),
                unitState({
                    id: "hidden-op",
                    team: TeamVals.UPPER,
                    name: "Unknown",
                    creatureId: CreatureVals.NO_CREATURE,
                    amountAlive: 0,
                    hp: 0,
                    maxHp: 0,
                }),
            ]),
            { hideOpponentPlacements: true },
        );

        expect(state.units.map((unit) => unit.properties.id).sort()).toEqual(["known-op", "own"]);
        expect(state.units.find((unit) => unit.properties.id === "known-op")).toMatchObject({
            team: TeamVals.UPPER,
            placed: false,
            cells: [],
        });
    });

    test("applies explicit Setup roster privacy while preserving the public default and Board reveal", () => {
        const units = [
            unitState({ id: "own", team: TeamVals.LOWER, name: "Peasant", creatureId: CreatureVals.PEASANT }),
            unitState({
                id: "known-op",
                team: TeamVals.UPPER,
                name: "Orc",
                creatureId: CreatureVals.ORC,
                placed: true,
                cells: [{ x: 9, y: 13 }],
                baseCell: { x: 9, y: 13 },
                amountAlive: 0,
            }),
        ];
        const privateSetup = authoritativeSnapshotToSandboxSceneState(
            {
                ...placementSnapshot(units),
                placementSplit: true,
                placementStage: 0,
                hideOpponentRosterDuringSetup: true,
            },
            { hideOpponentPlacements: true },
        );
        const publicSetup = authoritativeSnapshotToSandboxSceneState(
            { ...placementSnapshot(units), placementSplit: true, placementStage: 0 },
            { hideOpponentPlacements: true },
        );
        const board = authoritativeSnapshotToSandboxSceneState(
            {
                ...placementSnapshot(units),
                placementSplit: true,
                placementStage: 1,
                hideOpponentRosterDuringSetup: true,
            },
            { hideOpponentPlacements: true },
        );
        const privateObserverSetup = authoritativeSnapshotToSandboxSceneState(
            {
                ...placementSnapshot(units),
                viewerTeam: undefined,
                placementSplit: true,
                placementStage: 0,
                hideOpponentRosterDuringSetup: true,
            },
            { hideOpponentPlacements: true },
        );

        expect(privateSetup.units.map((unit) => unit.properties.id)).toEqual(["own"]);
        expect(privateObserverSetup.units).toEqual([]);
        expect(publicSetup.units.map((unit) => unit.properties.id).sort()).toEqual(["known-op", "own"]);
        expect(board.units.map((unit) => unit.properties.id).sort()).toEqual(["known-op", "own"]);
        expect(board.units.find((unit) => unit.properties.id === "known-op")).toMatchObject({
            team: TeamVals.UPPER,
            placed: false,
            cells: [],
            properties: { amount_alive: 1 },
        });
    });

    test("drops a spent ability the snapshot no longer lists (Angel's Resurrection), keeping the rest", () => {
        // Ranked rebuilds units from the base creature config, which always lists Resurrection. After the
        // Angel resurrects, the server drops it from the unit's live abilities — the client must honour that
        // (and, since Resurrection's spell is ability-derived, this also clears it from the spellbook).
        const state = authoritativeSnapshotToSandboxSceneState(
            placementSnapshot([
                unitState({
                    id: "angel",
                    team: TeamVals.LOWER,
                    name: "Angel",
                    creatureId: CreatureVals.ANGEL,
                    abilities: ["Arrows Wingshield Aura", "Angelic Host"], // Resurrection already spent
                }),
            ]),
        );

        const angel = state.units.find((unit) => unit.properties.id === "angel");
        expect(angel?.properties.abilities).toContain("Arrows Wingshield Aura");
        expect(angel?.properties.abilities).toContain("Angelic Host");
        expect(angel?.properties.abilities).not.toContain("Resurrection");
    });

    test("keeps all base abilities when the snapshot omits the live ability list (older server)", () => {
        const state = authoritativeSnapshotToSandboxSceneState(
            placementSnapshot([
                unitState({ id: "angel", team: TeamVals.LOWER, name: "Angel", creatureId: CreatureVals.ANGEL }),
            ]),
        );

        const angel = state.units.find((unit) => unit.properties.id === "angel");
        expect(angel?.properties.abilities).toContain("Resurrection");
    });

    test("reconstructs a runtime-granted ability that is absent from the creature's base config", () => {
        const state = authoritativeSnapshotToSandboxSceneState(
            placementSnapshot([
                unitState({
                    id: "assimilator",
                    abilities: ["Backstab"],
                }),
            ]),
        );

        const properties = state.units.find((unit) => unit.properties.id === "assimilator")?.properties;
        expect(properties?.abilities).toEqual(["Backstab"]);
        expect(properties?.abilities_descriptions[0]).toContain("25% higher damage");
        expect(properties?.abilities_stack_powered).toEqual([true]);
        expect(properties?.abilities_auras).toEqual([false]);
    });

    test("prints Blind Fury's live bonus, not the config's 0", () => {
        // The ability's configured power is 0 -- its real power is the share of the stack already lost.
        // Both sources this scene builds cards from (the creature config and the ability catalogue) bake
        // that 0 into the text, so a ranked player used to read "Current power: 0%" all fight while the
        // unit swung at +40%. The snapshot carries the counts; the card has to use them.
        const descriptionFor = (amountAlive: number, amountDied: number): string => {
            const state = authoritativeSnapshotToSandboxSceneState(
                placementSnapshot([
                    unitState({ id: "trog", name: "Troglodyte", abilities: ["Blind Fury"], amountAlive, amountDied }),
                ]),
            );
            const properties = state.units.find((unit) => unit.properties.id === "trog")?.properties;
            const index = properties?.abilities.indexOf("Blind Fury") ?? -1;
            expect(index).toBeGreaterThanOrEqual(0);
            return properties?.abilities_descriptions[index] ?? "";
        };

        expect(descriptionFor(10, 0)).toContain("Current power: 0.0%");
        expect(descriptionFor(6, 4)).toContain("Current power: 40.0%");
        expect(descriptionFor(1, 9)).toContain("Current power: 90.0%");
        expect(descriptionFor(6, 4)).not.toContain("{}");
    });

    test("prints Magic Reflection's stack-scaled chance, not the config's full-stack 75", () => {
        // The card is built from static config, which only knows the FULL-stack figure. A depleted or
        // unlucky dragon rebounds at a different rate, and the card has to say so -- it advertised a flat
        // 75% while the engine rolled 30%.
        const descriptionFor = (stackPower: number, luck: number): string => {
            const state = authoritativeSnapshotToSandboxSceneState(
                placementSnapshot([
                    unitState({
                        id: "dragon",
                        name: "Magic Dragon",
                        creatureId: CreatureVals.MAGIC_DRAGON,
                        abilities: ["Magic Reflection"],
                        stackPower,
                        luck,
                    }),
                ]),
            );
            const properties = state.units.find((unit) => unit.properties.id === "dragon")?.properties;
            const index = properties?.abilities.indexOf("Magic Reflection") ?? -1;
            expect(index).toBeGreaterThanOrEqual(0);
            return properties?.abilities_descriptions[index] ?? "";
        };

        expect(descriptionFor(1, 0)).toContain("15% of the time");
        expect(descriptionFor(3, 0)).toContain("45% of the time");
        expect(descriptionFor(5, 0)).toContain("75% of the time");
        expect(descriptionFor(5, 10)).toContain("85% of the time");
        expect(descriptionFor(2, 5)).toContain("35% of the time");
    });

    test("prints Chakram's live total-target limit for native and stolen cards", () => {
        const descriptionFor = (stackPower: number, native: boolean): string => {
            const state = authoritativeSnapshotToSandboxSceneState(
                placementSnapshot([
                    unitState({
                        id: native ? "zena" : "assimilator",
                        name: native ? "Zena" : "Peasant",
                        creatureId: native ? CreatureVals.ZENA : CreatureVals.PEASANT,
                        abilities: ["Chakram"],
                        stackPower,
                    }),
                ]),
            );
            const properties = state.units[0]?.properties;
            const index = properties?.abilities.indexOf("Chakram") ?? -1;
            expect(index).toBeGreaterThanOrEqual(0);
            return properties?.abilities_descriptions[index] ?? "";
        };

        for (let stackPower = 1; stackPower <= 5; stackPower += 1) {
            expect(descriptionFor(stackPower, true)).toContain(`Maximum targets: ${stackPower}.`);
            expect(descriptionFor(stackPower, false)).toContain(`Maximum targets: ${stackPower}.`);
        }
    });

    test("reconstructs runtime-granted aura mechanics and removes stolen native aura mechanics", () => {
        const state = authoritativeSnapshotToSandboxSceneState(
            placementSnapshot([
                unitState({
                    id: "assimilator",
                    abilities: ["Web Aura"],
                }),
                unitState({
                    id: "aura-victim",
                    team: TeamVals.UPPER,
                    name: "Angel",
                    creatureId: CreatureVals.ANGEL,
                    abilities: ["Resurrection"],
                    stolenAbilities: ["Arrows Wingshield Aura"],
                }),
            ]),
        );

        const assimilator = state.units.find((unit) => unit.properties.id === "assimilator")?.properties;
        expect(assimilator?.aura_effects).toEqual(["Web"]);
        // Range comes straight from common's aura_effects.json — 1 -> 2 with the Arachna balance pass
        // ("Web aura reaches 2 cells"). What this test guards is that the runtime-granted aura is
        // reconstructed at all, not the particular number, so it follows the config.
        expect(assimilator?.aura_ranges).toEqual([2]);
        expect(assimilator?.aura_is_buff).toEqual([false]);

        const victim = state.units.find((unit) => unit.properties.id === "aura-victim")?.properties;
        expect(victim?.abilities).toEqual(["Resurrection"]);
        expect(victim?.aura_effects).toEqual([]);
        expect(victim?.aura_ranges).toEqual([0]);
        expect(victim?.aura_is_buff).toEqual([true]);
    });

    test("reconstructs castable ability spells and removes spells for stolen abilities", () => {
        const state = authoritativeSnapshotToSandboxSceneState(
            placementSnapshot([
                unitState({ id: "spell-thief", abilities: ["Resurrection"] }),
                unitState({
                    id: "spell-victim",
                    team: TeamVals.UPPER,
                    name: "Angel",
                    creatureId: CreatureVals.ANGEL,
                    abilities: ["Arrows Wingshield Aura"],
                    stolenAbilities: ["Resurrection"],
                }),
            ]),
        );

        const thief = state.units.find((unit) => unit.properties.id === "spell-thief")?.properties;
        expect(thief?.spells).toContain(":Resurrection");
        expect(thief?.can_cast_spells).toBe(true);

        const victim = state.units.find((unit) => unit.properties.id === "spell-victim")?.properties;
        expect(victim?.spells).not.toContain(":Resurrection");
        expect(victim?.can_cast_spells).toBe(false);
    });

    test("reconstructs an authoritative stolen spellbook with its exact remaining casts", () => {
        const transferredEntries = ["Life:Heal", "Life:Spiritual Armor", "Life:Spiritual Armor"];
        const state = authoritativeSnapshotToSandboxSceneState(
            placementSnapshot([
                unitState({
                    id: "spellbook-thief",
                    abilities: ["Book of Healing"],
                    spellEntries: transferredEntries,
                    spellEntriesAuthoritative: true,
                }),
                unitState({
                    id: "spellbook-victim",
                    team: TeamVals.UPPER,
                    name: "Healer",
                    creatureId: CreatureVals.HEALER,
                    abilities: [],
                    stolenAbilities: ["Book of Healing"],
                    spellEntriesAuthoritative: true,
                }),
            ]),
        );

        const thief = state.units.find((unit) => unit.properties.id === "spellbook-thief")?.properties;
        expect(thief?.spells).toEqual(transferredEntries);
        expect(thief?.can_cast_spells).toBe(true);

        const victim = state.units.find((unit) => unit.properties.id === "spellbook-victim")?.properties;
        expect(victim?.spells).toEqual([]);
        expect(victim?.can_cast_spells).toBe(false);
    });

    test("carries permanently stolen abilities separately from live abilities", () => {
        const state = authoritativeSnapshotToSandboxSceneState(
            placementSnapshot([
                unitState({
                    id: "victim",
                    abilities: ["Absorb Penalties Aura"],
                    stolenAbilities: ["Bitter Experience"],
                }),
            ]),
        );

        const properties = state.units.find((unit) => unit.properties.id === "victim")?.properties;
        const stolenAbilities = (
            properties as typeof properties & {
                stolen_abilities?: string[];
            }
        )?.stolen_abilities;
        expect(properties?.abilities).toEqual(["Absorb Penalties Aura"]);
        expect(stolenAbilities).toEqual(["Bitter Experience"]);
    });

    test("carries the authoritative turn-start Web movement lock", () => {
        const state = authoritativeSnapshotToSandboxSceneState(
            placementSnapshot([unitState({ id: "webbed", webMovementLocked: true })]),
        );

        const properties = state.units.find((unit) => unit.properties.id === "webbed")?.properties;
        const webMovementLocked = (
            properties as typeof properties & {
                web_movement_locked?: boolean;
            }
        )?.web_movement_locked;
        expect(webMovementLocked).toBe(true);
    });

    test("syncs Web lock changes onto a live unit without rebuilding the board", () => {
        const snapshotProperties = (webMovementLocked: boolean) =>
            authoritativeSnapshotToSandboxSceneState(
                placementSnapshot([
                    unitState({
                        id: "webbed-flyer",
                        name: "Griffin",
                        creatureId: CreatureVals.GRIFFIN,
                        webMovementLocked,
                    }),
                ]),
            ).units[0]!.properties;
        const initialProperties = snapshotProperties(false);
        const effectFactory = new EffectFactory();
        const liveUnit = RenderableUnit.fromBase(
            Unit.createUnit(
                initialProperties,
                new GridSettings(16, 1600, 0, 1600, 0, 0, 0),
                TeamVals.LOWER,
                UnitVals.CREATURE,
                new AbilityFactory(effectFactory),
                effectFactory,
                false,
            ),
            undefined as never,
        );

        // Same-signature and skip-rebuild snapshots both take this non-destructive reconciliation path.
        expect(liveUnit.isWebMovementLocked()).toBe(false);
        expect(liveUnit.canMove()).toBe(true);
        expect(applyRankedUnitSnapshotStats(liveUnit, snapshotProperties(true))).toBe(true);
        expect(liveUnit.isWebMovementLocked()).toBe(true);
        expect(liveUnit.canMove()).toBe(false);

        // The next activation snapshot can authoritatively clear the lock without recreating the unit.
        expect(applyRankedUnitSnapshotStats(liveUnit, snapshotProperties(false))).toBe(true);
        expect(liveUnit.isWebMovementLocked()).toBe(false);
        expect(liveUnit.canMove()).toBe(true);
    });

    test("syncs authoritative movement (Quagmire-class steps changes) without rebuilding the unit", () => {
        const snapshotProperties = (steps: number) =>
            authoritativeSnapshotToSandboxSceneState(
                placementSnapshot([
                    unitState({
                        id: "quagmired-wolf",
                        name: "Wolf",
                        creatureId: CreatureVals.WOLF,
                        statModsAuthoritative: true,
                        steps,
                        stepsMod: 0,
                        armorMod: 0,
                        attackMod: 0,
                    }),
                ]),
            ).units[0]!.properties;
        const effectFactory = new EffectFactory();
        const liveUnit = RenderableUnit.fromBase(
            Unit.createUnit(
                snapshotProperties(3.7),
                new GridSettings(16, 1600, 0, 1600, 0, 0, 0),
                TeamVals.LOWER,
                UnitVals.CREATURE,
                new AbilityFactory(effectFactory),
                effectFactory,
                false,
            ),
            undefined as never,
        );
        expect(liveUnit.getSteps()).toBe(4);

        // The live case (game 7a2b509d): Quagmire cut the Wolf's steps server-side (3.7 -> 2.8) but the
        // animation-preserving snapshot paths never carried movement, so the client kept previewing
        // 4-step attacks the server rejected. The reconcile must land the authoritative steps in place.
        expect(applyRankedUnitSnapshotStats(liveUnit, snapshotProperties(2.8))).toBe(true);
        expect(liveUnit.getSteps()).toBe(3);

        // Idempotent: an unchanged snapshot must not report churn.
        expect(applyRankedUnitSnapshotStats(liveUnit, snapshotProperties(2.8))).toBe(false);
    });

    test("syncs authoritative base armor (Bitter Experience gains) without rebuilding the unit", () => {
        const snapshotProperties = (baseArmor: number) =>
            authoritativeSnapshotToSandboxSceneState(
                placementSnapshot([
                    unitState({
                        id: "seasoned-peasant",
                        statModsAuthoritative: true,
                        armorMod: 0,
                        attackMod: 0,
                        baseArmor,
                        baseAttack: 5,
                    }),
                ]),
            ).units[0]!.properties;
        // The hydrate must land the wire value AND flag it, or adjustBaseStats re-derives the config base.
        const hydrated = snapshotProperties(7);
        expect(hydrated.base_armor).toBe(7);
        expect(hydrated.base_armor_authoritative).toBe(true);
        expect(hydrated.base_attack_authoritative).toBe(true);

        const effectFactory = new EffectFactory();
        const liveUnit = RenderableUnit.fromBase(
            Unit.createUnit(
                snapshotProperties(7),
                new GridSettings(16, 1600, 0, 1600, 0, 0, 0),
                TeamVals.LOWER,
                UnitVals.CREATURE,
                new AbilityFactory(effectFactory),
                effectFactory,
                false,
            ),
            undefined as never,
        );
        expect(liveUnit.getUnitProperties().base_armor).toBe(7);

        // The live report: a Peasant stack losing members gains +1 base armor per death server-side
        // (Bitter Experience), but the animation-preserving snapshot paths never carried base stats, so
        // the sidebar showed the config armor for the whole fight. The reconcile lands the gain in place.
        expect(applyRankedUnitSnapshotStats(liveUnit, snapshotProperties(8))).toBe(true);
        expect(liveUnit.getUnitProperties().base_armor).toBe(8);
        expect(liveUnit.getArmor()).toBe(8);

        // Idempotent: an unchanged snapshot must not report churn.
        expect(applyRankedUnitSnapshotStats(liveUnit, snapshotProperties(8))).toBe(false);
    });

    test("syncs Dulling Defense into the ranked debuff display without rebuilding the unit", () => {
        const snapshotProperties = (totalReduced?: number) =>
            authoritativeSnapshotToSandboxSceneState(
                placementSnapshot([
                    unitState({
                        id: "dulled-attacker",
                        debuffs: totalReduced === undefined ? [] : ["Dulling Defense"],
                        debuffLaps: totalReduced === undefined ? [] : [15],
                        debuffDescriptions:
                            totalReduced === undefined
                                ? []
                                : [`Base attack permanently reduced by {} by Dulling Defense.;${totalReduced};`],
                    }),
                ]),
            ).units[0]!.properties;
        const effectFactory = new EffectFactory();
        const liveUnit = RenderableUnit.fromBase(
            Unit.createUnit(
                snapshotProperties(),
                new GridSettings(16, 1600, 0, 1600, 0, 0, 0),
                TeamVals.LOWER,
                UnitVals.CREATURE,
                new AbilityFactory(effectFactory),
                effectFactory,
                false,
            ),
            undefined as never,
        );

        expect(applyRankedUnitSnapshotStats(liveUnit, snapshotProperties(2))).toBe(true);
        expect(liveUnit.getUnitProperties().applied_debuffs).toEqual(["Dulling Defense"]);
        expect(liveUnit.getUnitProperties().applied_debuffs_laps).toEqual([15]);
        expect(liveUnit.getUnitProperties().applied_debuffs_descriptions).toEqual([
            "Base attack permanently reduced by {} by Dulling Defense.;2;",
        ]);
        expect(liveUnit.getUnitProperties().applied_debuffs_powers).toEqual([0]);

        // Repeated triggers replace the row's accumulated value rather than duplicating it.
        expect(applyRankedUnitSnapshotStats(liveUnit, snapshotProperties(4))).toBe(true);
        expect(liveUnit.getUnitProperties().applied_debuffs).toEqual(["Dulling Defense"]);
        expect(liveUnit.getUnitProperties().applied_debuffs_descriptions).toEqual([
            "Base attack permanently reduced by {} by Dulling Defense.;4;",
        ]);

        // The same non-destructive path must remove effects absent from a later authoritative snapshot.
        expect(applyRankedUnitSnapshotStats(liveUnit, snapshotProperties())).toBe(true);
        expect(liveUnit.getUnitProperties().applied_debuffs).toEqual([]);
        expect(liveUnit.getUnitProperties().applied_debuffs_laps).toEqual([]);
        expect(liveUnit.getUnitProperties().applied_debuffs_descriptions).toEqual([]);
        expect(liveUnit.getUnitProperties().applied_debuffs_powers).toEqual([]);
    });

    test("syncs authoritative rune attack and armor modifiers without rebuilding the ranked unit", () => {
        const snapshotProperties = (attackMod: number, armorMod: number, runeStacks = 0) =>
            authoritativeSnapshotToSandboxSceneState(
                placementSnapshot([
                    unitState({
                        id: "enchanted-arbalester",
                        name: "Arbalester",
                        creatureId: CreatureVals.ARBALESTER,
                        attackMod,
                        armorMod,
                        statModsAuthoritative: true,
                        buffs: runeStacks ? ["Weapon Rune", "Armor Rune"] : [],
                        buffLaps: runeStacks ? [15, 15] : [],
                        buffDescriptions: runeStacks ? [`+{} attack;${runeStacks};`, `+{} armor;${runeStacks};`] : [],
                    }),
                ]),
            ).units[0]!.properties;
        const effectFactory = new EffectFactory();
        const liveUnit = RenderableUnit.fromBase(
            Unit.createUnit(
                snapshotProperties(0.92, 0),
                new GridSettings(16, 1600, 0, 1600, 0, 0, 0),
                TeamVals.LOWER,
                UnitVals.CREATURE,
                new AbilityFactory(effectFactory),
                effectFactory,
                false,
            ),
            undefined as never,
        );
        const attackBefore = liveUnit.getAttack();
        const armorBefore = liveUnit.getArmor();

        // Exact shape of the reported ranked match after its third successful rune: the server's modifier
        // advanced by three and the display description independently carries the same running total.
        expect(applyRankedUnitSnapshotStats(liveUnit, snapshotProperties(3.92, 3, 3))).toBe(true);
        expect(liveUnit.getUnitProperties()).toMatchObject({
            attack_mod: 3.92,
            attack_mod_authoritative: true,
            armor_mod: 3,
            armor_mod_authoritative: true,
            applied_buffs: ["Weapon Rune", "Armor Rune"],
        });
        expect(liveUnit.getAttack()).toBeCloseTo(attackBefore + 3);
        expect(liveUnit.getArmor()).toBeCloseTo(armorBefore + 3);

        // Re-applying the same authoritative snapshot is a no-op, preserving the persistent sprite.
        expect(applyRankedUnitSnapshotStats(liveUnit, snapshotProperties(3.92, 3, 3))).toBe(false);
    });

    test("detects authoritative ability and remaining-spell changes before a skip-rebuild is cached", () => {
        const initialProperties = authoritativeSnapshotToSandboxSceneState(
            placementSnapshot([
                unitState({ id: "queen", name: "Arachna Queen", creatureId: CreatureVals.ARACHNA_QUEEN }),
            ]),
        ).units[0]!.properties;
        const grantedProperties = authoritativeSnapshotToSandboxSceneState(
            placementSnapshot([
                unitState({
                    id: "queen",
                    name: "Arachna Queen",
                    creatureId: CreatureVals.ARACHNA_QUEEN,
                    abilities: [...initialProperties.abilities, "Book of Healing"],
                    spellEntries: ["Life:Heal", "Life:Spiritual Armor", "Life:Spiritual Armor"],
                    spellEntriesAuthoritative: true,
                }),
            ]),
        ).units[0]!.properties;
        const effectFactory = new EffectFactory();
        const liveUnit = RenderableUnit.fromBase(
            Unit.createUnit(
                initialProperties,
                new GridSettings(16, 1600, 0, 1600, 0, 0, 0),
                TeamVals.LOWER,
                UnitVals.CREATURE,
                new AbilityFactory(effectFactory),
                effectFactory,
                false,
            ),
            undefined as never,
        );

        expect(rankedUnitMechanicsMatch(liveUnit, initialProperties)).toBe(true);
        expect(
            rankedUnitMechanicsMatch(liveUnit, {
                ...initialProperties,
                stolen_abilities: ["Predatory Assimilation"],
            }),
        ).toBe(false);
        expect(
            rankedUnitMechanicsMatch(liveUnit, {
                ...initialProperties,
                spells: ["Life:Heal"],
            }),
        ).toBe(false);
        expect(rankedUnitMechanicsMatch(liveUnit, grantedProperties)).toBe(false);
    });

    test("keeps an authoritative spent stolen direct spell empty when rebuilding the Queen", () => {
        const properties = authoritativeSnapshotToSandboxSceneState(
            placementSnapshot([
                unitState({
                    id: "spent-spell-queen",
                    name: "Arachna Queen",
                    creatureId: CreatureVals.ARACHNA_QUEEN,
                    abilities: ["Web Aura", "Infest", "Predatory Assimilation", "Wind Flow"],
                    spellEntries: [],
                    spellEntriesAuthoritative: true,
                }),
            ]),
        ).units[0]!.properties;
        const effectFactory = new EffectFactory();
        const rebuilt = Unit.createUnit(
            properties,
            new GridSettings(16, 1600, 0, 1600, 0, 0, 0),
            TeamVals.LOWER,
            UnitVals.CREATURE,
            new AbilityFactory(effectFactory),
            effectFactory,
            false,
        );

        expect(properties.spell_entries_authoritative).toBe(true);
        expect(rebuilt.hasAbilityActive("Wind Flow")).toBe(true);
        expect(rebuilt.hasSpellRemaining("Wind Flow")).toBe(false);
        expect(rebuilt.getUnitProperties().spells).toEqual([]);
    });

    test("renders a redacted opponent placement unit as a live 1-stack silhouette, not a corpse", () => {
        // The server hides the opponent's live stack size during simultaneous placement by sending
        // amountAlive = 0. The client shows the opponent's roster as ghost silhouettes on their edge, so it
        // must NOT treat that 0 as dead — cleanupDeadUnits() reaps amountAlive<=0 units WITH a death
        // animation every tick, which was the "opponent army getting killed on the edge every second" bug.
        const state = authoritativeSnapshotToSandboxSceneState(
            placementSnapshot([
                unitState({ id: "own", team: TeamVals.LOWER, name: "Peasant", creatureId: CreatureVals.PEASANT }),
                unitState({
                    id: "op",
                    team: TeamVals.UPPER,
                    name: "Orc",
                    creatureId: CreatureVals.ORC,
                    placed: true,
                    cells: [{ x: 9, y: 13 }],
                    baseCell: { x: 9, y: 13 },
                    amountAlive: 0, // server-redacted stack size
                }),
            ]),
            { hideOpponentPlacements: true },
        );

        const op = state.units.find((unit) => unit.properties.id === "op");
        expect(op).toMatchObject({ placed: false, cells: [] });
        expect(op?.properties.amount_alive).toBeGreaterThanOrEqual(1);
    });

    test("keeps real opponent placement once fight starts", () => {
        const state = authoritativeSnapshotToSandboxSceneState(
            {
                ...placementSnapshot([
                    unitState({
                        id: "known-op",
                        team: TeamVals.UPPER,
                        name: "Orc",
                        creatureId: CreatureVals.ORC,
                        placed: true,
                        cells: [{ x: 9, y: 13 }],
                        baseCell: { x: 9, y: 13 },
                    }),
                ]),
                phase: 2,
                fightStarted: true,
                currentLap: 1,
            },
            { hideOpponentPlacements: true },
        );

        expect(state.units).toHaveLength(1);
        expect(state.units[0]).toMatchObject({
            team: TeamVals.UPPER,
            placed: true,
            cells: [{ x: 9, y: 13 }],
            baseCell: { x: 9, y: 13 },
        });
    });

    test("computes ranked HP damage for partially wounded stacks", () => {
        const state = authoritativeSnapshotToSandboxSceneState({
            ...placementSnapshot([
                unitState({ id: "healthy", amountAlive: 10, amountDied: 0, hp: 10, maxHp: 10 }),
                unitState({ id: "wounded", amountAlive: 10, amountDied: 0, hp: 4, maxHp: 10 }),
                unitState({ id: "losses", amountAlive: 8, amountDied: 2, hp: 3, maxHp: 10 }),
            ]),
            phase: 2,
            fightStarted: true,
            currentLap: 1,
        });

        const byId = new Map(state.units.map((unit) => [unit.properties.id, unit]));
        const healthy = byId.get("healthy")!;
        const wounded = byId.get("wounded")!;
        const losses = byId.get("losses")!;

        expect(rankedUnitStartAmount(healthy)).toBe(10);
        expect(rankedUnitStartHealth(healthy)).toBe(100);
        expect(rankedUnitAliveHealth(healthy)).toBe(100);
        expect(rankedUnitStartHealth(wounded) - rankedUnitAliveHealth(wounded)).toBe(6);
        expect(rankedUnitStartHealth(losses) - rankedUnitAliveHealth(losses)).toBe(27);
    });
});

describe("revealed opponent roster row", () => {
    // Real board geometry: 16 cells, x in [-1024, 1024], y in [0, 2048], step 128.
    const MIN_X = GridConstants.MIN_X;
    const MAX_X = GridConstants.MAX_X;
    const STEP = GridConstants.MAX_Y / GridConstants.GRID_SIZE;

    test("spreads the army across the full board width, inside both edges", () => {
        const xs = Array.from({ length: 6 }, (_, index) => revealedOpponentRowX(index, 6, MIN_X, MAX_X));

        expect(xs).toEqual([...xs].sort((a, b) => a - b));
        expect(xs[0]).toBeGreaterThan(MIN_X);
        expect(xs[xs.length - 1]).toBeLessThan(MAX_X);
        // Even slots, and the end margins match each other (half a slot at each edge).
        const gaps = xs.slice(1).map((x, index) => x - xs[index]);
        for (const gap of gaps) {
            expect(gap).toBeCloseTo(gaps[0], 6);
        }
        expect(xs[0] - MIN_X).toBeCloseTo(MAX_X - xs[xs.length - 1], 6);
        // Wider than the old zone-bounded row, which capped spacing at 2.5 cells.
        expect(gaps[0]).toBeGreaterThan(STEP * 2.5);
    });

    test("keeps a single unit centered and never collapses on an empty roster", () => {
        expect(revealedOpponentRowX(0, 1, MIN_X, MAX_X)).toBe((MIN_X + MAX_X) / 2);
        expect(Number.isFinite(revealedOpponentRowX(0, 0, MIN_X, MAX_X))).toBe(true);
    });

    test("stands the row on the zone's outermost cell row (inside the placement area)", () => {
        // UPPER opponent: zone boundary at y=1920 -> half a step inside, the center of cell row 14.
        expect(revealedOpponentRowY(2048, 1920, STEP, true)).toBe(1856);
        // LOWER opponent mirrors it.
        expect(revealedOpponentRowY(0, 128, STEP, false)).toBe(192);
    });

    test("sits on the opponent's half once their zone cells are converted to world coordinates", () => {
        // The UPPER rectangle zone occupies cell rows 12-14, so its outermost row is y = 14. Placement
        // geometry hands back CELL INDICES; feeding those straight in (the old bug) put the whole row at
        // y ≈ 14 — the far side of the board, in a pile.
        const outermostCenterY = GridMath.getPositionForCell({ x: 1, y: 14 }, MIN_X, STEP, STEP / 2).y;
        const zoneOuterEdgeY = outermostCenterY + STEP / 2;
        expect(zoneOuterEdgeY).toBe(GridConstants.MAX_Y - STEP);

        const rowY = revealedOpponentRowY(GridConstants.MAX_Y, zoneOuterEdgeY, STEP, true);
        expect(rowY).toBe(1856);
        expect(rowY).toBeGreaterThan(GridConstants.MAX_Y / 2);
    });

    test("stays on the board when the zone reaches the edge", () => {
        expect(revealedOpponentRowY(2048, 2048, STEP, true)).toBe(2048 - STEP * 0.5);
        expect(revealedOpponentRowY(0, 0, STEP, false)).toBe(STEP * 0.5);
        // An edge-adjacent zone boundary still lands the row inside the zone, on a real cell row.
        expect(revealedOpponentRowY(2048, 2000, STEP, true)).toBe(2000 - STEP * 0.5);
    });

    test("shrinks the silhouettes only once the slots get tighter than a large unit", () => {
        expect(revealedOpponentRowScale(6)).toBe(0.85);
        expect(revealedOpponentRowScale(1)).toBe(0.85);
        expect(revealedOpponentRowScale(10)).toBeLessThan(0.85);
        expect(revealedOpponentRowScale(50)).toBeGreaterThanOrEqual(0.55);

        // The point of shrinking: a 2x2 silhouette must still fit its slot.
        for (const total of [6, 8, 10, 12]) {
            const slot = (MAX_X - MIN_X) / total;
            expect(256 * revealedOpponentRowScale(total)).toBeLessThanOrEqual(slot + 1);
        }
    });
});

describe("ranked multi-hit scene log", () => {
    // Berserker's Double Punch: the authoritative journal carries ONE unit_attacked event whose
    // damage.amount (11) is the SUM of both strikes, with the per-strike breakdown in hits[]. Ranked
    // must report the two strikes it animated, not a single 11-damage hit.
    const doublePunch = {
        amount: 11,
        hits: [
            { amount: 7, unitsDied: 0 },
            { amount: 4, unitsDied: 1 },
        ],
    } as never;

    test("logs one line per landed strike, with that strike's own damage and kills", () => {
        expect(multiHitSceneLogLines(doublePunch, "Berserker", "Peasant", "⚔️", "🟢")).toEqual([
            "🟢 Berserker ⚔️ Peasant (7)",
            "🟢 Berserker ⚔️ Peasant (4) 💀 1",
        ]);
    });

    test("omits the team flag when the attacker has none", () => {
        expect(multiHitSceneLogLines(doublePunch, "Berserker", "Peasant", "⚔️", "")).toEqual([
            "Berserker ⚔️ Peasant (7)",
            "Berserker ⚔️ Peasant (4) 💀 1",
        ]);
    });

    test("leaves single-hit, dodged and splash attacks to the existing lines", () => {
        const singleHit = { amount: 7, hits: [{ amount: 7, unitsDied: 0 }] } as never;
        const dodged = { ...(doublePunch as object), missed: true } as never;
        const splashed = {
            ...(doublePunch as object),
            splash: [{ unitId: "a", amount: 3, unitsDied: 0 }],
        } as never;

        expect(multiHitSceneLogLines(singleHit, "Peasant", "Orc", "⚔️", "🟢")).toEqual([]);
        expect(multiHitSceneLogLines(dodged, "Berserker", "Peasant", "⚔️", "🟢")).toEqual([]);
        expect(multiHitSceneLogLines(splashed, "Cyclops", "Peasant", "🏹💥", "🟢")).toEqual([]);
        expect(multiHitSceneLogLines(undefined, "Peasant", "Orc", "⚔️", "🟢")).toEqual([]);
    });

    test("skips a strike that neither damaged nor killed (a whiffed second punch)", () => {
        const secondWhiffed = {
            amount: 7,
            hits: [
                { amount: 7, unitsDied: 0 },
                { amount: 0, unitsDied: 0 },
            ],
        } as never;

        expect(multiHitSceneLogLines(secondWhiffed, "Berserker", "Peasant", "⚔️", "🟢")).toEqual([
            "🟢 Berserker ⚔️ Peasant (7)",
        ]);
    });
});

describe("ranked spell secondary-damage scene log", () => {
    const spellEvent = {
        type: "spell_cast",
        casterId: "mage",
        spellName: "Lightning Strike",
        targetId: "target",
        unitIdsDied: ["mage"],
        animations: [],
        damaged: [
            {
                unitId: "target",
                position: { x: 1, y: 2 },
                amount: 70,
                unitsDied: 0,
            },
            {
                unitId: "mage",
                position: { x: 3, y: 4 },
                amount: 570,
                unitsDied: 1,
                rebounded: true,
            },
        ],
        secondary: [
            {
                source: "flesh_shield",
                unitId: "shield",
                position: { x: 5, y: 6 },
                amount: 500,
                unitsDied: 0,
            },
        ],
    } as unknown as GameEvent;
    const names = new Map([
        ["mage", "Battle Mage"],
        ["target", "Satyr"],
        ["shield", "Abomination"],
    ]);

    test("does not roll a Magic Mirror rebound into the cast's primary total", () => {
        expect(rankedSpellPrimaryDamageSummary(spellEvent)).toEqual({
            total: 70,
            unitsDied: 0,
            unitCount: 1,
        });
    });

    test("reports Flesh Shield and Magic Mirror as separate authoritative follow-ups", () => {
        expect(rankedSecondarySceneLogLines(spellEvent, names, () => "🟢")).toEqual([
            "🟢 Abomination absorbed (500) with Flesh Shield",
            "🟢 Battle Mage received (570) from Magic Mirror rebound 💀 1",
        ]);
    });

    test("a Water Shield break names the shield owner AND the striker", () => {
        const attackEvent = {
            type: "unit_attacked",
            attackType: "melee",
            attackerId: "orc",
            targetId: "mermaid",
            unitIdsDied: [],
            animations: [],
            damage: {
                amount: 0,
                secondary: [
                    {
                        source: "water_shield",
                        unitId: "mermaid",
                        position: { x: 5, y: 6 },
                        amount: 44,
                        unitsDied: 0,
                    },
                ],
            },
        } as unknown as GameEvent;
        const shieldNames = new Map([
            ["orc", "Orc"],
            ["mermaid", "Mermaid"],
        ]);
        expect(rankedSecondarySceneLogLines(attackEvent, shieldNames, () => "🔴")).toEqual([
            "🔴 Mermaid's Water Shield absorbs Orc's hit and breaks",
        ]);
    });
});

describe("ranked effects_applied scene log", () => {
    const names = new Map([
        ["healer", "Healer"],
        ["pikeman", "Pikeman"],
        ["squire", "Squire"],
        ["hyena", "Hyena"],
    ]);
    const flags = (unitId: string): string => (unitId === "hyena" ? "🔴" : "🟢");

    const massEvent = {
        type: "effects_applied",
        applications: [
            { unitId: "pikeman", name: "Mass Riot", kind: "buff", laps: 3 },
            { unitId: "squire", name: "Mass Riot", kind: "buff", laps: 3 },
            { unitId: "hyena", name: "Quagmire", kind: "debuff", laps: 2 },
            { unitId: "hyena", name: "Stun", kind: "effect", laps: 1 },
            { unitId: "hyena", name: "Misfortune", kind: "debuff", resisted: true },
        ],
    } as unknown as Parameters<typeof effectsAppliedSceneLogLines>[0];

    test("names EVERY recipient of a mass cast, on-hit riders and resists, each with its own flag", () => {
        expect(effectsAppliedSceneLogLines(massEvent, names, flags)).toEqual([
            "🟢 Pikeman gains Mass Riot for 3 laps",
            "🟢 Squire gains Mass Riot for 3 laps",
            "🔴 Hyena suffers Quagmire for 2 laps",
            "🔴 Hyena got Stun for 1 lap",
            "🔴 Hyena resisted Misfortune",
        ]);
    });

    test("a whole-fight duration reads as permanent (no lap suffix)", () => {
        const permanent = {
            type: "effects_applied",
            applications: [{ unitId: "pikeman", name: "Dulling Defense", kind: "debuff", laps: 15 }],
        } as unknown as Parameters<typeof effectsAppliedSceneLogLines>[0];
        expect(effectsAppliedSceneLogLines(permanent, names, flags)).toEqual(["🟢 Pikeman suffers Dulling Defense"]);
    });

    test("skips the pair the cast line already narrates, keeps everything else", () => {
        const events = [
            { type: "spell_cast", casterId: "healer", spellName: "Quagmire", targetId: "hyena" },
        ] as unknown as Parameters<typeof spellCastNarratedPairs>[0];
        const narrated = spellCastNarratedPairs(events);
        expect(narrated.has("hyena|Quagmire")).toBe(true);
        const lines = effectsAppliedSceneLogLines(massEvent, names, flags, narrated);
        expect(lines.some((line) => line.includes("suffers Quagmire"))).toBe(false);
        expect(lines.some((line) => line.includes("got Stun"))).toBe(true);
    });

    test("returns nothing for other event types", () => {
        const other = { type: "unit_waited", unitId: "pikeman", team: 2 } as unknown as Parameters<
            typeof effectsAppliedSceneLogLines
        >[0];
        expect(effectsAppliedSceneLogLines(other, names, flags)).toEqual([]);
    });
});

describe("ranked rolled-cast outcome lines", () => {
    const names = new Map([
        ["smith", "Blacksmith"],
        ["arb", "Arbalester"],
    ]);
    const event = (spellName: string, outcomes: object[]): Parameters<typeof spellOutcomeSceneLogLines>[0] =>
        ({ type: "spell_cast", casterId: "smith", spellName, targetId: "arb", outcomes }) as unknown as Parameters<
            typeof spellOutcomeSceneLogLines
        >[0];

    test("weapon rune: enchant success carries the running total, failure says which enchant", () => {
        expect(
            spellOutcomeSceneLogLines(
                event("Weapon Rune", [{ unitId: "arb", outcome: "enchanted", amount: 2 }]),
                names,
                () => "🟢",
            ),
        ).toEqual(["🟢 Arbalester enchanted: +2 attack"]);
        expect(spellOutcomeSceneLogLines(event("Weapon Rune", [{ unitId: "arb", outcome: "failed" }]), names)).toEqual([
            "Arbalester's weapon enchant failed",
        ]);
        expect(spellOutcomeSceneLogLines(event("Armor Rune", [{ unitId: "arb", outcome: "failed" }]), names)).toEqual([
            "Arbalester's armor enchant failed",
        ]);
    });

    test("craft: grants, backfire and no-op all read like the engine's own lines", () => {
        expect(
            spellOutcomeSceneLogLines(
                event("Craft", [
                    { unitId: "arb", outcome: "double", grantedAbility: "Crafted Double Shot" },
                    { unitId: "smith", outcome: "nothing" },
                ]),
                names,
            ),
        ).toEqual(["Arbalester was crafted with Crafted Double Shot", "Blacksmith's craft found nothing to improve"]);
        expect(spellOutcomeSceneLogLines(event("Craft", [{ unitId: "arb", outcome: "stun" }]), names)).toEqual([
            "Arbalester's craft backfired — stunned",
        ]);
    });

    test("non-outcome casts contribute nothing", () => {
        expect(spellOutcomeSceneLogLines(event("Heal", []), names)).toEqual([]);
    });
});

describe("ranked ability-transfer scene log", () => {
    const transferEvent = (mode: "gifted" | "copied"): GameEvent =>
        ({
            type: "spell_cast",
            casterId: "troll",
            spellName: "Wild Regeneration",
            targetId: "ally",
            abilityTransfers: [
                {
                    abilityName: "Wild Regeneration",
                    fromUnitId: "troll",
                    toUnitId: "ally",
                    mode,
                },
            ],
        }) as GameEvent;

    test("restores sandbox's gifted/copied wording from the authoritative cast event", () => {
        expect(spellAbilityTransferSceneLogSuffix(transferEvent("gifted"))).toBe(" => gifted");
        expect(spellAbilityTransferSceneLogSuffix(transferEvent("copied"))).toBe(" => copied");
    });

    test("keeps older server events and unrelated events unchanged", () => {
        expect(
            spellAbilityTransferSceneLogSuffix({
                type: "spell_cast",
                casterId: "troll",
                spellName: "Wild Regeneration",
                targetId: "ally",
            } as GameEvent),
        ).toBe("");
        expect(spellAbilityTransferSceneLogSuffix({ type: "unit_waited", unitId: "ally" } as GameEvent)).toBe("");
    });
});

describe("planScatteredMountainSync", () => {
    const gameId = "36f05c02-d25a-4ea6-87ed-d852a333ae83";
    const layout = scatteredMountainsForSeed(gameId);
    const packed = (cell: { x: number; y: number }) => cell.x * GridConstants.GRID_SIZE + cell.y;

    test("no scattered state at all (older server / classic game) -> no plan", () => {
        expect(planScatteredMountainSync(gameId, undefined, undefined)).toBeUndefined();
        // A stray cells list without the count marker must not fabricate a scattered board either.
        expect(planScatteredMountainSync(gameId, [1, 2, 3], undefined)).toBeUndefined();
    });

    test("every seeded stone standing -> full layout with variants, nothing destroyed", () => {
        const plan = planScatteredMountainSync(
            gameId,
            layout.map((rock) => packed(rock.cell)),
            layout.length,
        );
        expect(plan?.destroyed).toEqual([]);
        expect(plan?.standing).toEqual(
            layout.map((rock) => ({ x: rock.cell.x, y: rock.cell.y, variant: rock.variant })),
        );
    });

    test("a mined stone lands in destroyed; the packing mirrors the server encoder", () => {
        const downed = layout[0];
        const plan = planScatteredMountainSync(
            gameId,
            layout.slice(1).map((rock) => packed(rock.cell)),
            layout.length - 1,
        );
        expect(plan?.destroyed).toEqual([{ x: downed.cell.x, y: downed.cell.y }]);
        expect(plan?.standing).toHaveLength(layout.length - 1);
        expect(plan?.standing.every((rock) => rock.x !== downed.cell.x || rock.y !== downed.cell.y)).toBe(true);
    });

    test("count 0 with no cells = scattered board with every stone destroyed", () => {
        const plan = planScatteredMountainSync(gameId, undefined, 0);
        expect(plan?.standing).toEqual([]);
        expect(plan?.destroyed).toHaveLength(layout.length);
    });
});
