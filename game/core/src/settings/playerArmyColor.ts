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

import { TEAM_COLOR_GREEN, TEAM_COLOR_RED } from "../scenes/teamColors";

/**
 * A player's PERSONAL army colour: a local, cosmetic override for the two armies' flags and lights.
 *
 * This is not the viewer-relative palette that was tried and reverted twice. Team IDENTITY is untouched:
 * LOWER is still the green side and UPPER still the red one, in every log line, on the results card and in
 * match history. Only the paint on the board (and the stack flags/pips that mirror it) changes, only on the
 * CLICKING PLAYER's own machine — nothing here is sent anywhere, and the opponent's screen is unaffected.
 *
 * Choosing a colour repaints BOTH sides, and it has to: the player picks the colour of their own army, and
 * the opponent is then always drawn RED (owner 2026-08-29). Painting only one side would let a player who
 * picks green sit opposite the green team, which is the one arrangement that makes a board unreadable —
 * and it is also why green is a legal choice here at all. Red is reserved: it is what the opponent wears.
 *
 * It is deliberately OFF for replays and observers (see `resolvePlayerArmyColor`): a replay must show the
 * match as it was, green against red, not through whatever tint the person watching happens to prefer.
 */
export interface IArmyColorPreset {
    id: string;
    label: string;
    /** Flat tint for the unit light and any solid fill. */
    color: number;
    /** Edge / centre / edge stops for the flag cloth, matching the authored green and red banners. */
    gradient: [number, number, number];
}

/** The team's own colour — the default, and what every replay and observer always sees. */
export const TEAM_DEFAULT_ARMY_COLOR_ID = "team";

/**
 * Eleven presets. GREEN is one of them — the opponent turns red the moment any preset is chosen, so a green
 * army can only ever face a red one. RED is deliberately absent: it is the colour the opponent is drawn in,
 * and wearing it would be the one choice that could make a board unreadable.
 */
export const ARMY_COLOR_PRESETS: readonly IArmyColorPreset[] = [
    { id: "amethyst", label: "Amethyst", color: 0x9b30ff, gradient: [0x5b2a86, 0x36194f, 0x5b2a86] },
    { id: "azure", label: "Azure", color: 0x1e90ff, gradient: [0x14568f, 0x0b3057, 0x14568f] },
    { id: "cyan", label: "Cyan", color: 0x00c8c8, gradient: [0x0b6b6b, 0x063d3d, 0x0b6b6b] },
    { id: "gold", label: "Gold", color: 0xffc832, gradient: [0x8a6b12, 0x513e08, 0x8a6b12] },
    { id: "amber", label: "Amber", color: 0xff8c1a, gradient: [0x8a4a0d, 0x512a06, 0x8a4a0d] },
    { id: "magenta", label: "Magenta", color: 0xff3ea5, gradient: [0x8a2159, 0x511234, 0x8a2159] },
    { id: "violet", label: "Violet", color: 0x7b5cff, gradient: [0x43318a, 0x271c51, 0x43318a] },
    { id: "teal", label: "Teal", color: 0x2ec4a6, gradient: [0x176b5b, 0x0d3e34, 0x176b5b] },
    { id: "slate", label: "Slate", color: 0x8fa3bf, gradient: [0x4c5a6e, 0x2c3541, 0x4c5a6e] },
    { id: "bone", label: "Bone", color: 0xe8e0c8, gradient: [0x7d7663, 0x49453a, 0x7d7663] },
    // The team's own green, cloth stops included: an UPPER player who wants to fight in green gets exactly
    // the banner the LOWER side has always flown, not an approximation of it.
    { id: "green", label: "Green", color: TEAM_COLOR_GREEN, gradient: [0x176238, 0x0b3d20, 0x176238] },
];

/**
 * What the OPPONENT is drawn in once this player has chosen a colour — never selectable, never stored.
 *
 * The team's own red for the flat fill, so the enemy army's flags and lights are painted in exactly the
 * shade the UPPER side has always worn; the banner cloth itself falls through to the authored red gradient,
 * which this colour still selects. The stops here therefore serve only the placement wash, where a preset's
 * middle stop fills the DEEP slot — mirrored off the green zone's 0x102b1b, which is the only wash the
 * opponent can land in (the deep slot is always the LOWER zone).
 */
export const OPPONENT_ARMY_COLOR: IArmyColorPreset = {
    id: "opponent",
    label: "Opponent",
    color: TEAM_COLOR_RED,
    gradient: [0x7b1928, 0x2b1010, 0x7b1928],
};

export const armyColorPresetById = (presetId: string | undefined): IArmyColorPreset | undefined =>
    presetId === undefined || presetId === TEAM_DEFAULT_ARMY_COLOR_ID
        ? undefined
        : ARMY_COLOR_PRESETS.find((preset) => preset.id === presetId);

export interface IPlayerArmyColorContext {
    /** The team being drawn. */
    team: TeamType;
    /** The team this client is PLAYING. Undefined for observers, replays and the sandbox. */
    viewerTeam: TeamType | undefined;
    /** The preset this player picked, or undefined / "team" for the default. */
    presetId: string | undefined;
    /** False while replaying: a replay always shows the match in its true team colours. */
    live: boolean;
}

/**
 * The colour a team is drawn in for this viewer, or undefined to use the canonical team colour.
 *
 * The gates come first and each does real work: the fight must be live, never a replay; the viewer must be
 * seated (an observer's viewerTeam is undefined or NO_TEAM, and they see the true colours); neutral bodies
 * belong to neither army; and an unset preference leaves the whole board exactly as it was.
 *
 * Past those, the choice repaints BOTH sides — the viewer's own army in their colour, the other one red.
 * The pair moves together on purpose: half of it would let a green pick face the green team.
 */
export const resolvePlayerArmyColor = (context: IPlayerArmyColorContext): IArmyColorPreset | undefined => {
    if (!context.live || context.viewerTeam === undefined || context.viewerTeam === TeamVals.NO_TEAM) {
        return undefined;
    }
    if (context.team === TeamVals.NO_TEAM) {
        return undefined;
    }
    const own = armyColorPresetById(context.presetId);
    if (own === undefined) {
        return undefined;
    }

    return context.team === context.viewerTeam ? own : OPPONENT_ARMY_COLOR;
};

const STORAGE_KEY = "hoc.ranked.armyColor";

/**
 * The stored preference. Every access is guarded: storage throws outright in a privacy-mode browser, and a
 * cosmetic preference must never be the reason a fight fails to render.
 */
export const readPlayerArmyColorId = (): string => {
    try {
        const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
        if (stored && (stored === TEAM_DEFAULT_ARMY_COLOR_ID || armyColorPresetById(stored))) {
            return stored;
        }
    } catch {
        // storage unavailable — fall through to the team default
    }

    return TEAM_DEFAULT_ARMY_COLOR_ID;
};

/**
 * The chosen preset, straight from storage — for the surfaces that show a player their OWN colour before a
 * fight exists to arm the scene tint (the draft rails, the pre-fight chrome). There is no team to resolve
 * there: whoever is looking at the draft IS the player.
 */
export const readOwnArmyColorPreset = (): IArmyColorPreset | undefined => armyColorPresetById(readPlayerArmyColorId());

export const writePlayerArmyColorId = (presetId: string): void => {
    try {
        globalThis.localStorage?.setItem(STORAGE_KEY, presetId);
    } catch {
        // storage unavailable — the choice simply does not persist past this session
    }
};
