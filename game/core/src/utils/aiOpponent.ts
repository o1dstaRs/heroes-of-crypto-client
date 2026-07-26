// Client-side recognition of the persistent bot seat ("Play vs AI" mode).
//
// The server encodes the AI marker in the seat's playerId itself: "ai:<version>:<seat>:" padded to
// the 36-character player-id contract (see server api/game/v1/ai_seat.ts). The ranked play snapshot
// exposes that playerId, so any surface that renders an opponent identity can label the bot —
// e.g. "AI — Hard (v0.7)" — without extra wire fields. The <seat> component carries the difficulty
// tier ("easy"/"normal"/"hard"/"brutal") for games created with a difficulty; older games use the
// tier-less "default" seat and degrade to the version-only label.

export const AI_SEAT_PLAYER_ID_PREFIX = "ai:";

// Mirrors the server's VS_AI_DIFFICULTY_TIERS (api/game/v1/ai_seat.ts): easy=v0.4, normal=v0.6,
// hard=v0.7 (no rollout search), brutal=v0.7 + per-match rollout search.
export type VsAiDifficulty = "easy" | "normal" | "hard" | "brutal";

export const VS_AI_DIFFICULTIES: readonly VsAiDifficulty[] = ["easy", "normal", "hard", "brutal"];

export const DEFAULT_VS_AI_DIFFICULTY: VsAiDifficulty = "normal";

export const VS_AI_DIFFICULTY_VERSIONS: Readonly<Record<VsAiDifficulty, string>> = {
    easy: "v0.4",
    normal: "v0.6",
    hard: "v0.7",
    brutal: "v0.7",
};

const VS_AI_DIFFICULTY_TITLES: Readonly<Record<VsAiDifficulty, string>> = {
    easy: "Easy",
    normal: "Normal",
    hard: "Hard",
    brutal: "Brutal",
};

export const parseVsAiDifficulty = (raw?: string | null): VsAiDifficulty | undefined => {
    const normalized = raw?.trim().toLowerCase();
    return normalized && (VS_AI_DIFFICULTIES as readonly string[]).includes(normalized)
        ? (normalized as VsAiDifficulty)
        : undefined;
};

/** "AI — Hard (v0.7)" — the shared tier label used by the selector, pick phase, fight, and end screen. */
export const vsAiDifficultyLabel = (difficulty: VsAiDifficulty): string =>
    `AI — ${VS_AI_DIFFICULTY_TITLES[difficulty]} (${VS_AI_DIFFICULTY_VERSIONS[difficulty]})`;

export const isAiSeatPlayerId = (playerId?: string): boolean =>
    !!playerId && playerId.startsWith(AI_SEAT_PLAYER_ID_PREFIX);

export const hasAiSeatPlayer = (players?: readonly { playerId?: string }[]): boolean =>
    !!players?.some((player) => isAiSeatPlayerId(player.playerId));

export const getAiSeatVersion = (playerId?: string): string | undefined => {
    if (!playerId || !isAiSeatPlayerId(playerId)) {
        return undefined;
    }

    return playerId.slice(AI_SEAT_PLAYER_ID_PREFIX.length).split(":", 1)[0] || undefined;
};

/** The difficulty tier encoded in an AI seat playerId's seat component, if present. */
export const getAiSeatDifficulty = (playerId?: string): VsAiDifficulty | undefined => {
    if (!playerId || !isAiSeatPlayerId(playerId)) {
        return undefined;
    }

    return parseVsAiDifficulty(playerId.slice(AI_SEAT_PLAYER_ID_PREFIX.length).split(":")[1]);
};

/** The AI seat's playerId out of a snapshot player list (a vs-AI game has exactly one). */
export const findAiSeatPlayerId = (players?: readonly { playerId?: string }[]): string | undefined =>
    players?.find((player) => isAiSeatPlayerId(player.playerId))?.playerId;

/**
 * "AI — Hard (v0.7)" for a difficulty-tier seat, "AI (v0.7)" for a tier-less legacy seat, "AI" when
 * even the version is missing; undefined for a human (or unknown) opponent.
 */
export const aiOpponentLabel = (playerId?: string): string | undefined => {
    if (!isAiSeatPlayerId(playerId)) {
        return undefined;
    }

    const difficulty = getAiSeatDifficulty(playerId);
    if (difficulty) {
        return vsAiDifficultyLabel(difficulty);
    }

    const version = getAiSeatVersion(playerId);
    return version ? `AI (${version})` : "AI";
};

// --- vs-AI game marker -------------------------------------------------------
// The pick phase never sees the opponent's playerId (GamePublic carries no seat ids and the play
// session doesn't exist yet), so the client remembers the game it just created via "Play vs AI" and
// the draft UI labels the opponent from that. A player can only be in one game at a time, so a
// single slot suffices. Degrades gracefully (generic "Opponent") in a different browser/tab.
// The chosen difficulty rides along so the pick-phase label shows the tier and "Play Again vs AI"
// can repeat it.
const VS_AI_GAME_STORAGE_KEY = "hoc:vs-ai-game";
const VS_AI_DIFFICULTY_STORAGE_KEY = "hoc:vs-ai-difficulty";

export const markVsAiGame = (gameId: string, difficulty?: VsAiDifficulty): void => {
    try {
        localStorage.setItem(VS_AI_GAME_STORAGE_KEY, gameId);
        if (difficulty) {
            localStorage.setItem(VS_AI_DIFFICULTY_STORAGE_KEY, difficulty);
        } else {
            localStorage.removeItem(VS_AI_DIFFICULTY_STORAGE_KEY);
        }
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

/** The difficulty remembered for the marked vs-AI game; undefined for other games or legacy markers. */
export const getMarkedVsAiDifficulty = (gameId?: string): VsAiDifficulty | undefined => {
    if (!isMarkedVsAiGame(gameId)) {
        return undefined;
    }

    try {
        return parseVsAiDifficulty(localStorage.getItem(VS_AI_DIFFICULTY_STORAGE_KEY));
    } catch {
        return undefined;
    }
};
