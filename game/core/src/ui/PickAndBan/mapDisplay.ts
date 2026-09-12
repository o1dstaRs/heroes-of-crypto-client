import { GridVals } from "@heroesofcrypto/common";

export interface IMapDisplay {
    name: string;
    imageKey: string;
    accent: string;
    blurb: string;
}

// Ranked map types (GridVals) -> presentation. Only NORMAL/LAVA_CENTER/BLOCK_CENTER are rolled for ranked
// (WATER_CENTER is disabled, see common ToGridType) but Water is mapped for completeness/robustness.
// Pure (no React/asset imports) so it can be unit-tested; MapReveal.tsx renders from it.
export const getMapDisplay = (mapType: number): IMapDisplay | undefined => {
    switch (mapType) {
        case GridVals.NORMAL:
            return {
                name: "Normal",
                imageKey: "map_badge_normal_4x4_actual_style_v4",
                accent: "#c6a66b",
                blurb: "Open stone field — no central hazard.",
            };
        case GridVals.LAVA_CENTER:
            return {
                name: "FIRE PIT",
                imageKey: "map_badge_lava_frameless_v2",
                accent: "#ff7a3c",
                blurb: "A lava pool scars the center of the board.",
            };
        case GridVals.BLOCK_CENTER:
            return {
                name: "Barrels",
                imageKey: "map_badge_barrels_frameless_v2",
                accent: "#d8b073",
                blurb: "Destructible barrels obstruct routes across the board.",
            };
        case GridVals.WATER_CENTER:
            return {
                name: "Water",
                imageKey: "water_256",
                accent: "#5aa9e6",
                blurb: "A pool of water splits the center of the board.",
            };
        default:
            return undefined;
    }
};
