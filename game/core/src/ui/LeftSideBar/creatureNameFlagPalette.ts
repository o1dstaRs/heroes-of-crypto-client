import { TeamVals, type TeamType } from "@heroesofcrypto/common";

import { teamFlagPalette } from "../../scenes/teamColors";

type Rgb = readonly [number, number, number];
export interface CreatureFlagPalette {
    shadow: Rgb;
    light: Rgb;
    attachment: string;
    gradient: string;
}
const rgb = (color: number): Rgb => [(color >> 16) / 255, ((color >> 8) & 255) / 255, (color & 255) / 255];
const hex = (color: number) => `#${color.toString(16).padStart(6, "0")}`;
const darken = (color: number, factor: number): number =>
    (Math.round(((color >> 16) & 255) * factor) << 16) |
    (Math.round(((color >> 8) & 255) * factor) << 8) |
    Math.round((color & 255) * factor);

/** Every team uses the same swallowtail silhouette; team identity comes from the cloth palette. */
export function creatureNameFlagArtwork() {
    return { cloth: "ui_creature_name_flag_classic_v9", hem: "ui_creature_name_flag_classic_hem_v9" } as const;
}

/** Battlefield team hues, slightly darker for the name cloth; no observer seat inversion. */
export function creatureNameFlagPalette(team: TeamType): CreatureFlagPalette {
    const base =
        team === TeamVals.LEFT || team === TeamVals.RIGHT
            ? teamFlagPalette(team)
            : { edge: 0x6a6260, center: 0x302b29 };
    const brightness = team === TeamVals.RIGHT ? 0.8 : team === TeamVals.LEFT ? 0.9 : 1;
    const palette = { edge: darken(base.edge, brightness), center: darken(base.center, brightness) };
    return {
        shadow: rgb(palette.center),
        light: rgb(palette.edge),
        gradient: `linear-gradient(90deg,${hex(palette.edge)} 0%,${hex(palette.center)} 50%,${hex(palette.edge)} 100%)`,
        attachment: `linear-gradient(90deg,${hex(palette.center)},${hex(palette.edge)} 48%,${hex(palette.center)})`,
    };
}

/** Supersample the small cloth surface, including ordinary-DPI displays, with a bounded retina budget. */
export function creatureFlagPixelRatio(deviceRatio: number): number {
    return Math.min(3, Math.max(2, Number.isFinite(deviceRatio) ? deviceRatio : 1));
}
