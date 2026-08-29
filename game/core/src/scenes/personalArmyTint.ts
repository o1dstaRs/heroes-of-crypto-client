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

import { FillGradient } from "pixi.js";

import { TeamType } from "@heroesofcrypto/common";

import {
    ARMY_COLOR_PRESETS,
    IArmyColorPreset,
    readPlayerArmyColorId,
    resolvePlayerArmyColor,
} from "../settings/playerArmyColor";

/**
 * Scene-side access to the player's PERSONAL army colours.
 *
 * Deliberately NOT in teamColors.ts. That module answers "what colour is this team", is team-fixed, and a
 * test asserts it exposes no way to tell it who is looking — the viewer-relative palette was introduced and
 * reverted twice, and keeping the two questions in separate modules is what stops them merging again. This
 * module answers a different question: "has the person at this keyboard chosen how the two armies are
 * PAINTED". Team identity is untouched, so the fight log, the results card and match history keep naming
 * the sides green and red exactly as they did before.
 *
 * The choice moves both armies at once — own units in the chosen colour, the enemy in red — so it is armed
 * and read as one thing. Armed only by a LIVE ranked fight the client is playing; replays and the sandbox
 * clear it, so a recorded match is always watched in its true team colours.
 */
interface IPersonalArmyTintState {
    viewerTeam: TeamType | undefined;
    presetId: string;
    live: boolean;
}

let state: IPersonalArmyTintState | undefined;

/** Same guard the authored banners use: a headless/test renderer has no gradient support. */
const CAN_RENDER_PERSONAL_FLAG_GRADIENT = typeof FillGradient === "function";

export const setPersonalArmyTint = (viewerTeam: TeamType | undefined, live: boolean): void => {
    state = { viewerTeam, presetId: readPlayerArmyColorId(), live };
};

export const clearPersonalArmyTint = (): void => {
    state = undefined;
};

/** Re-read the stored preference so a change in the settings menu shows without reloading the page. */
export const refreshPersonalArmyTint = (): void => {
    if (state) {
        state = { ...state, presetId: readPlayerArmyColorId() };
    }
};

/**
 * The paint as a CSS colour, for the React chrome (sidebars, top bar), or undefined when this team keeps its
 * team colour. The board draws through Pixi numbers and the panels through CSS strings, so both spellings
 * read the SAME resolved preset — a player's colour cannot end up applied to their units but not their pips,
 * and neither can the enemy's red.
 */
export const personalArmyCssColor = (team: TeamType): string | undefined => {
    const preset = personalArmyPresetFor(team);
    return preset === undefined ? undefined : `#${preset.color.toString(16).padStart(6, "0")}`;
};

/** The preset to draw `team` with — the viewer's own choice, or the opponent's red — or undefined for the
 * canonical team colour. */
export const personalArmyPresetFor = (team: TeamType): IArmyColorPreset | undefined =>
    state === undefined
        ? undefined
        : resolvePlayerArmyColor({
              team,
              viewerTeam: state.viewerTeam,
              presetId: state.presetId,
              live: state.live,
          });

/**
 * A Pixi gradient for a personally-tinted banner, cached per preset.
 *
 * Built lazily and kept, because a FillGradient is a GPU resource and the flag is redrawn every frame the
 * stack's count changes. Returns undefined when the team is not tinted, so the caller falls through to the
 * authored green/red banners.
 */
const gradientCache = new Map<string, FillGradient>();

export const personalArmyFlagGradient = (color: number): FillGradient | undefined => {
    if (!CAN_RENDER_PERSONAL_FLAG_GRADIENT) {
        return undefined;
    }
    // Keyed by the resolved COLOUR rather than the team: by the time the banner is drawn the caller has
    // already decided whose colour this is, and drawBadgeFlag is handed the colour alone. Only the PICKABLE
    // presets are searched, so a repainted opponent misses here and falls through to the authored red
    // banner — which is the point, that army should look exactly like the red side always has.
    const preset = ARMY_COLOR_PRESETS.find((candidate) => candidate.color === color);
    if (!preset) {
        return undefined;
    }
    const cached = gradientCache.get(preset.id);
    if (cached) {
        return cached;
    }
    const gradient = new FillGradient({
        end: { x: 1, y: 0 },
        textureSpace: "local",
        colorStops: [
            { offset: 0, color: preset.gradient[0] },
            { offset: 0.5, color: preset.gradient[1] },
            { offset: 1, color: preset.gradient[2] },
        ],
    });
    gradientCache.set(preset.id, gradient);

    return gradient;
};
