/** Padding leaves room for raised wings, striking forelegs and the fallen body at the idle pixel scale. */
export const PEGASUS_COMBAT_CANVAS_SIZE = 1280;
export const PEGASUS_COMBAT_SOURCE_X = 256;
export const PEGASUS_COMBAT_SOURCE_Y = 368;
export const isPegasusCombatState = (unitName: string, stateName?: string): boolean =>
    unitName === "Pegasus" && /^(hit|death|(?:melee_)?attack(?:_up|_down)?)$/.test(stateName ?? "");
export const pegasusCombatCanvasScale = (unitName: string, stateName?: string): number =>
    isPegasusCombatState(unitName, stateName) ? PEGASUS_COMBAT_CANVAS_SIZE / 768 : 1;
