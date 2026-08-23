// Pre-game perk selection persistence.
//
// Perks (scouting perks) are chosen in the pre-game lobby (the screen with "Find ranked
// opponent" / "Practice vs AI") rather than during the in-game PERK pick phase. The choice is free
// to toggle until the player queues — then it is locked for the upcoming game. We persist it in
// localStorage so the in-game pick flow can read it back after the /game/:id navigation (the lobby
// and the draft are different routes) and auto-commit it via the existing POST /v1/game/perk.
//
// This mirrors the established vs-AI difficulty pattern in ./aiOpponent.ts.

import { Perk } from "@heroesofcrypto/common";

const PRE_GAME_PERK_STORAGE_KEY = "hoc:pre-game-perk";

// Default perk when the player has never picked one: THREE_REVEALS (the middle-of-the-road
// scouting option, 6 upgrade points — a sensible neutral default).
export const DEFAULT_PRE_GAME_PERK: Perk.Perk = Perk.Perk.THREE_REVEALS;

/** The perk the player chose in the lobby, or the default if none chosen yet. */
export const getPreGamePerk = (): Perk.Perk => {
    try {
        const raw = localStorage.getItem(PRE_GAME_PERK_STORAGE_KEY);
        const parsed = raw ? Number(raw) : NaN;
        // Must be one of the 3 selectable perks (THREE_REVEALS / SEE_ALL / SEE_NONE).
        if (parsed === Perk.Perk.THREE_REVEALS || parsed === Perk.Perk.SEE_ALL || parsed === Perk.Perk.SEE_NONE) {
            return parsed;
        }
    } catch {
        // Storage unavailable (private mode etc.) — fall through to default.
    }
    return DEFAULT_PRE_GAME_PERK;
};

/** Persist the player's lobby perk choice. No-op if storage is unavailable. */
export const setPreGamePerk = (perk: Perk.Perk): void => {
    try {
        localStorage.setItem(PRE_GAME_PERK_STORAGE_KEY, String(perk));
    } catch {
        // Storage unavailable — the in-game flow will fall back to the default perk.
    }
};
