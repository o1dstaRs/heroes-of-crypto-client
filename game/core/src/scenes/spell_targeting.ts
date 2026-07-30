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
