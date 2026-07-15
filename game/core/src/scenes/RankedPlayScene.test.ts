import { describe, expect, test } from "bun:test";

import { CreatureVals, TeamVals } from "@heroesofcrypto/common";

import type { AuthoritativeGameSnapshot, AuthoritativeUnitState } from "../game_action_transport";
import {
    authoritativeSnapshotToSandboxSceneState,
    rankedUnitAliveHealth,
    rankedUnitStartAmount,
    rankedUnitStartHealth,
    shouldPublishRankedFinish,
} from "./RankedPlayScene";

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
