import { axiosMMInstance, endpoints } from "./axios";

export interface PublicRankedMatchPlayer {
    playerId: string;
    username: string;
    side: "lower" | "upper";
    /** "none": an unscored or voided match, where neither player won or lost. */
    result: "win" | "loss" | "draw" | "none";
    calibration: boolean;
    mmrBefore: number;
    mmrAfter: number;
    delta: number;
    goldEarned: number;
}

/** How an early ending was resolved (the server's exit resolver), as the public match record shows it. */
export interface PublicRankedExit {
    kind: "concede" | "abandon" | "void" | string;
    cause: string;
    leaverPlayerId: string;
    scored: boolean;
    unscoredReason: string;
    boardBp: number;
    phase: string;
    lap: number;
    enforced: boolean;
}

export interface PublicRankedMatch {
    gameId: string;
    winnerPlayerId: string;
    players: PublicRankedMatchPlayer[];
    outcome?: "win" | "draw" | "none";
    reason?: string;
    exit?: PublicRankedExit | null;
}

/** Load the authoritative public settlement written when a ranked fight finishes. */
export const fetchPublicRankedMatch = async (gameId: string): Promise<PublicRankedMatch> => {
    const response = await axiosMMInstance.get(`${endpoints.mm.rankedMatch}/${encodeURIComponent(gameId)}`);
    return response.data as PublicRankedMatch;
};
