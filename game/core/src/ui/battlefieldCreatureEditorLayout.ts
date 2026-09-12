export interface FootprintComparisonLayout {
    horizontalGapCells: number;
    rowSizes: number[];
}

/**
 * Split one footprint class into balanced rows that leave a real empty-cell gutter between neighbours.
 * The framing editor uses the whole board as a comparison surface, so balanced rows keep the last row from
 * looking like an unrelated cluster at the centre while still guaranteeing that occupied cells never touch.
 */
export const footprintComparisonLayout = (
    creatureCount: number,
    footprintWidth: number,
    boardWidth: number,
    horizontalGapCells = 1,
): FootprintComparisonLayout => {
    const count = Math.max(0, Math.round(creatureCount));
    const width = Math.max(1, Math.round(footprintWidth));
    const board = Math.max(1, Math.round(boardWidth));
    const gap = Math.max(0, Math.round(horizontalGapCells));
    if (!count) return { horizontalGapCells: gap, rowSizes: [] };

    const rowCapacity = Math.max(1, Math.floor((board + gap) / (width + gap)));
    const rowCount = Math.ceil(count / rowCapacity);
    const smallestRowSize = Math.floor(count / rowCount);
    const largerRowCount = count % rowCount;
    const rowSizes = Array.from(
        { length: rowCount },
        (_, rowIndex) => smallestRowSize + (rowIndex < largerRowCount ? 1 : 0),
    );

    return { horizontalGapCells: gap, rowSizes };
};
