import { describe, expect, it } from "bun:test";

import { AttackVals, TeamVals, type GameAction } from "@heroesofcrypto/common";

import { createGameActionFromPlayAction, createPlayActionFromGameAction } from "./game_action_play_codec";
import { PlayActionType, PLAY_MOVE_CONTINUE_TURN_REASON } from "./play_protocol";

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

        const ordinaryMove = createPlayActionFromGameAction(
            { type: "move_unit", unitId: "u1", path, targetCells, hasLavaCell: true },
            envelope,
        );
        expect(ordinaryMove).toMatchObject({
            type: PlayActionType.MOVE_UNIT,
            unitId: "u1",
            path,
            targetCells,
            hasLavaCell: true,
        });
        expect(ordinaryMove.reason).toBeUndefined();
        expect(
            createPlayActionFromGameAction({ type: "move_unit", unitId: "u1", path, targetCells }, envelope, {
                continueTurn: true,
            }),
        ).toMatchObject({
            type: PlayActionType.MOVE_UNIT,
            reason: PLAY_MOVE_CONTINUE_TURN_REASON,
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

    it("round-trips the ranged aim (cell + side) so the engine can rebuild the trajectory", () => {
        // Side 0 (LEFT) must survive: it is sent 1-based on the wire so the varint zero-skip can't drop it.
        const action: GameAction = {
            type: "range_attack",
            attackerId: "a3",
            targetId: "t3",
            aimCell: { x: 7, y: 3 },
            aimSide: 0,
        };
        const wire = createPlayActionFromGameAction(action, envelope);
        expect(wire).toMatchObject({
            type: PlayActionType.RANGE_ATTACK,
            unitId: "a3",
            targetUnitId: "t3",
            targetCell: { x: 7, y: 3 },
            targetSide: 1,
        });
        expect(createGameActionFromPlayAction(wire)).toEqual(action);

        // No aim (e.g. AI path): no cell/side leaks onto the wire, and decode yields undefined aim.
        const noAim = createPlayActionFromGameAction(
            { type: "range_attack", attackerId: "a4", targetId: "t4" },
            envelope,
        );
        expect(noAim.targetCell).toBeUndefined();
        expect(noAim.targetSide).toBeUndefined();
        expect(createGameActionFromPlayAction(noAim)).toMatchObject({
            type: "range_attack",
            attackerId: "a4",
            targetId: "t4",
            aimCell: undefined,
            aimSide: undefined,
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

    it("maps placement, splitting, deletion, and attack type selection", () => {
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

        expect(createPlayActionFromGameAction({ type: "split_unit", unitId: "u4", amount: 3 }, envelope)).toMatchObject(
            {
                type: PlayActionType.SPLIT_UNIT,
                unitId: "u4",
                amount: 3,
            },
        );
    });

    it("maps request_additional_time carrying the requesting team", () => {
        expect(
            createPlayActionFromGameAction({ type: "request_additional_time", team: TeamVals.UPPER }, envelope),
        ).toMatchObject({
            type: PlayActionType.REQUEST_ADDITIONAL_TIME,
            team: TeamVals.UPPER,
        });
    });

    it("maps an augment carrying category (attackType) + level (amount) + team", () => {
        expect(
            createPlayActionFromGameAction(
                { type: "augment", team: TeamVals.UPPER, augmentKind: "Might", augmentValue: 17 },
                envelope,
            ),
        ).toMatchObject({
            type: PlayActionType.AUGMENT,
            team: TeamVals.UPPER,
            attackType: 3, // Might
            amount: 17,
        });
    });
});

describe("createGameActionFromPlayAction", () => {
    it("maps protocol movement and attack actions back to common actions", () => {
        expect(
            createGameActionFromPlayAction({
                type: PlayActionType.MELEE_ATTACK,
                unitId: "a1",
                targetUnitId: "t1",
                attackFrom: { x: 2, y: 3 },
                path: [{ x: 2, y: 2 }],
                hasWaterCell: true,
            }),
        ).toEqual({
            type: "melee_attack",
            attackerId: "a1",
            targetId: "t1",
            attackFrom: { x: 2, y: 3 },
            path: [{ x: 2, y: 2 }],
            hasLavaCell: undefined,
            hasWaterCell: true,
        });

        expect(
            createGameActionFromPlayAction({
                type: PlayActionType.MOVE_UNIT,
                unitId: "u1",
                path: [{ x: 1, y: 1 }],
                targetCells: [{ x: 1, y: 2 }],
            }),
        ).toEqual({
            type: "move_unit",
            unitId: "u1",
            path: [{ x: 1, y: 1 }],
            targetCells: [{ x: 1, y: 2 }],
            hasLavaCell: undefined,
            hasWaterCell: undefined,
        });
    });

    it("maps protocol placement and turn actions back to common actions", () => {
        expect(
            createGameActionFromPlayAction({
                type: PlayActionType.PLACE_UNIT,
                unitId: "u1",
                team: TeamVals.UPPER,
                unitName: "Peasant",
                cells: [{ x: 10, y: 11 }],
            }),
        ).toEqual({
            type: "place_unit",
            unitId: "u1",
            team: TeamVals.UPPER,
            unitName: "Peasant",
            cells: [{ x: 10, y: 11 }],
        });

        expect(
            createGameActionFromPlayAction({
                type: PlayActionType.END_TURN,
                unitId: "u2",
                reason: "timeout",
            }),
        ).toEqual({ type: "end_turn", unitId: "u2", reason: "timeout" });

        expect(
            createGameActionFromPlayAction({
                type: PlayActionType.SPLIT_UNIT,
                unitId: "u3",
                amount: 4,
            }),
        ).toEqual({ type: "split_unit", unitId: "u3", amount: 4 });

        expect(
            createGameActionFromPlayAction({ type: PlayActionType.REQUEST_ADDITIONAL_TIME, team: TeamVals.LOWER }),
        ).toEqual({ type: "request_additional_time", team: TeamVals.LOWER });

        expect(
            createGameActionFromPlayAction({
                type: PlayActionType.AUGMENT,
                team: TeamVals.LOWER,
                attackType: 4, // Sniper
                amount: 40,
            }),
        ).toEqual({ type: "augment", team: TeamVals.LOWER, augmentKind: "Sniper", augmentValue: 40 });
    });

    it("skips protocol entries that do not describe one concrete common action", () => {
        expect(createGameActionFromPlayAction({ type: PlayActionType.PLACE_UNIT })).toBeUndefined();
        expect(createGameActionFromPlayAction({ type: PlayActionType.PING })).toBeUndefined();
    });
});
