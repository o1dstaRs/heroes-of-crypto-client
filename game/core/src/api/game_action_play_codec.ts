import type { GameAction, TeamType } from "@heroesofcrypto/common";

import { PlayActionType, type PlayAction } from "./play_protocol";

type PlayActionEnvelope = {
    actionId: string;
    gameId: string;
    playerId: string;
    expectedSequence: number;
    team: TeamType;
};

type PlayActionBody = Omit<PlayAction, "actionId" | "gameId" | "playerId" | "expectedSequence">;

const withEnvelope = (envelope: PlayActionEnvelope, action: PlayActionBody): PlayAction => ({
    actionId: envelope.actionId,
    gameId: envelope.gameId,
    playerId: envelope.playerId,
    expectedSequence: envelope.expectedSequence,
    team: envelope.team,
    ...action,
});

export const createPlayActionFromGameAction = (action: GameAction, envelope: PlayActionEnvelope): PlayAction => {
    switch (action.type) {
        case "start_fight":
            return withEnvelope(envelope, { type: PlayActionType.START_FIGHT });
        case "end_turn":
            return withEnvelope(envelope, {
                type: PlayActionType.END_TURN,
                unitId: action.unitId,
                reason: action.reason ?? "manual",
            });
        case "wait_turn":
            return withEnvelope(envelope, { type: PlayActionType.WAIT_TURN, unitId: action.unitId });
        case "defend_turn":
            return withEnvelope(envelope, { type: PlayActionType.DEFEND_TURN, unitId: action.unitId });
        case "select_attack_type":
            return withEnvelope(envelope, {
                type: PlayActionType.SELECT_ATTACK_TYPE,
                unitId: action.unitId,
                attackType: action.attackType,
            });
        case "move_unit":
            return withEnvelope(envelope, {
                type: PlayActionType.MOVE_UNIT,
                unitId: action.unitId,
                path: action.path,
                targetCells: action.targetCells,
                hasLavaCell: action.hasLavaCell,
                hasWaterCell: action.hasWaterCell,
            });
        case "melee_attack":
            return withEnvelope(envelope, {
                type: PlayActionType.MELEE_ATTACK,
                unitId: action.attackerId,
                targetUnitId: action.targetId,
                attackFrom: action.attackFrom,
                path: action.path,
                hasLavaCell: action.hasLavaCell,
                hasWaterCell: action.hasWaterCell,
            });
        case "range_attack":
            return withEnvelope(envelope, {
                type: PlayActionType.RANGE_ATTACK,
                unitId: action.attackerId,
                targetUnitId: action.targetId,
            });
        case "obstacle_attack":
            return withEnvelope(envelope, {
                type: PlayActionType.OBSTACLE_ATTACK,
                unitId: action.attackerId,
                targetCell: action.targetPosition,
                attackFrom: action.attackFrom,
                path: action.path,
                hasLavaCell: action.hasLavaCell,
                hasWaterCell: action.hasWaterCell,
            });
        case "area_throw_attack":
            return withEnvelope(envelope, {
                type: PlayActionType.AREA_THROW_ATTACK,
                unitId: action.attackerId,
                targetCell: action.targetCell,
            });
        case "cast_spell":
            return withEnvelope(envelope, {
                type: PlayActionType.CAST_SPELL,
                unitId: action.casterId,
                targetUnitId: action.targetId,
                targetCell: action.targetCell,
                spellName: action.spellName,
            });
        case "place_unit":
            return withEnvelope(envelope, {
                type: PlayActionType.PLACE_UNIT,
                unitId: action.unitId,
                unitName: action.unitName,
                team: action.team,
                cells: action.cells,
            });
        case "delete_unit":
            return withEnvelope(envelope, { type: PlayActionType.DELETE_UNIT, unitId: action.unitId });
    }
};
