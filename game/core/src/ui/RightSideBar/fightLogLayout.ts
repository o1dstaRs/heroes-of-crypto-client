// One continuous material for the complete framed log, including the transparent parts of its 9-slice
// rails. Kept separate from the log renderer so the placement sidebar can reserve its final surface
// without loading the fight-only chronicle implementation.
export const FIGHT_LOG_SURFACE_BACKGROUND =
    "linear-gradient(90deg, rgba(0,0,0,.78) 0, transparent 22px, transparent calc(100% - 22px), rgba(0,0,0,.78) 100%), linear-gradient(180deg, rgba(0,0,0,.78) 0, transparent 22px, transparent calc(100% - 22px), rgba(0,0,0,.78) 100%), repeating-linear-gradient(135deg, rgba(255,255,255,.012) 0 1px, transparent 1px 7px), linear-gradient(180deg, rgba(18,17,15,.96), rgba(6,6,5,.98))";

export const FIGHT_LOG_SCROLLBAR_LANE_WIDTH_PX = 25.72;
export const FIGHT_LOG_SCROLLBAR_THUMB_WIDTH_PX = 8.65;
