import type { TeamType } from "@heroesofcrypto/common";

import { PlayPhase, type PlaySnapshot } from "../api/play_protocol";
import type { LocalModelOpponentConfig } from "../scenes/LocalModelOpponent";

export const shouldApplyActionResponseSnapshotToViewer = (
    snapshot: PlaySnapshot,
    options: { isModelSubmission: boolean },
): boolean =>
    !options.isModelSubmission ||
    snapshot.phase !== PlayPhase.PLACEMENT ||
    snapshot.fightStarted ||
    snapshot.fightFinished;

export const resolveEffectiveLocalModelOpponentConfig = (
    config: LocalModelOpponentConfig,
    snapshot: PlaySnapshot | null,
): LocalModelOpponentConfig => {
    if (!config.enabled || !snapshot || !config.playerId) {
        return config;
    }

    const modelPlayer = snapshot.players.find((player) => player.playerId === config.playerId);
    if (!modelPlayer || modelPlayer.team === config.modelTeam) {
        return config;
    }

    return {
        ...config,
        modelTeam: modelPlayer.team as TeamType,
    };
};
