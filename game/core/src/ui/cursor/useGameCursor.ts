import { useEffect, useState } from "react";
import { AttackVals } from "@heroesofcrypto/common";
import { images } from "../../generated/image_imports";
import type { IHoverInfo } from "../../scenes/VisibleState";
import { usePixiManager } from "../../pixi/PixiGameManager";

/**
 * Cursor modes for the themed in-game cursor. Each maps to the Dropbox-backed generated image set.
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

function resolveCursorMode(hoverInfo: IHoverInfo | undefined): CursorMode {
    // HoMM-style: the attack cursor only shows when actively aiming at an attackable enemy. The
    // active unit's selected attack type then picks which attack cursor image (sword/bow/magic) to use.
    if (hoverInfo?.isHoveringAttackTarget) {
        const attackType = hoverInfo.attackType;
        if (attackType === AttackVals.MELEE) {
            return "melee";
        }
        if (attackType === AttackVals.RANGE) {
            return "ranged";
        }
        if (attackType === AttackVals.MAGIC || attackType === AttackVals.MELEE_MAGIC) {
            return "magic";
        }
        // Attack target hovered but attack type not reported (e.g. a spell-target hover): show melee
        // sword as a generic "attack/aim" cursor rather than falling back to default.
        return "melee";
    }
    // Hovering any other (non-attackable) unit reads as "interactive" — inspect / potential target.
    if (hoverInfo?.unitName) {
        return "interactive";
    }
    return "default";
}

function cursorCss(mode: CursorMode): string {
    // The board renders the directional sword itself. Keeping a second OS sword/arrow over it produces
    // two competing markers, so the native cursor disappears for exactly the duration of a melee aim.
    if (mode === "melee") return "none";
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
    const [hoverInfo, setHoverInfo] = useState<IHoverInfo | undefined>(undefined);

    useEffect(() => {
        const connection = manager.onHoverInfoUpdated.connect(setHoverInfo);
        return () => {
            connection.disconnect();
        };
    });

    useEffect(() => {
        const mode = resolveCursorMode(hoverInfo);
        document.body.style.cursor = cursorCss(mode);
        let hiddenCursorStyle: HTMLStyleElement | undefined;
        if (mode === "melee") {
            // Child controls can declare their own cursor and override an inherited body value. The
            // temporary rule guarantees that the system pointer stays hidden over every canvas layer.
            hiddenCursorStyle = document.createElement("style");
            hiddenCursorStyle.textContent = "body, body * { cursor: none !important; }";
            document.head.appendChild(hiddenCursorStyle);
        }
        return () => {
            document.body.style.cursor = "";
            hiddenCursorStyle?.remove();
        };
    }, [hoverInfo]);
}
