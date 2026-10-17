// Walk bodies match idle's visible mass, with extra canvas room for upright poses.
// Compensate the 1024px padded canvas so the artwork keeps idle's pixel scale.
export const BEHEMOTH_LAB_WALK_SCALE_X = 1024 / 768;
export const BEHEMOTH_LAB_WALK_SCALE_Y = BEHEMOTH_LAB_WALK_SCALE_X;

// Five eight-frame gaits combine with three mouth cycles at 60% speed.
export const BEHEMOTH_LAB_WALK_BODY_FRAME_COUNT = 8;
export const BEHEMOTH_LAB_WALK_MOUTH_SPEED = 0.6;
