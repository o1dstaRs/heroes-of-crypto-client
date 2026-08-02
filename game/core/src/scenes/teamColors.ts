/*
 * -----------------------------------------------------------------------------
 * This file is part of the Heroes of Crypto game client.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 * -----------------------------------------------------------------------------
 */

import { TeamType, TeamVals } from "@heroesofcrypto/common";

/**
 * Board colours are VIEWER-relative: whoever is playing is green, their opponent is red — on both screens.
 *
 * The engine keeps calling the sides LOWER and UPPER, and a match is drawn from either seat, so a fixed
 * "lower is green" mapping meant half the players learned the board upside down. Everything that paints a
 * team (unit frames, stack pips, roster cards, placement zones) resolves its colour through here instead.
 *
 * The renderer is not React, so the viewer is kept as module state and set once per scene mount. An
 * observer (or the sandbox, which has no seat) leaves it unset and gets the classic lower=green board.
 */
export const TEAM_COLOR_FRIENDLY = 0x00d200;
export const TEAM_COLOR_HOSTILE = 0xff0000;

let viewerTeam: TeamType | undefined;

export const setViewerTeamForColors = (team: TeamType | undefined): void => {
    viewerTeam = team === TeamVals.NO_TEAM ? undefined : team;
};

export const getViewerTeamForColors = (): TeamType | undefined => viewerTeam;

/**
 * The colour a team is drawn in from the current viewer's seat. Falls back to the historical
 * lower=green / upper=red when there is no seat to be relative to.
 */
export const teamColor = (team: TeamType): number => {
    if (viewerTeam === undefined) {
        return team === TeamVals.LOWER ? TEAM_COLOR_FRIENDLY : TEAM_COLOR_HOSTILE;
    }
    return team === viewerTeam ? TEAM_COLOR_FRIENDLY : TEAM_COLOR_HOSTILE;
};

/** True when this team should read as "mine" in the UI (green side). */
export const isFriendlyTeam = (team: TeamType): boolean =>
    viewerTeam === undefined ? team === TeamVals.LOWER : team === viewerTeam;
