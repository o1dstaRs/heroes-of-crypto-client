/**
 * The fight log names each actor in its army's own colour instead of printing a coloured bead beside it.
 *
 * The scenes emit an identity mark ("🟢 Fairy moved to (4, 5)") and the log used to render that emoji,
 * shrunk to half size, exactly where it stood. Two marks per row — the header's and the action's — read as
 * decoration rather than information, so the mark is now consumed here: it is dropped from the rendered
 * row and its colour is applied to the name that follows it. The emitted line and the clipboard export
 * keep the emoji, which is what makes an exported log readable outside the game.
 *
 * The name is the run of capitalised words directly after the mark ("Wandering Mage", "White Tiger"),
 * which ends at the first lowercase verb ("moved", "uses"), at the em dash of a turn header, or at an
 * action emoji. Three words is the cap: no creature is longer, and the cap keeps a line that arrives
 * already upper-cased from being painted end to end.
 */

/** The two identity marks the scenes emit, spelled out so they survive every editor and diff tool. */
const GREEN_TEAM_MARK = "\u{1F7E2}";
const RED_TEAM_MARK = "\u{1F534}";

/** Every mark a scene may emit: the two team identities plus the personal army-colour palette. */
export const FIGHT_LOG_MARK_COLORS: Readonly<Record<string, string>> = Object.freeze({
    "🟢": "#4fd06a",
    "🔴": "#ff5a52",
    "🔵": "#5aa9e6",
    "🟡": "#ffd24a",
    "🟠": "#ff9a3c",
    "🟣": "#b07bff",
    "🟤": "#c08a55",
    "⚫": "#9aa0a6",
    "⚪": "#e8e0c8",
});

import { TeamType, TeamVals } from "@heroesofcrypto/common";

const MARK_SPLIT_PATTERN = /([\u{1F534}\u{1F7E2}\u{1F535}\u{1F7E1}\u{1F7E0}\u{1F7E3}\u{1F7E4}\u26AB\u26AA]\uFE0F?)/u;
/** A leading run of at most three capitalised words — the actor's name, and never the sentence after it. */
const LEADING_NAME_PATTERN = /^[  ]*(\p{Lu}[^\s]*(?:[  ]+\p{Lu}[^\s]*){0,2})/u;

export interface IFightLogSegment {
    text: string;
    /** Set only on the actor's name; every other segment keeps the row's own colour. */
    color?: string;
    /** The mark this name came from, so a caller can resolve a personal army colour for it. */
    mark?: string;
}

/** The team a mark identifies, for the two identity marks the scenes emit. */
export const fightLogMarkTeam = (mark: string): TeamType | undefined => {
    const bare = mark.replace("\uFE0F", "");
    if (bare === GREEN_TEAM_MARK) return TeamVals.LEFT;
    if (bare === RED_TEAM_MARK) return TeamVals.RIGHT;
    return undefined;
};

/** Split one rendered row into colourless text and the coloured name(s) the marks pointed at. */
export const fightLogSegments = (line: string): IFightLogSegment[] => {
    const parts = line.split(MARK_SPLIT_PATTERN);
    const segments: IFightLogSegment[] = [];
    const push = (text: string, color?: string, mark?: string): void => {
        if (!text) return;
        const last = segments[segments.length - 1];
        if (last && last.color === color && last.mark === mark) {
            last.text += text;
            return;
        }
        segments.push(color === undefined ? { text } : { text, color, mark });
    };

    for (let index = 0; index < parts.length; index += 1) {
        const part = parts[index];
        if (index % 2 === 0) {
            push(part);
            continue;
        }
        // The mark itself never reaches the row. It only says which colour the next name wears.
        const color = FIGHT_LOG_MARK_COLORS[part.replace("️", "")];
        const rest = parts[index + 1] ?? "";
        const named = color ? LEADING_NAME_PATTERN.exec(rest) : null;
        if (!named) {
            continue;
        }
        push(named[1], color, part);
        parts[index + 1] = rest.slice(named[0].length);
    }

    // A dropped leading mark must not leave the row indented by the space that followed it.
    if (segments.length > 0 && segments[0].color === undefined) {
        segments[0].text = segments[0].text.replace(/^[  ]+/u, "");
        if (!segments[0].text) segments.shift();
    }
    return segments;
};
