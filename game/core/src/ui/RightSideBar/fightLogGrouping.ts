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

import { parseTurnLogHeaderLabel, TURN_LOG_HEADER_PREFIX } from "../../scenes/sceneLogTurnHeaders";

/**
 * One rendered group of the fight log: a turn (its header label + that turn's lines in chronological
 * order), or the headerless block of lines that precede any turn (fight start, spawns).
 */
export interface IFightLogGroup<T> {
    /** Display label ("🟢 Fairy — Lap 2"); undefined for the pre-turn block. */
    headerLabel?: string;
    /** The header's own entry (it carries the stable id/animation of its row); undefined pre-turn. */
    headerEntry?: T;
    /** The turn's lines in CHRONOLOGICAL order (oldest first) — natural reading inside a group. */
    entries: T[];
}

/**
 * Fold the flat newest-first log entries into turn groups. A header line marks the START of its turn,
 * so everything newer than it (up to the next header) is that turn's actions. Groups come out
 * newest-turn-first — matching the panel's newest-at-top convention — while lines INSIDE a group read
 * top-to-bottom in the order they happened.
 */
export const groupFightLogEntries = <T>(entries: readonly T[], textOf: (entry: T) => string): IFightLogGroup<T>[] => {
    const groups: IFightLogGroup<T>[] = [];
    let pending: T[] = [];
    for (const entry of entries) {
        const label = parseTurnLogHeaderLabel(textOf(entry));
        if (label !== undefined) {
            groups.push({ headerLabel: label, headerEntry: entry, entries: [...pending].reverse() });
            pending = [];
        } else {
            pending.push(entry);
        }
    }
    if (pending.length) {
        groups.push({ entries: [...pending].reverse() });
    }
    return groups;
};

/**
 * The clipboard/chronological export form of a log line: turn headers become a readable divider, all
 * other lines pass through unchanged.
 */
export const fightLogExportLine = (line: string): string => {
    const label = parseTurnLogHeaderLabel(line);
    return label === undefined ? line : `── ${label} ──`;
};

/**
 * The whole log as clipboard text: the panel stores lines newest-first, but a pasted chronicle should
 * read top-to-bottom in the order it happened — oldest first, turn headers as dividers.
 */
export const fightLogClipboardText = (newestFirstLines: readonly string[]): string =>
    [...newestFirstLines].reverse().map(fightLogExportLine).join("\n");

export { TURN_LOG_HEADER_PREFIX };
