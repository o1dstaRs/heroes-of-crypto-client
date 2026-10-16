/*
 * -----------------------------------------------------------------------------
 * This file is part of the game core of the Heroes of Crypto.
 *
 * Heroes of Crypto and Heroes of Crypto AI are registered trademarks.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 * -----------------------------------------------------------------------------
 */

import { TeamType, TeamVals } from "@heroesofcrypto/common";

/**
 * Which side of the battlefield a player wants to SEE their own army on.
 *
 * Purely a view preference, the way the personal army colour is: a match still seats each player on the
 * LEFT or RIGHT side (the server deals that), the engine, the log and the server still say LEFT and RIGHT,
 * and nothing about the choice leaves this browser. When the player's seat is on the other side from the
 * one they picked, their board is drawn mirrored left-to-right, so their army stands where they like it.
 *
 * "seat" is the default and changes nothing: the player sees the side the match dealt them, which is what
 * every screen showed before this setting existed.
 *
 * Mirroring is only ever for a seated player in a live fight. Replays keep the true sides, green on the left
 * and red on the right, and so do observers, who have no side of their own. Sandboxes keep them too, because
 * one person often plays both armies there (see `personalArmyTintSeat`, which this follows).
 */
export type BoardSidePreference = "seat" | "left" | "right";

export const DEFAULT_BOARD_SIDE_PREFERENCE: BoardSidePreference = "seat";

export const BOARD_SIDE_PREFERENCES: readonly BoardSidePreference[] = ["seat", "left", "right"];

const isBoardSidePreference = (value: unknown): value is BoardSidePreference =>
    typeof value === "string" && (BOARD_SIDE_PREFERENCES as readonly string[]).includes(value);

export interface IBoardMirrorContext {
    /** The seat this client plays. Undefined for observers and replays, and for sandboxes (see the note above). */
    viewerTeam: TeamType | undefined;
    preference: BoardSidePreference;
    /** False while replaying: a replay always shows the match the way it was dealt. */
    live: boolean;
}

/** Whether this viewer's board should be drawn mirrored left-to-right. */
export const shouldMirrorBoard = (context: IBoardMirrorContext): boolean => {
    if (!context.live) {
        return false;
    }
    if (context.preference === "left") {
        return context.viewerTeam === TeamVals.RIGHT;
    }
    if (context.preference === "right") {
        return context.viewerTeam === TeamVals.LEFT;
    }
    return false;
};

const STORAGE_KEY = "hoc.ranked.boardSide";

/**
 * The stored preference. Every access is guarded: storage throws outright in a privacy-mode browser, and a
 * view preference must never be the reason a fight fails to render.
 */
export const readBoardSidePreference = (): BoardSidePreference => {
    try {
        const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
        if (isBoardSidePreference(stored)) {
            return stored;
        }
    } catch {
        // storage unavailable: fall through to the default
    }

    return DEFAULT_BOARD_SIDE_PREFERENCE;
};

export const writeBoardSidePreference = (preference: BoardSidePreference): void => {
    try {
        globalThis.localStorage?.setItem(STORAGE_KEY, preference);
    } catch {
        // storage unavailable: the choice simply does not persist past this session
    }
};
