export const DRAFT_BAN_ICON_HEIGHT = Number((51.6 * 1.15).toFixed(2));
export const DRAFT_BAN_ICON_WIDTH = DRAFT_BAN_ICON_HEIGHT * 0.8;
export const DRAFT_BAN_ICON_GAP = 2;
// Leave room for a thin scrollbar without squeezing the two portrait columns.
export type DraftBanColumns = 2 | 3 | 4;
export const draftBanRailWidth = (columns: DraftBanColumns) =>
    DRAFT_BAN_ICON_WIDTH * columns + DRAFT_BAN_ICON_GAP * (columns + 1) + 10;
export const DRAFT_BAN_FRAME_WIDTH = draftBanRailWidth(2);
export const DRAFT_BAN_SIDE_OFFSET = 18;
export const DRAFT_BAN_TOP = 96;

/** The scaled draft must leave real screen space for the sidebar; aspect ratio alone cannot tell. */
export function draftBanLayout(
    viewport: { width: number; height: number; touch: boolean },
    scale: number,
    board: { width: number; height: number },
): { docked: boolean; maxHeight: number; columns: DraftBanColumns; width: number } {
    const gutter = (viewport.width - board.width * scale) / 2;
    const top = (viewport.height - board.height * scale) / 2 - viewport.height * 0.03 + DRAFT_BAN_TOP * scale;
    const available = (gutter - 8) / scale - DRAFT_BAN_SIDE_OFFSET;
    const columns: DraftBanColumns = available >= draftBanRailWidth(4) ? 4 : available >= draftBanRailWidth(3) ? 3 : 2;
    return {
        columns,
        width: draftBanRailWidth(columns),
        docked: !viewport.touch && gutter >= (DRAFT_BAN_FRAME_WIDTH + DRAFT_BAN_SIDE_OFFSET) * scale + 8,
        maxHeight: Math.max(0, (viewport.height - 48 - top) / scale),
    };
}
