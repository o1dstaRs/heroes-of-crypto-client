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
 * Board colours are TEAM-FIXED, never viewer-relative: team LOWER is ALWAYS green and is always drawn at the
 * BOTTOM of the board; team UPPER is ALWAYS red and always at the TOP — on every screen, for both players and
 * every observer. The engine calls the sides LOWER and UPPER and a match can be seated from either side; the
 * player who spawns in the UPPER seat plays the RED army at the top and is NOT recoloured green (owner
 * 2026-08-08). This deliberately reverted the old "whoever is playing is green" perspective flip, which drew
 * the same match in opposite colours on the two screens.
 *
 * Colour is one question; OWNERSHIP is a different one. Whose turn it is, which units the viewer may drive,
 * and which placement zone is the viewer's own are answered by the scene's viewerTeam
 * (RankedPlayScene.getViewerTeam) — NEVER by these colour helpers. Do not reintroduce a viewer argument here.
 */
export const TEAM_COLOR_GREEN = 0x00d200;
export const TEAM_COLOR_RED = 0xff0000;

/** The colour a team is ALWAYS drawn in: LOWER green, UPPER red, from every seat. */
export const teamColor = (team: TeamType): number => (team === TeamVals.LOWER ? TEAM_COLOR_GREEN : TEAM_COLOR_RED);

/** True for the GREEN side (team LOWER). A purely visual/colour question — NOT "is this unit mine". */
export const isGreenTeam = (team: TeamType): boolean => team === TeamVals.LOWER;
