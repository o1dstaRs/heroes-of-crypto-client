/**
 * Dragging the spectator's floating FIGHT panel, which otherwise sits docked bottom-centre over the board.
 *
 * A drag moves the panel by the pointer's travel since the drag began, but never far enough to lose it: the
 * top edge (where the drag handle is) stays inside the window, and at least OBSERVER_PANEL_MIN_VISIBLE_PX of
 * the panel stays on screen at either side and at the bottom, so there is always something left to grab.
 */

export interface PanelOffset {
    x: number;
    y: number;
}

export interface PanelRect {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

export const OBSERVER_PANEL_MIN_VISIBLE_PX = 48;

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

/** The panel's new offset, given its offset and on-screen rect when the drag began and the pointer's travel. */
export const dragObserverPanelOffset = (
    startOffset: PanelOffset,
    startRect: PanelRect,
    pointerDelta: PanelOffset,
    viewport: { width: number; height: number },
    minVisiblePx = OBSERVER_PANEL_MIN_VISIBLE_PX,
): PanelOffset => {
    const dx = clamp(pointerDelta.x, minVisiblePx - startRect.right, viewport.width - minVisiblePx - startRect.left);
    const dy = clamp(pointerDelta.y, -startRect.top, viewport.height - minVisiblePx - startRect.top);
    return { x: startOffset.x + dx, y: startOffset.y + dy };
};
