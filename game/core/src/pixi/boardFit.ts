/*
 * -----------------------------------------------------------------------------
 * This file is part of the common code of the Heroes of Crypto.
 *
 * Heroes of Crypto and Heroes of Crypto AI are registered trademarks.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 * -----------------------------------------------------------------------------
 */

/** Sidebars keep 85% of their former width, handing the remaining 15% to the battlefield. */
export const BATTLE_SIDEBAR_WIDTH_RATIO = 0.85;

/**
 * Painted floor height above its bottom seam in the canonical battlefield artwork (1013px of 1342px),
 * plus a small vertical bleed. The bleed pushes the bitmap's rounded dark top edge under the combat frame
 * at every aspect ratio while the camera, units and visual 16x16 projection keep the same shared fit.
 */
export const BATTLEFIELD_VERTICAL_BLEED = 1.03;
export const BATTLEFIELD_HEIGHT_RATIO = (1013 / 1342) * BATTLEFIELD_VERTICAL_BLEED;

/** Padding remains zero: the new top band comes from the shorter rows, not from cropping the board. */
export const BOARD_FIT_PADDING_RATIO = 0;

export const boardFitPadding = (width: number, height: number): number =>
    Math.round(Math.min(width, height) * BOARD_FIT_PADDING_RATIO);

/** Size of the old square fit, retained as the baseline for the 15% sidebar reduction. */
export const legacyBoardFitSize = (width: number, height: number): number =>
    Math.max(0, Math.min(width, height) - 2 * boardFitPadding(width, height));

/** Sidebar width before the requested reduction; also used to preserve existing UI element sizing. */
export const legacyBattleSidebarWidth = (width: number, height: number): number =>
    Math.max(0, Math.round((width - legacyBoardFitSize(width, height)) / 2));

/** Width of either sidebar after the requested 15% reduction. */
export const battleSidebarWidth = (width: number, height: number): number =>
    Math.max(0, Math.round(legacyBattleSidebarWidth(width, height) * BATTLE_SIDEBAR_WIDTH_RATIO));

/** Battlefield width between the two equally sized sidebars. */
export const boardFitWidth = (width: number, height: number): number =>
    Math.max(0, width - 2 * battleSidebarWidth(width, height));

/** Battlefield height matched to the painted 16-row floor. */
export const boardFitHeight = (width: number, height: number): number =>
    Math.max(0, legacyBoardFitSize(width, height) * BATTLEFIELD_HEIGHT_RATIO);

export type BoardChildScaleCompensation = Readonly<{ x: number; y: number }>;

/**
 * Counter-scale for artwork that must retain its old on-screen size inside the rectangular board camera.
 *
 * Grid positions must inherit the new X/Y camera fit, but character artwork must not: multiplying its local
 * scale by this pair makes the final screen-space width and height match the former square fit exactly.
 */
export const legacyBoardChildScaleCompensation = (
    inheritedScaleX: number,
    inheritedScaleY: number,
): BoardChildScaleCompensation => {
    const scaleX = Math.abs(inheritedScaleX);
    const scaleY = Math.abs(inheritedScaleY);
    if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || scaleX <= 0 || scaleY <= 0) {
        return { x: 1, y: 1 };
    }
    // Unit tests, previews and any non-battle scene still use a uniform camera and need no correction.
    if (Math.abs(scaleX - scaleY) <= Math.max(scaleX, scaleY) * 1e-6) {
        return { x: 1, y: 1 };
    }

    // The current Y fit is exactly BATTLEFIELD_HEIGHT_RATIO of the former square fit.
    const legacyScale = scaleY / BATTLEFIELD_HEIGHT_RATIO;
    return { x: legacyScale / scaleX, y: legacyScale / scaleY };
};

/**
 * How much a world-space vertical extent must be multiplied by to come out SQUARE on screen.
 *
 * The board camera is deliberately anisotropic (`PixiScene.fitWorldToViewport` sets scaleX from the full
 * width between the narrowed sidebars and scaleY from the painted 16-row floor), so at 16:9 a world square
 * renders roughly 1.4x wider than tall. Cell POSITIONS and cell-area coverage should keep inheriting that
 * — the board's own cells are drawn wider than tall and effects that blanket a cell must agree with them.
 * Artwork must not: a drawn thing (a creature, a spell icon, a flame sprite) deforms visibly, which is why
 * `legacyBoardChildScaleCompensation` exists for units.
 *
 * This is the lighter-weight sibling of that helper, for pictures that only need their ASPECT fixed and
 * must keep the on-screen width they already have — multiply the Y scale by this and a square sprite is
 * square again. Returns exactly 1 under a uniform camera (unit tests, previews, non-battle scenes), and is
 * clamped so a mid-resize or a degenerate viewport can never explode a sprite.
 */
export const boardVerticalStretch = (inheritedScaleX: number, inheritedScaleY: number): number => {
    const scaleX = Math.abs(inheritedScaleX);
    const scaleY = Math.abs(inheritedScaleY);
    if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || scaleX <= 0 || scaleY <= 0) {
        return 1;
    }
    if (Math.abs(scaleX - scaleY) <= Math.max(scaleX, scaleY) * 1e-6) {
        return 1;
    }
    return Math.max(0.75, Math.min(2.5, scaleX / scaleY));
};

/**
 * Absolute scale a container inherits from every ancestor, including its own.
 *
 * Pixi only refreshes `worldTransform` at render time, but `scale` is a plain property that is current the
 * moment the camera is fitted, so walking the parent chain is both cheaper and safe to call straight after
 * attaching a freshly spawned effect.
 */
export const inheritedAbsoluteScaleOf = (container: { scale: { x: number; y: number }; parent: unknown } | null) => {
    let x = 1;
    let y = 1;
    let current = container as { scale: { x: number; y: number }; parent: unknown } | null;
    while (current) {
        x *= Math.abs(current.scale.x);
        y *= Math.abs(current.scale.y);
        current = current.parent as { scale: { x: number; y: number }; parent: unknown } | null;
    }
    return { x, y };
};

/**
 * Compatibility alias for callers that still need a single baseline size. New rendering code must use
 * boardFitWidth/boardFitHeight because the battlefield is intentionally rectangular now.
 */
export const boardFitSize = legacyBoardFitSize;

/**
 * Camera/background offset from the viewport centre. A negative value moves the battlefield down so its
 * bottom edge remains flush with the window and all freed vertical space becomes a black band above it.
 */
export const boardFitVerticalShift = (width: number, height: number): number =>
    (boardFitHeight(width, height) - height) / 2;
