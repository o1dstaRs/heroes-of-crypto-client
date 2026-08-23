// Pre-game doctrine selection persistence.
//
// Doctrines (scouting doctrines) are chosen in the pre-game lobby (the screen with "Find ranked
// opponent" / "Practice vs AI") rather than during the in-game DOCTRINE pick phase. The choice is free
// to toggle until the player queues — then it is locked for the upcoming game. We persist it in
// localStorage so the in-game pick flow can read it back after the /game/:id navigation (the lobby
// and the draft are different routes) and auto-commit it via the existing POST /v1/game/doctrine.
//
// This mirrors the established vs-AI difficulty pattern in ./aiOpponent.ts.

import { Doctrine } from "@heroesofcrypto/common";

const PRE_GAME_DOCTRINE_STORAGE_KEY = "hoc:pre-game-doctrine";

// Default doctrine when the player has never picked one: THREE_REVEALS (the middle-of-the-road
// scouting option, 6 upgrade points — a sensible neutral default).
export const DEFAULT_PRE_GAME_DOCTRINE: Doctrine.Doctrine = Doctrine.Doctrine.THREE_REVEALS;

/** The doctrine the player chose in the lobby, or the default if none chosen yet. */
export const getPreGameDoctrine = (): Doctrine.Doctrine => {
    try {
        const raw = localStorage.getItem(PRE_GAME_DOCTRINE_STORAGE_KEY);
        const parsed = raw ? Number(raw) : NaN;
        // Must be one of the 3 selectable doctrines (THREE_REVEALS / SEE_ALL / SEE_NONE).
        if (
            parsed === Doctrine.Doctrine.THREE_REVEALS ||
            parsed === Doctrine.Doctrine.SEE_ALL ||
            parsed === Doctrine.Doctrine.SEE_NONE
        ) {
            return parsed;
        }
    } catch {
        // Storage unavailable (private mode etc.) — fall through to default.
    }
    return DEFAULT_PRE_GAME_DOCTRINE;
};

/** Persist the player's lobby doctrine choice. No-op if storage is unavailable. */
export const setPreGameDoctrine = (doctrine: Doctrine.Doctrine): void => {
    try {
        localStorage.setItem(PRE_GAME_DOCTRINE_STORAGE_KEY, String(doctrine));
    } catch {
        // Storage unavailable — the in-game flow will fall back to the default doctrine.
    }
};
