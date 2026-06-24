import { describe, expect, it } from "bun:test";

import { AttackVals, TeamVals, type GameAction } from "@heroesofcrypto/common";

import { createPlayActionFromGameAction } from "./game_action_play_codec";
import { PlayActionType } from "./play_protocol";

const envelope = {
    actionId: "action-1",
    gameId: "game-1",
    playerId: "player-1",
    expectedSequence: 12,
    team: TeamVals.LOWER,
};

describe("createPlayActionFromGameAction", () => {
    it("keeps the shared play action envelope", () => {
        expect(createPlayActionFromGameAction({ type: "start_fight" }, envelope)).toMatchObject({
            actionId: envelope.actionId,
            gameId: envelope.gameId,
            playerId: envelope.playerId,
            expectedSequence: envelope.expectedSequence,
            team: envelope.team,
            type: PlayActionType.START_FIGHT,
        });
    });

    it("maps turn actions", () => {
        expect(createPlayActionFromGameAction({ type: "end_turn", unitId: "u1" }, envelope)).toMatchObject({
            type: PlayActionType.END_TURN,
            unitId: "u1",
            reason: "manual",
        });
        expect(
            createPlayActionFromGameAction({ type: "end_turn", unitId: "u1", reason: "timeout" }, envelope),
        ).toMatchObject({
            type: PlayActionType.END_TURN,
            unitId: "u1",
            reason: "timeout",
        });
        expect(createPlayActionFromGameAction({ type: "wait_turn", unitId: "u2" }, envelope)).toMatchObject({
            type: PlayActionType.WAIT_TURN,
            unitId: "u2",
        });
        expect(createPlayActionFromGameAction({ type: "defend_turn", unitId: "u3" }, envelope)).toMatchObject({
            type: PlayActionType.DEFEND_TURN,
            unitId: "u3",
        });
    });

    it("maps movement and attack actions", () => {
        const path = [
            { x: 1, y: 2 },
            { x: 1, y: 3 },
        ];
        const targetCells = [{ x: 1, y: 3 }];

        expect(
            createPlayActionFromGameAction(
                { type: "move_unit", unitId: "u1", path, targetCells, hasLavaCell: true },
                envelope,
            ),
        ).toMatchObject({
            type: PlayActionType.MOVE_UNIT,
            unitId: "u1",
            path,
            targetCells,
            hasLavaCell: true,
        });

        expect(
            createPlayActionFromGameAction(
                { type: "melee_attack", attackerId: "a1", targetId: "t1", attackFrom: { x: 2, y: 3 }, path },
                envelope,
            ),
        ).toMatchObject({
            type: PlayActionType.MELEE_ATTACK,
            unitId: "a1",
            targetUnitId: "t1",
            attackFrom: { x: 2, y: 3 },
            path,
        });

        expect(
            createPlayActionFromGameAction({ type: "range_attack", attackerId: "a2", targetId: "t2" }, envelope),
        ).toMatchObject({
            type: PlayActionType.RANGE_ATTACK,
            unitId: "a2",
            targetUnitId: "t2",
        });
    });

    it("maps spell, obstacle, and area actions", () => {
        expect(
            createPlayActionFromGameAction(
                {
                    type: "obstacle_attack",
                    attackerId: "a1",
                    targetPosition: { x: 7, y: 7 },
                    attackFrom: { x: 6, y: 7 },
                    hasWaterCell: true,
                },
                envelope,
            ),
        ).toMatchObject({
            type: PlayActionType.OBSTACLE_ATTACK,
            unitId: "a1",
            targetCell: { x: 7, y: 7 },
            attackFrom: { x: 6, y: 7 },
            hasWaterCell: true,
        });

        expect(
            createPlayActionFromGameAction(
                { type: "area_throw_attack", attackerId: "a2", targetCell: { x: 4, y: 5 } },
                envelope,
            ),
        ).toMatchObject({
            type: PlayActionType.AREA_THROW_ATTACK,
            unitId: "a2",
            targetCell: { x: 4, y: 5 },
        });

        expect(
            createPlayActionFromGameAction(
                { type: "cast_spell", casterId: "c1", spellName: "Heal", targetId: "t1", targetCell: { x: 3, y: 4 } },
                envelope,
            ),
        ).toMatchObject({
            type: PlayActionType.CAST_SPELL,
            unitId: "c1",
            spellName: "Heal",
            targetUnitId: "t1",
            targetCell: { x: 3, y: 4 },
        });
    });

    it("maps placement, deletion, and attack type selection", () => {
        const placement: GameAction = {
            type: "place_unit",
            unitId: "u1",
            team: TeamVals.UPPER,
            unitName: "Peasant",
            cells: [{ x: 10, y: 11 }],
        };

        expect(createPlayActionFromGameAction(placement, envelope)).toMatchObject({
            type: PlayActionType.PLACE_UNIT,
            unitId: "u1",
            team: TeamVals.UPPER,
            unitName: "Peasant",
            cells: [{ x: 10, y: 11 }],
        });

        expect(
            createPlayActionFromGameAction(
                { type: "select_attack_type", unitId: "u2", attackType: AttackVals.RANGE },
                envelope,
            ),
        ).toMatchObject({
            type: PlayActionType.SELECT_ATTACK_TYPE,
            unitId: "u2",
            attackType: AttackVals.RANGE,
        });

        expect(createPlayActionFromGameAction({ type: "delete_unit", unitId: "u3" }, envelope)).toMatchObject({
            type: PlayActionType.DELETE_UNIT,
            unitId: "u3",
        });
    });
});
