import { useEffect, useState } from "react";
import { images } from "../../generated/image_imports";
import type { IHoverInfo } from "../../scenes/VisibleState";
import { usePixiManager } from "../../pixi/PixiGameManager";

/**
 * Cursor modes for the themed in-game cursor. Each maps to the Google Drive-backed generated image set.
 *
 * HoMM-style behaviour: the attack cursor (sword/bow/magic) ONLY appears when the cursor is actively
 * over an enemy unit the active unit can attack — not merely from having selected an attack type.
 */
export type CursorMode = "default" | "interactive" | "melee" | "ranged" | "magic";

// Per-cursor hotspot, expressed in the cursor artwork.s own pixel space. The PNGs are tight-cropped
// (no transparent border) with the sprite anchored in the top-left corner, so the click point is
// (0, 0) — matching the OS default arrow, where the tip is the hot point.
const CURSOR_HOTSPOT: Record<CursorMode, { x: number; y: number }> = {
    default: { x: 0, y: 0 },
    interactive: { x: 0, y: 0 },
    melee: { x: 0, y: 0 },
    ranged: { x: 0, y: 0 },
    magic: { x: 0, y: 0 },
};

const CURSOR_IMAGE: Record<CursorMode, string> = {
    default: images.cursor_default,
    interactive: images.cursor_interactive_point_x,
    melee: images.cursor_melee,
    ranged: images.cursor_ranged,
    magic: images.cursor_magic,
};

export function resolveCursorMode(hoverInfo: IHoverInfo | undefined): CursorMode {
    // Target highlights, trajectories and edge colours already communicate attack intent. Always retain
    // the standard game pointer directly over the target so it never disappears or changes under the hand.
    if (hoverInfo?.isHoveringAttackTarget) {
        return "default";
    }
    // Hovering any other (non-attackable) unit reads as "interactive" — inspect / potential target.
    if (hoverInfo?.unitName) {
        return "interactive";
    }
    return "default";
}

export function cursorCss(mode: CursorMode): string {
    const hot = CURSOR_HOTSPOT[mode];
    return `url("${CURSOR_IMAGE[mode]}") ${hot.x} ${hot.y}, auto`;
}

/**
 * Subscribes to the Pixi scene's hover-info signal and applies the themed in-game cursor GLOBALLY
 * by setting `document.body.style.cursor`. Mount this once near the app root (e.g. `Heroes`) so the
 * cursor covers the entire screen, not just the battle canvas. Restores the previous cursor on unmount.
 *
 * Follows the canonical Signal+usePixiManager pattern (see Popover/index.tsx).
 */
export function useGameCursor(): void {
    const manager = usePixiManager();
    const [mode, setMode] = useState<CursorMode>("default");

    useEffect(() => {
        const connection = manager.onHoverInfoUpdated.connect((hoverInfo) => {
            const nextMode = resolveCursorMode(hoverInfo);
            // Hover payloads change far more often than the cursor itself. Avoid rerendering this
            // app-root hook for every pointer move when the resolved cursor remains identical.
            setMode((currentMode) => (currentMode === nextMode ? currentMode : nextMode));
        });
        return () => {
            connection.disconnect();
        };
    }, [manager]);

    useEffect(() => {
        document.body.style.cursor = cursorCss(mode);
        return () => {
            document.body.style.cursor = "";
        };
    }, [mode]);
}
