const COMBAT_RANGE_SEPARATOR = "\u2009-\u2009";

/** A compact but visible gap keeps the range dash from touching either number. */
export const formatCombatRange = (minimum: number, maximum: number): string =>
    minimum === maximum ? `${minimum}` : `${minimum}${COMBAT_RANGE_SEPARATOR}${maximum}`;
