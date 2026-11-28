import { useEffect, useState } from "react";
import { images } from "../../generated/image_imports";
import type { IHoverInfo, TargetingCursor } from "../../scenes/VisibleState";
import { usePixiManager } from "../../pixi/PixiGameManager";

export type CursorMode = "default" | "interactive" | TargetingCursor;

const CURSOR_IMAGE: Record<CursorMode, string> = {
    default: images.cursor_default,
    interactive: images.cursor_interactive_point_x,
    ranged: images.cursor_ranged,
    magic: images.cursor_magic,
};

export function resolveCursorMode(hoverInfo: IHoverInfo | undefined): CursorMode {
    if (hoverInfo?.targetingCursor) return hoverInfo.targetingCursor;
    // The directional melee sword is drawn on the battlefield.
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
    const artwork = `url("${CURSOR_IMAGE[mode]}") 0 0`;
    const fallback = mode === "default" || mode === "interactive" ? "" : `url("${CURSOR_IMAGE.default}") 0 0, `;
    return `${artwork}, ${fallback}auto`;
}

/** Sets the shared game pointer and scopes the bow and wand to the battlefield input canvas. */
export function useGameCursor(): void {
    const manager = usePixiManager();
    const [mode, setMode] = useState<CursorMode>("default");

    useEffect(() => {
        const connection = manager.onHoverInfoUpdated.connect((hoverInfo) => {
            const nextMode = resolveCursorMode(hoverInfo);
            // Keep the canvas from rerendering for hover updates with the same cursor.
            setMode((currentMode) => (currentMode === nextMode ? currentMode : nextMode));
        });
        return () => {
            connection.disconnect();
        };
    }, [manager]);

    useEffect(() => {
        const { style } = document.body;
        const previousCursor = style.cursor;
        const isAiming = mode === "ranged" || mode === "magic";
        style.cursor = cursorCss(isAiming ? "default" : mode);
        if (isAiming) style.setProperty("--hoc-targeting-cursor", cursorCss(mode));
        return () => {
            style.cursor = previousCursor;
            if (isAiming) style.removeProperty("--hoc-targeting-cursor");
        };
    }, [mode]);
}
