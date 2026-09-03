/**
 * The height the sidebar reserves for the complete six-button combat column.
 *
 * This lives outside the toolbar implementation so placement can reserve the final fight layout without
 * eagerly loading the toolbar's icons, styling, and interaction code.
 */
export const toolbarColumnHeightPx = (): number => {
    const screenRatio = Math.min(window.innerWidth / 1366, window.innerHeight / 768);
    const slots = 6;
    const gap = 8;
    const cellSize = 57;
    return Math.round(cellSize * screenRatio * slots + gap * (slots - 1));
};
