import { axiosMMInstance, endpoints } from "./axios";

export interface PublicRankedMatchPlayer {
    playerId: string;
    username: string;
    side: "lower" | "upper";
    result: "win" | "loss" | "draw";
    calibration: boolean;
    mmrBefore: number;
    mmrAfter: number;
    delta: number;
    goldEarned: number;
}

export interface PublicRankedMatch {
    gameId: string;
    winnerPlayerId: string;
    players: PublicRankedMatchPlayer[];
}

/** Load the authoritative public settlement written when a ranked fight finishes. */
export const fetchPublicRankedMatch = async (gameId: string): Promise<PublicRankedMatch> => {
    const response = await axiosMMInstance.get(`${endpoints.mm.rankedMatch}/${encodeURIComponent(gameId)}`);
    return response.data as PublicRankedMatch;
};
