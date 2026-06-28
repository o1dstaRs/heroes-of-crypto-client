import type { GameAction, TeamType } from "@heroesofcrypto/common";

import { PlayActionType, type PlayAction, type PlayCell } from "./play_protocol";

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

const cloneCells = (cells?: PlayCell[]): PlayCell[] => (cells ?? []).map((cell) => ({ x: cell.x, y: cell.y }));

const maybeCell = (cell?: PlayCell): PlayCell | undefined =>
    cell && Number.isFinite(cell.x) && Number.isFinite(cell.y) ? { x: cell.x, y: cell.y } : undefined;

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
                // Aim intent only: which target cell + which of its sides. The server validates and
                // reconstructs the trajectory; no raw position is ever sent. Side is 1-based so LEFT
                // (0) survives the varint zero-skip.
                targetCell: maybeCell(action.aimCell),
                targetSide: action.aimSide !== undefined ? action.aimSide + 1 : undefined,
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
        case "split_unit":
            return withEnvelope(envelope, {
                type: PlayActionType.SPLIT_UNIT,
                unitId: action.unitId,
                amount: action.amount,
            });
        case "delete_unit":
            return withEnvelope(envelope, { type: PlayActionType.DELETE_UNIT, unitId: action.unitId });
    }
};

export const createGameActionFromPlayAction = (action: Partial<PlayAction>): GameAction | undefined => {
    switch (action.type) {
        case PlayActionType.PLACE_UNIT:
            if (!action.unitId || typeof action.team !== "number" || !action.unitName) {
                return undefined;
            }
            return {
                type: "place_unit",
                unitId: action.unitId,
                team: action.team as TeamType,
                unitName: action.unitName,
                cells: cloneCells(action.cells),
            };
        case PlayActionType.START_FIGHT:
            return { type: "start_fight" };
        case PlayActionType.END_TURN:
            if (!action.unitId) {
                return undefined;
            }
            return {
                type: "end_turn",
                unitId: action.unitId,
                reason: action.reason === "timeout" || action.reason === "effect" ? action.reason : "manual",
            };
        case PlayActionType.WAIT_TURN:
            return action.unitId ? { type: "wait_turn", unitId: action.unitId } : undefined;
        case PlayActionType.DEFEND_TURN:
            return action.unitId ? { type: "defend_turn", unitId: action.unitId } : undefined;
        case PlayActionType.SELECT_ATTACK_TYPE:
            return action.unitId && typeof action.attackType === "number"
                ? { type: "select_attack_type", unitId: action.unitId, attackType: action.attackType }
                : undefined;
        case PlayActionType.MOVE_UNIT:
            return action.unitId
                ? {
                      type: "move_unit",
                      unitId: action.unitId,
                      path: cloneCells(action.path),
                      targetCells: cloneCells(action.targetCells),
                      hasLavaCell: action.hasLavaCell,
                      hasWaterCell: action.hasWaterCell,
                  }
                : undefined;
        case PlayActionType.MELEE_ATTACK: {
            const attackFrom = maybeCell(action.attackFrom);
            return action.unitId && action.targetUnitId && attackFrom
                ? {
                      type: "melee_attack",
                      attackerId: action.unitId,
                      targetId: action.targetUnitId,
                      attackFrom,
                      path: cloneCells(action.path),
                      hasLavaCell: action.hasLavaCell,
                      hasWaterCell: action.hasWaterCell,
                  }
                : undefined;
        }
        case PlayActionType.RANGE_ATTACK: {
            if (!action.unitId || !action.targetUnitId) {
                return undefined;
            }
            const aimCell = maybeCell(action.targetCell);
            return {
                type: "range_attack",
                attackerId: action.unitId,
                targetId: action.targetUnitId,
                aimCell,
                // Decode the 1-based wire side back to RangeAttackCellSide; only meaningful with a cell.
                aimSide: aimCell && action.targetSide ? action.targetSide - 1 : undefined,
            };
        }
        case PlayActionType.OBSTACLE_ATTACK: {
            const targetPosition = maybeCell(action.targetCell);
            return action.unitId && targetPosition
                ? {
                      type: "obstacle_attack",
                      attackerId: action.unitId,
                      targetPosition,
                      attackFrom: maybeCell(action.attackFrom),
                      path: cloneCells(action.path),
                      hasLavaCell: action.hasLavaCell,
                      hasWaterCell: action.hasWaterCell,
                  }
                : undefined;
        }
        case PlayActionType.AREA_THROW_ATTACK: {
            const targetCell = maybeCell(action.targetCell);
            return action.unitId && targetCell
                ? { type: "area_throw_attack", attackerId: action.unitId, targetCell }
                : undefined;
        }
        case PlayActionType.CAST_SPELL:
            return action.unitId && action.spellName
                ? {
                      type: "cast_spell",
                      casterId: action.unitId,
                      spellName: action.spellName,
                      targetId: action.targetUnitId || undefined,
                      targetCell: maybeCell(action.targetCell),
                  }
                : undefined;
        case PlayActionType.DELETE_UNIT:
            return action.unitId ? { type: "delete_unit", unitId: action.unitId } : undefined;
        case PlayActionType.SPLIT_UNIT:
            return action.unitId && typeof action.amount === "number"
                ? { type: "split_unit", unitId: action.unitId, amount: action.amount }
                : undefined;
        default:
            return undefined;
    }
};
