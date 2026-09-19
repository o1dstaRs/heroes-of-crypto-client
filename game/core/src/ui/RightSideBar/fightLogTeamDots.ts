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

import { TeamType, TeamVals } from "@heroesofcrypto/common";

import { TEAM_COLOR_GREEN, TEAM_COLOR_RED } from "../../scenes/teamColors";

/**
 * The scenes mark every fight-log line with its side as an emoji (🟢 LEFT / 🔴 RIGHT). An emoji cannot be
 * recoloured, so a player fighting in amethyst still read a green dot beside their own units while the board
 * painted them purple. These helpers split a line around those glyphs so the panel can draw the dot itself,
 * in the colour that army is actually painted in.
 *
 * The line TEXT is untouched: the emoji stay in the stored log and in the clipboard export, so a copied log
 * still reads in the canonical team colours, and so does every surface that NAMES a side.
 */
export const TEAM_DOT_LEFT = "🟢";
export const TEAM_DOT_RIGHT = "🔴";

export type FightLogSegment = { kind: "text"; text: string } | { kind: "dot"; team: TeamType };

const cssColor = (color: number): string => `#${color.toString(16).padStart(6, "0")}`;

/** The canonical team colour as CSS — what a dot falls back to with no personal tint armed. */
export const teamDotDefaultColor = (team: TeamType): string =>
    cssColor(team === TeamVals.LEFT ? TEAM_COLOR_GREEN : TEAM_COLOR_RED);

/**
 * The colour to draw a side's dot in: the personal tint when one is armed (live ranked fight, seated viewer),
 * else the canonical team colour. The tint is passed in rather than read here so this stays pure — and so the
 * dot cannot disagree with the board, which resolves the same preset.
 */
export const fightLogDotColor = (team: TeamType, personalColor: string | undefined): string =>
    personalColor ?? teamDotDefaultColor(team);

/** Split a log line into text runs and team dots, preserving every other character exactly. */
export const splitFightLogTeamDots = (line: string): FightLogSegment[] => {
    const segments: FightLogSegment[] = [];
    let pending = "";
    for (const character of Array.from(line)) {
        const team =
            character === TEAM_DOT_LEFT ? TeamVals.LEFT : character === TEAM_DOT_RIGHT ? TeamVals.RIGHT : undefined;
        if (team === undefined) {
            pending += character;
            continue;
        }
        if (pending) {
            segments.push({ kind: "text", text: pending });
            pending = "";
        }
        segments.push({ kind: "dot", team });
    }
    if (pending) {
        segments.push({ kind: "text", text: pending });
    }
    return segments;
};
