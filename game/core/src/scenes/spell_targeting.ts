import { GridMath, SpellHelper, type Grid, type HoCMath } from "@heroesofcrypto/common";

type ClientSpellSightGrid = Pick<Grid, "getOccupantUnitId" | "getSettings">;

/**
 * Bodies a throw flies OVER rather than into. The engine treats the caster's own troops as transparent —
 * a mage arcs a fireball over their front line instead of frying it — so every client surface has to be
 * handed the same predicate or the preview will promise a different victim than the cast produces.
 */
export type TransparencyPredicate = (unitId: string) => boolean;

export const alliesAreTransparent =
    (units: ReadonlyMap<string, { getTeam: () => number }>, casterTeam: number): TransparencyPredicate =>
    (unitId: string) =>
        units.get(unitId)?.getTeam() === casterTeam;

/**
 * Client-side target reachability for unit-targeted spells.
 *
 * The shared helper owns which spells travel across the board (Vine Throw, Fire Strike, Ring of Fire)
 * and which are called down directly on their target. Keeping the browser surfaces behind this wrapper
 * prevents AI fallback, local-model actions and manual targeting from drifting apart.
 */
export const isTargetedSpellReachable = (
    spellName: string,
    grid: ClientSpellSightGrid,
    from: HoCMath.XY,
    to: HoCMath.XY,
    isTransparentUnit?: TransparencyPredicate,
    // The target's whole footprint. Feeds the shared visible-edge gate: a throw lands on the center of a
    // visible edge, so a unit covered on every side cannot be aimed at. Omit for a cell-targeted cast.
    targetCells?: readonly HoCMath.XY[],
): boolean => {
    const settings = grid.getSettings();
    return SpellHelper.isTargetedSpellLineOfSightClear(
        spellName,
        grid,
        (cell: HoCMath.XY) => GridMath.isCellWithinGrid(settings, cell),
        from,
        to,
        isTransparentUnit,
        targetCells,
    );
};

/**
 * Where a thrown spell actually lands, so the aim preview can name the real victim.
 *
 * Fire Strike is no longer refused by a body in the way: like an archer's shot it burns whoever stands in
 * the line, and only terrain stops it. `interceptedBy` is that unit when it is not the one aimed at.
 */
export const thrownSpellImpact = (
    spellName: string,
    grid: ClientSpellSightGrid,
    from: HoCMath.XY,
    to: HoCMath.XY,
    isTransparentUnit?: TransparencyPredicate,
): SpellHelper.IThrownSpellImpact => {
    const settings = grid.getSettings();
    return SpellHelper.resolveThrownSpellImpact(
        spellName,
        grid,
        (cell: HoCMath.XY) => GridMath.isCellWithinGrid(settings, cell),
        from,
        to,
        isTransparentUnit,
    );
};

/** Strict gate for the client-side AIs: does the throw REACH the unit being scored, or land on a screen? */
export const thrownSpellReachesTarget = (
    spellName: string,
    grid: ClientSpellSightGrid,
    from: HoCMath.XY,
    to: HoCMath.XY,
    isTransparentUnit?: TransparencyPredicate,
): boolean => {
    const settings = grid.getSettings();
    return SpellHelper.thrownSpellReachesAimedTarget(
        spellName,
        grid,
        (cell: HoCMath.XY) => GridMath.isCellWithinGrid(settings, cell),
        from,
        to,
        isTransparentUnit,
    );
};

/**
 * Who intercepted a thrown spell's line, for the refusal message: undefined when the line is clear
 * (or the spell is not thrown), otherwise the blocking unit's id or "B"/"H" for terrain.
 */
export const targetedSpellBlockerId = (
    spellName: string,
    grid: ClientSpellSightGrid,
    from: HoCMath.XY,
    to: HoCMath.XY,
    isTransparentUnit?: TransparencyPredicate,
): string | undefined => {
    if (!SpellHelper.targetedSpellRequiresLineOfSight(spellName)) {
        return undefined;
    }
    const settings = grid.getSettings();
    return SpellHelper.firstTargetedSpellSightBlocker(
        spellName,
        grid,
        (cell: HoCMath.XY) => GridMath.isCellWithinGrid(settings, cell),
        from,
        to,
        isTransparentUnit,
    )?.occupantId;
};

/** The blocking CELL (not just who stands on it), so the aim preview can draw the lane up to it. */
export const targetedSpellBlockerCell = (
    spellName: string,
    grid: ClientSpellSightGrid,
    from: HoCMath.XY,
    to: HoCMath.XY,
    isTransparentUnit?: TransparencyPredicate,
): HoCMath.XY | undefined => {
    if (!SpellHelper.targetedSpellRequiresLineOfSight(spellName)) {
        return undefined;
    }
    const settings = grid.getSettings();
    return SpellHelper.firstTargetedSpellSightBlocker(
        spellName,
        grid,
        (cell: HoCMath.XY) => GridMath.isCellWithinGrid(settings, cell),
        from,
        to,
        isTransparentUnit,
    )?.cell;
};
