/*
 * -----------------------------------------------------------------------------
 * This file is part of the Heroes of Crypto game client.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 * -----------------------------------------------------------------------------
 */

import { type TeamType, TeamVals } from "@heroesofcrypto/common";

/** Ranked participants always read their own army as green and their opponent as red. Spectators and sandbox
 * scenes keep the canonical LOWER-green / UPPER-red palette because they have no player seat. Ownership,
 * actions and coordinates still use the authoritative team; this module changes presentation only. */
export const TEAM_COLOR_GREEN = 0x00d200;
export const TEAM_COLOR_RED = 0xff0000;

let viewerTeam: TeamType | undefined;

export const setViewerTeamForColors = (team: TeamType | undefined): void => {
    viewerTeam = team === undefined || team === TeamVals.NO_TEAM ? undefined : team;
};

export const getViewerTeamForColors = (): TeamType | undefined => viewerTeam;

export const isFriendlyTeam = (team: TeamType): boolean =>
    viewerTeam === undefined ? team === TeamVals.LOWER : team === viewerTeam;

export const teamColor = (team: TeamType): number => (isFriendlyTeam(team) ? TEAM_COLOR_GREEN : TEAM_COLOR_RED);

/** Kept for callers that phrase the presentation question in terms of the visible green side. */
export const isGreenTeam = isFriendlyTeam;
