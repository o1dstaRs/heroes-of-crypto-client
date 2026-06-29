import { describe, expect, test } from "bun:test";

import { CreatureVals, TeamVals } from "@heroesofcrypto/common";

import type { AuthoritativeGameSnapshot, AuthoritativeUnitState } from "../game_action_transport";
import {
    authoritativeSnapshotToSandboxSceneState,
    rankedUnitAliveHealth,
    rankedUnitStartAmount,
    rankedUnitStartHealth,
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
