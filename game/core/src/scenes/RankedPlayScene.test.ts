import { describe, expect, test } from "bun:test";

import { CreatureVals, TeamVals } from "@heroesofcrypto/common";

import type { AuthoritativeGameSnapshot, AuthoritativeUnitState } from "../game_action_transport";
import { authoritativeSnapshotToSandboxSceneState } from "./RankedPlayScene";

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
});
