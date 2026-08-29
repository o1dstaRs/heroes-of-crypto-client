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
 * A player's PERSONAL army colour: a local, cosmetic override for their OWN army's flag and light.
 *
 * This is not the viewer-relative palette that was tried and reverted twice. Team identity is untouched:
 * LOWER is still the green side and UPPER still the red one, on every screen, in every log line and on the
 * results card. The only thing that changes is the tint of the CLICKING PLAYER's own units, on their own
 * machine. The opponent's army keeps its team colour, so the two sides are never confusable, and the
 * opponent's screen is not affected at all — nothing here is sent anywhere.
 *
 * It is also deliberately OFF for replays and observers (see `resolvePlayerArmyColor`): a replay must show
 * the match as it was, green against red, not through whatever tint the person watching happens to prefer.
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
 * Ten presets. Deliberately no RED and no GREEN in the list: those two are the TEAM colours, and letting a
 * player paint their army the opponent's colour is the one choice that could make the board unreadable.
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
];

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
 * The personal tint for a unit, or undefined to use the canonical team colour.
 *
 * Three conditions, each doing real work: the fight must be live, never a replay; neutral bodies are never
 * anyone's "own" army; and the unit must belong to the viewer's own team, which is also what excludes an
 * observer, whose viewerTeam matches no team on the board. Everything else keeps its team colour.
 */
export const resolvePlayerArmyColor = (context: IPlayerArmyColorContext): IArmyColorPreset | undefined => {
    if (!context.live || context.viewerTeam === TeamVals.NO_TEAM) {
        return undefined;
    }
    if (context.team !== context.viewerTeam) {
        return undefined;
    }

    return armyColorPresetById(context.presetId);
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

export const writePlayerArmyColorId = (presetId: string): void => {
    try {
        globalThis.localStorage?.setItem(STORAGE_KEY, presetId);
    } catch {
        // storage unavailable — the choice simply does not persist past this session
    }
};
