import type { FriendGameStage } from "../api/social_client";

export interface LiveMatchBannerModel {
    gameId: string;
    /** What the banner says about the game. */
    message: string;
    /** The button label. */
    action: string;
    /** Where the button goes: the arena for a match still being accepted, otherwise the game itself. */
    target: string;
}

/**
 * The "you have a game in progress" strip. Shown on every screen except the game's own routes (the
 * board, its draft, its replay), because there the game is already in front of the player. A match that
 * is still being accepted lives in the arena's accept dialog, so its button goes there instead.
 */
export const liveMatchBannerModel = (
    liveGame: { gameId: string; stage: FriendGameStage } | undefined,
    pathname: string,
): LiveMatchBannerModel | null => {
    if (!liveGame?.gameId) {
        return null;
    }
    if (pathname.startsWith(`/game/${liveGame.gameId}`)) {
        return null;
    }
    if (liveGame.stage === "confirming") {
        if (pathname === "/play") {
            return null;
        }
        return {
            gameId: liveGame.gameId,
            message: "Match found — accept it in the arena",
            action: "Go to arena",
            target: "/play",
        };
    }
    return {
        gameId: liveGame.gameId,
        message: liveGame.stage === "pick" ? "Your draft is in progress" : "Your fight is in progress",
        action: "Return to match",
        target: `/game/${liveGame.gameId}`,
    };
};
