import { GridMath, SpellHelper, type GridSettings, type HoCMath, type Spell, type Unit } from "@heroesofcrypto/common";

/** Automatic casts face the enemy's edge; explicit AI/player target cells remain authoritative. */
export function defaultSummonCell(
    spell: Spell,
    matrix: number[][],
    grid: GridSettings,
    caster: Pick<Unit, "getCells" | "getTeam">,
    sideOriented: boolean,
): HoCMath.XY | undefined {
    const cells = caster.getCells();
    const footprint = SpellHelper.summonFootprintOf(spell);
    const legal = SpellHelper.summonableAnchors(
        spell,
        matrix,
        GridMath.getCellsAroundFootprint(grid, cells),
        footprint.width,
        footprint.height,
    );
    const lateral = (cell: HoCMath.XY): number => (sideOriented ? cell.y : cell.x);
    const lane = cells.reduce((sum, cell) => sum + lateral(cell), 0) / cells.length;
    let front: HoCMath.XY | undefined;
    let distance = Infinity;
    for (const anchor of legal) {
        const body = GridMath.getFootprintCellsForAnchor(anchor, footprint.width, footprint.height);
        if (
            !body.every((cell) =>
                cells.every((from) => GridMath.advanceDeltaBetween(caster.getTeam(), from, cell, sideOriented) > 0),
            )
        )
            continue;
        const delta = Math.abs(body.reduce((sum, cell) => sum + lateral(cell), 0) / body.length - lane);
        if (delta < distance) {
            front = anchor;
            distance = delta;
        }
    }
    return front ?? legal[0];
}
