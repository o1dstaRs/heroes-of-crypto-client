import { GridMath, SpellHelper, type Grid, type HoCMath, type Unit } from "@heroesofcrypto/common";

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
 * The transparency a given throw gets: the intercepted throws (Fire Strike, Fireball) arc over the caster's
 * own troops; Vine Throw and Ring of Fire are stopped by ANY body, friend or foe. One rule for the aim
 * preview, the local AI and the model opponent, read off the same classification the engine uses — a surface
 * that spelled the list out by hand refused Fireball behind a friendly front line the server would have
 * thrown over (owner report 2026-09-20).
 */
export const throwTransparencyFor = (
    spellName: string,
    units: ReadonlyMap<string, { getTeam: () => number }>,
    casterTeam: number,
): TransparencyPredicate | undefined =>
    SpellHelper.isInterceptedThrownSpell(spellName) ? alliesAreTransparent(units, casterTeam) : undefined;

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

/**
 * The enemies a position swap (Castling) may exchange bodies with, as their ANCHOR cells — the list the
 * engine's canCastSpell is re-validated against, so it has to answer exactly what the engine would
 * (common's `getEnemiesCellsWithinMovementRange` is the same rule on the other side of the wire).
 *
 * Two conditions, both about the anchor. The enemy's footprint must match the caster's, because the swap
 * exchanges anchors and only identical shapes land each body on the cells the other vacated; and the
 * enemy's own anchor must be a cell this body could stand on, not merely one it could touch. Neither
 * distinction is visible at 1x1 — a single-cell unit's only cell IS its anchor — but both decide the
 * multi-cell case a stolen Castling opens up: a 2x2 Arachna Queen swaps with a 2x2, a 2x1 mount with a
 * 2x1, and a 2x1 that can reach a 2x1 enemy's far cell but not its anchor cannot swap with it at all.
 */
export const swapTargetCellsWithinMovementRange = (
    caster: Unit,
    moveCells: HoCMath.XY[],
    occupantAt: (cell: HoCMath.XY) => Unit | undefined,
): HoCMath.XY[] => {
    const cells: HoCMath.XY[] = [];
    const seen = new Set<string>();
    for (const cell of moveCells) {
        const enemy = occupantAt(cell);
        if (!enemy || enemy.isDead() || enemy.getTeam() === caster.getTeam()) {
            continue;
        }
        const anchor = enemy.getBaseCell();
        if (anchor.x !== cell.x || anchor.y !== cell.y) {
            continue;
        }
        if (!SpellHelper.hasSwappableFootprint(caster, enemy)) {
            continue;
        }
        const key = `${anchor.x},${anchor.y}`;
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        cells.push(anchor);
    }
    return cells;
};
