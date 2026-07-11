// Client-side recognition of the persistent bot seat ("Play vs AI" mode).
//
// The server encodes the AI marker in the seat's playerId itself: "ai:<version>:<seat>:" padded to
// the 36-character player-id contract (see server api/game/v1/ai_seat.ts). The ranked play snapshot
// exposes that playerId, so any surface that renders an opponent identity can label the bot —
// e.g. "AI (v0.7)" — without extra wire fields.

export const AI_SEAT_PLAYER_ID_PREFIX = "ai:";

export const isAiSeatPlayerId = (playerId?: string): boolean =>
    !!playerId && playerId.startsWith(AI_SEAT_PLAYER_ID_PREFIX);

export const getAiSeatVersion = (playerId?: string): string | undefined => {
    if (!playerId || !isAiSeatPlayerId(playerId)) {
        return undefined;
    }

    return playerId.slice(AI_SEAT_PLAYER_ID_PREFIX.length).split(":", 1)[0] || undefined;
};

/** "AI (v0.7)" for an AI seat playerId; undefined for a human (or unknown) opponent. */
export const aiOpponentLabel = (playerId?: string): string | undefined => {
    if (!isAiSeatPlayerId(playerId)) {
        return undefined;
    }

    const version = getAiSeatVersion(playerId);
    return version ? `AI (${version})` : "AI";
};

// --- vs-AI game marker -------------------------------------------------------
// The pick phase never sees the opponent's playerId (GamePublic carries no seat ids and the play
// session doesn't exist yet), so the client remembers the game it just created via "Play vs AI" and
// the draft UI labels the opponent from that. A player can only be in one game at a time, so a
// single slot suffices. Degrades gracefully (generic "Opponent") in a different browser/tab.
const VS_AI_GAME_STORAGE_KEY = "hoc:vs-ai-game";

export const markVsAiGame = (gameId: string): void => {
    try {
        localStorage.setItem(VS_AI_GAME_STORAGE_KEY, gameId);
    } catch {
        // Storage unavailable (private mode etc.) — labeling degrades to "Opponent".
    }
};

export const isMarkedVsAiGame = (gameId?: string): boolean => {
    if (!gameId) {
        return false;
    }

    try {
        return localStorage.getItem(VS_AI_GAME_STORAGE_KEY) === gameId;
    } catch {
        return false;
    }
};
