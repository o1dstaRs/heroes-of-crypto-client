import {
    GARGANTUAN_IMPACT_AREA_CELLS,
    GARGANTUAN_IMPACT_DURATIONS,
    gargantuanImpactFrame,
} from "./GargantuanStoneImpact";

/** Cyclops uses the same painted 3×3 fracture and playback timing as Gargantuan. */
export const CYCLOPS_IMPACT_DURATION_MS = GARGANTUAN_IMPACT_DURATIONS.reduce((sum, ms) => sum + ms, 0);
export const CYCLOPS_IMPACT_AREA_CELLS = GARGANTUAN_IMPACT_AREA_CELLS;
export const cyclopsImpactFrame = gargantuanImpactFrame;
