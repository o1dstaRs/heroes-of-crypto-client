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

import { readOwnArmyColorPreset } from "../settings/playerArmyColor";

/**
 * The draft's OWN-army accents, in the colour the player chose in settings.
 *
 * The pick screen was already viewer-relative — your rail has always been the green one and the opponent's
 * the red one, whichever side you are seated on — so a player who has chosen a colour should see it here
 * too, otherwise they draft in green and then fight in purple. The opponent's rail needs nothing: it is
 * already red, which is exactly what the board paints that army once a colour is picked.
 *
 * Four tones, because the screen already used four: a bright accent, a pale one under it, a mid one for
 * text on the dark ground, and a deep one for the ring around a card you have taken. With NO preset chosen
 * each is the authored green LITERAL at the same alpha the call site already passed, so a player who never
 * opens settings sees a pixel-identical draft.
 */
export interface IOwnArmyAccent {
    /** Bright — borders, synergy-dot glow, hover halo. */
    accent: (alpha: number) => string;
    /** Pale — text and fills that must sit quietly under the bright one. */
    soft: (alpha: number) => string;
    /** Mid — labels on the dark draft ground, and the commit flash. */
    label: (alpha: number) => string;
    /** Deep — the ring around a picked or pending card, and its pulse. */
    ring: (alpha: number) => string;
    /** The rail's cloth: edge / centre / edge, like the authored banner. */
    cloth: string;
    /** Text on that cloth. */
    text: string;
}

const rgba = ([r, g, b]: readonly [number, number, number], alpha: number): string => `rgba(${r},${g},${b},${alpha})`;

/** The authored green, kept as its own literals so the untouched default renders exactly as before. */
const AUTHORED_GREEN: IOwnArmyAccent = {
    accent: (alpha) => rgba([120, 220, 150], alpha),
    soft: (alpha) => rgba([180, 230, 195], alpha),
    label: (alpha) => rgba([143, 205, 125], alpha),
    ring: (alpha) => rgba([59, 155, 92], alpha),
    cloth: "linear-gradient(90deg, rgba(3,18,8,.65), rgba(5,31,14,.55) 50%, rgba(3,18,8,.65))",
    text: "#e6f5e9",
};

const mix = (color: number, target: number, amount: number): [number, number, number] => {
    const blend = (shift: number): number => {
        const from = (color >> shift) & 0xff;
        const to = (target >> shift) & 0xff;
        return Math.round(from + (to - from) * amount);
    };

    return [blend(16), blend(8), blend(0)];
};

const hex = ([r, g, b]: readonly [number, number, number]): string =>
    `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;

/**
 * The accents to draw the viewer's own draft rail with.
 *
 * Read fresh on each render rather than memoised: the settings dialog writes straight to localStorage, and
 * one string lookup is far cheaper than a subscription that would have to be kept correct.
 *
 * Each tone is one mix away from the preset, so a new preset needs no entry here and a pale colour (Bone)
 * and a saturated one (Amethyst) both stay readable without a hand-tuned table per colour.
 */
export const ownArmyAccent = (): IOwnArmyAccent => {
    const preset = readOwnArmyColorPreset();
    if (!preset) {
        return AUTHORED_GREEN;
    }

    const accent = mix(preset.color, 0xffffff, 0.3);
    const soft = mix(preset.color, 0xffffff, 0.62);
    const label = mix(preset.color, 0xffffff, 0.45);
    const ring = mix(preset.color, 0x000000, 0.28);
    const edge = mix(preset.color, 0x000000, 0.94);
    const centre = mix(preset.color, 0x000000, 0.88);

    return {
        accent: (alpha) => rgba(accent, alpha),
        soft: (alpha) => rgba(soft, alpha),
        label: (alpha) => rgba(label, alpha),
        ring: (alpha) => rgba(ring, alpha),
        cloth: `linear-gradient(90deg, ${rgba(edge, 0.65)}, ${rgba(centre, 0.55)} 50%, ${rgba(edge, 0.65)})`,
        text: hex(mix(preset.color, 0xffffff, 0.86)),
    };
};
