import React, { useState, useCallback, useEffect, useMemo } from "react";
import { IVisibleButton, VisibleButtonState } from "../../scenes/VisibleState";
import { usePixiManager } from "../../pixi/PixiGameManager";
import { ButtonContext, spectatorButtons, useButtonContext } from "./ButtonContextDefs";

export { useButtonContext };

/** `readOnly`: a spectator's fight — the toolbar mirrors the active unit's options, disabled, and clicks go nowhere. */
export const ButtonProvider: React.FC<{ children: React.ReactNode; readOnly?: boolean }> = ({
    children,
    readOnly = false,
}) => {
    const manager = usePixiManager();
    const [buttons, setButtons] = useState<IVisibleButton[]>([]);

    useEffect(() => {
        // Initial fetch
        setButtons(manager.GetButtonGroup());

        // Listen for updates
        const connection = manager.onHasButtonsGroupUpdate.connect((updatedButtons) => {
            // If payload is provided, use it. usage in PixiGameManager will be updated to pass payload
            if (Array.isArray(updatedButtons)) {
                setButtons(updatedButtons);
            } else {
                // Fallback if signal not yet updated to pass payload (or during transition)
                setButtons(manager.GetButtonGroup());
            }
        });

        return () => {
            connection.disconnect();
        };
    }, [manager]);

    const propagateClick = useCallback(
        (name: string, state: VisibleButtonState) => {
            if (readOnly) {
                return;
            }
            manager.PropagateButtonClicked(name, state);
        },
        [manager, readOnly],
    );

    const shownButtons = useMemo(() => (readOnly ? spectatorButtons(buttons) : buttons), [buttons, readOnly]);
    const value = useMemo(() => ({ buttons: shownButtons, propagateClick }), [shownButtons, propagateClick]);

    return <ButtonContext.Provider value={value}>{children}</ButtonContext.Provider>;
};
