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
 * Board colours are TEAM-FIXED, never viewer-relative: team LEFT is ALWAYS green and is always drawn on the
 * LEFT of the board; team RIGHT is ALWAYS red and always on the RIGHT — on every screen, for both players and
 * every observer. The engine calls the sides LEFT and RIGHT and a match can be seated from either side; the
 * player who spawns in the RIGHT seat plays the RED army on the right and is NOT recoloured green (owner
 * 2026-08-08). This deliberately reverted the old "whoever is playing is green" perspective flip, which drew
 * the same match in opposite colours on the two screens.
 *
 * Reverted a SECOND time on 2026-08-28 (b0aed99c had reintroduced the viewer-relative flip and deleted this
 * paragraph). That attempt also showed why the rule earns its keep: only the Pixi board was flipped, so a
 * RIGHT-seat player saw their army green on the battlefield and red in the Up Next queue, the stats pips and
 * the fight log, and the results screen labelled a red-painted card "GREEN LOSSES". A viewer-relative palette
 * has to be threaded through every surface that names a colour; team-fixed needs no threading at all.
 *
 * Colour is one question; OWNERSHIP is a different one. Whose turn it is, which units the viewer may drive,
 * and which placement zone is the viewer's own are answered by the scene's viewerTeam
 * (RankedPlayScene.getViewerTeam) — NEVER by these colour helpers. Do not reintroduce a viewer argument here.
 */
export const TEAM_COLOR_GREEN = 0x00d200;
export const TEAM_COLOR_RED = 0xff0000;

/** The colour a team is ALWAYS drawn in: LEFT green, RIGHT red, from every seat. */
export const teamColor = (team: TeamType): number => (team === TeamVals.LEFT ? TEAM_COLOR_GREEN : TEAM_COLOR_RED);

/** True for the GREEN side (team LEFT). A purely visual/colour question — NOT "is this unit mine". */
export const isGreenTeam = (team: TeamType): boolean => team === TeamVals.LEFT;
