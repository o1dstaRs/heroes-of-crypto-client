import type { TeamType } from "@heroesofcrypto/common";

import { GridConstants } from "@heroesofcrypto/common";

import { PlayActionType, PlayPhase, type PlayAction, type PlaySnapshot } from "../api/play_protocol";
import type { LocalModelOpponentConfig } from "../scenes/LocalModelOpponent";

// Never submit an action carrying an off-grid / non-integer cell: the server rejects it as
// invalid_cell (validateActionShape) and a jammed unit that keeps retrying storms the player with
// errors — drop the doomed submit locally instead. OBSTACLE_ATTACK's targetCell is the one
// exemption, mirroring the server: it carries a WORLD position (the struck point on the mountain),
// not a grid cell, so bounds-checking it dropped every legitimate ranked mountain attack.
export const hasOffGridSubmitCell = (
    payload: Pick<PlayAction, "type"> &
        Partial<Pick<PlayAction, "cells" | "path" | "targetCells" | "attackFrom" | "targetCell">>,
): boolean => {
    const cellInBounds = (c?: { x: number; y: number }): boolean =>
        !c ||
        (Number.isInteger(c.x) &&
            Number.isInteger(c.y) &&
            c.x >= 0 &&
            c.y >= 0 &&
            c.x < GridConstants.GRID_SIZE &&
            c.y < GridConstants.GRID_SIZE);
    const submittedCells = [
        ...(payload.cells ?? []),
        ...(payload.path ?? []),
        ...(payload.targetCells ?? []),
        payload.attackFrom,
        ...(payload.type === PlayActionType.OBSTACLE_ATTACK ? [] : [payload.targetCell]),
    ];
    return !submittedCells.every(cellInBounds);
};

export const shouldApplyActionResponseSnapshotToViewer = (
    snapshot: PlaySnapshot,
    options: { isModelSubmission: boolean },
): boolean =>
    !options.isModelSubmission ||
    snapshot.phase !== PlayPhase.PLACEMENT ||
    snapshot.fightStarted ||
    snapshot.fightFinished;

// The play-events SSE stream's `message` field is informational, not an error — for an
// ACTION_ACCEPTED broadcast it's literally the raw PlayActionType name (e.g. "RANGE_ATTACK",
// "END_TURN"; see play_session.ts's actionTypeName), sent on every accepted action including ones
// this client didn't submit. Surfacing `message` in the danger-styled error banner flashed that raw
// enum label in the HUD after every turn. Only `rejectionReason` — non-empty exclusively on a real
// rejection — belongs there.
export const rejectionErrorFromPlayEvent = (event: { rejectionReason: string; message: string }): string =>
    event.rejectionReason;

export const shouldRecoverRejectedMoveFollowUp = (
    pendingUnitId: string | undefined,
    action: Pick<PlayAction, "type"> & Partial<Pick<PlayAction, "unitId">>,
): boolean =>
    !!pendingUnitId &&
    action.unitId === pendingUnitId &&
    action.type !== PlayActionType.MOVE_UNIT &&
    action.type !== PlayActionType.PING &&
    action.type !== PlayActionType.END_TURN;

export const resolveEffectiveLocalModelOpponentConfig = (
    config: LocalModelOpponentConfig,
    snapshot: PlaySnapshot | null,
    viewerTeam?: TeamType,
): LocalModelOpponentConfig => {
    if (!config.enabled || !snapshot || !config.playerId) {
        return viewerTeam !== undefined && config.modelTeam === viewerTeam ? { ...config, enabled: false } : config;
    }

    const modelPlayer = snapshot.players.find((player) => player.playerId === config.playerId);
    const resolvedModelTeam = (modelPlayer?.team as TeamType | undefined) ?? config.modelTeam;
    if (viewerTeam !== undefined && resolvedModelTeam === viewerTeam) {
        return { ...config, enabled: false, modelTeam: resolvedModelTeam };
    }

    return {
        ...config,
        modelTeam: resolvedModelTeam,
    };
};
