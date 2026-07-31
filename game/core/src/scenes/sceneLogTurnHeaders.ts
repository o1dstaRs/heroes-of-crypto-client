/*
 * -----------------------------------------------------------------------------
 * This file is part of the browser implementation of the Heroes of Crypto game client.
 *
 * Heroes of Crypto and Heroes of Crypto AI are registered trademarks.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 * -----------------------------------------------------------------------------
 */

/**
 * Turn headers in the scene log. The log travels as a flat newline-joined string (scene ->
 * PixiGameManager.onAttackLanded -> FightLog), so a turn boundary is itself a line: a header marked
 * by this prefix. Both feeders emit it — ranked from the journal's next_unit_selected events, sandbox
 * when the engine hands the turn over — and the FightLog renderer folds the flat list into per-turn
 * groups by scanning for it. The prefix is stripped for display and for clipboard export.
 */
export const TURN_LOG_HEADER_PREFIX = "⌖ ";

/** A header line: "⌖ 🟢 Fairy — Lap 2" (flag omitted when the team is unknown). */
export const formatTurnLogHeader = (teamFlag: string, unitName: string, lap: number): string =>
    `${TURN_LOG_HEADER_PREFIX}${teamFlag ? `${teamFlag} ` : ""}${unitName} — Lap ${lap}`;

/** The header's display label ("🟢 Fairy — Lap 2"), or undefined for a regular log line. */
export const parseTurnLogHeaderLabel = (line: string): string | undefined =>
    line.startsWith(TURN_LOG_HEADER_PREFIX) ? line.slice(TURN_LOG_HEADER_PREFIX.length) : undefined;
