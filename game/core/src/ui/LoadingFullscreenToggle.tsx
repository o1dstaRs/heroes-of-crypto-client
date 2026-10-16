import React from "react";

import { GameCornerExitButton, GameCornerSlot } from "./GameCornerExit";
import { GameSystemControls } from "./GameSystemControls";

/**
 * Loading-screen system controls. The Pixi loading artwork sits below the HTML input canvas, so this small
 * React overlay carries the same corner HUD every in-game screen wears — sound stacked above fullscreen in
 * the bottom-right corner, and, when the host has somewhere to go back to, the shared close button.
 *
 * The corner medallion is not mounted here: SocialDock lives at the app root and each host (sandbox,
 * ranked) already publishes the compact mode on mount, loading screen included.
 */
export const LoadingFullscreenToggle: React.FC<{ onExit?: () => void; exitLabel?: string }> = ({
    onExit,
    exitLabel = "Back",
}) => (
    <>
        <GameSystemControls rightStack zIndex={60} />
        {onExit && (
            <GameCornerSlot>
                <GameCornerExitButton onClick={onExit} label={exitLabel} />
            </GameCornerSlot>
        )}
    </>
);
