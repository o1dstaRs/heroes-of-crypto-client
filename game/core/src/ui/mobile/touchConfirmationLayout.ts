import { TOUCH_ACTIONBAR_HEIGHT, TOUCH_TOPBAR_HEIGHT } from "../../viewport/gameViewport";

interface Point {
    x: number;
    y: number;
}
interface Size {
    width: number;
    height: number;
}
interface Insets {
    top: number;
    right: number;
    bottom: number;
    left: number;
}
export interface TouchConfirmationLayout {
    left: number;
    top: number;
    placement: "above" | "below" | "left" | "right";
    arrow: number;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Keep the target clear, including when a short landscape screen needs the bubble beside it. */
export function touchConfirmationLayout(
    anchor: Point,
    size: Size,
    viewport: Size,
    safe: Insets,
): TouchConfirmationLayout {
    const margin = 8;
    const gap = 32;
    const minX = safe.left + margin;
    const maxX = Math.max(minX, viewport.width - safe.right - margin - size.width);
    const minY = safe.top + TOUCH_TOPBAR_HEIGHT + margin;
    const maxY = Math.max(minY, viewport.height - safe.bottom - TOUCH_ACTIONBAR_HEIGHT - margin - size.height);
    const left = clamp(anchor.x - size.width / 2, minX, maxX);
    const top = clamp(anchor.y - size.height / 2, minY, maxY);
    const arrowX = clamp(anchor.x - left, 18, size.width - 18);
    const arrowY = clamp(anchor.y - top, 18, size.height - 18);
    const above = anchor.y - gap - size.height;
    const below = anchor.y + gap;
    // Creature art stands above its ground cell. Prefer below, then beside it, to keep the art visible.
    if (below <= maxY) return { left, top: below, placement: "below", arrow: arrowX };
    if (anchor.x - gap - size.width >= minX) {
        return { left: anchor.x - gap - size.width, top, placement: "left", arrow: arrowY };
    }
    if (anchor.x + gap <= maxX) return { left: anchor.x + gap, top, placement: "right", arrow: arrowY };
    if (above >= minY) return { left, top: above, placement: "above", arrow: arrowX };
    return { left, top: clamp(above, minY, maxY), placement: "above", arrow: arrowX };
}
