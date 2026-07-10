import type { TeamType } from "@heroesofcrypto/common";

import { PlayActionType, PlayPhase, type PlayAction, type PlaySnapshot } from "../api/play_protocol";
import type { LocalModelOpponentConfig } from "../scenes/LocalModelOpponent";

export const shouldApplyActionResponseSnapshotToViewer = (
    snapshot: PlaySnapshot,
    options: { isModelSubmission: boolean },
): boolean =>
    !options.isModelSubmission ||
    snapshot.phase !== PlayPhase.PLACEMENT ||
    snapshot.fightStarted ||
    snapshot.fightFinished;

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
