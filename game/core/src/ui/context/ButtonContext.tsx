import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { IVisibleButton, VisibleButtonState } from "../../scenes/VisibleState";
import { usePixiManager } from "../../pixi/PixiGameManager";

export interface IButtonContext {
    buttons: IVisibleButton[];
    propagateClick: (name: string, state: VisibleButtonState) => void;
}

const ButtonContext = createContext<IButtonContext | null>(null);

export function useButtonContext() {
    const context = useContext(ButtonContext);
    if (!context) {
        throw new Error("useButtonContext must be used within a ButtonProvider");
    }
    return context;
}

export const ButtonProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
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
            manager.PropagateButtonClicked(name, state);
        },
        [manager],
    );

    const value = useMemo(() => ({ buttons, propagateClick }), [buttons, propagateClick]);

    return <ButtonContext.Provider value={value}>{children}</ButtonContext.Provider>;
};
