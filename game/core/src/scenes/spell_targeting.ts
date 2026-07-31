import { GridMath, SpellHelper, type Grid, type HoCMath } from "@heroesofcrypto/common";

type ClientSpellSightGrid = Pick<Grid, "getOccupantUnitId" | "getSettings">;

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
): boolean => {
    const settings = grid.getSettings();
    return SpellHelper.isTargetedSpellLineOfSightClear(
        spellName,
        grid,
        (cell: HoCMath.XY) => GridMath.isCellWithinGrid(settings, cell),
        from,
        to,
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
): string | undefined => {
    if (!SpellHelper.targetedSpellRequiresLineOfSight(spellName)) {
        return undefined;
    }
    const settings = grid.getSettings();
    return SpellHelper.firstSpellSightBlocker(
        grid,
        (cell: HoCMath.XY) => GridMath.isCellWithinGrid(settings, cell),
        from,
        to,
    )?.occupantId;
};
