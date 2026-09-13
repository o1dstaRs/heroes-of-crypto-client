import { createContext, useContext } from "react";
import { IVisibleButton, VisibleButtonState } from "../../scenes/VisibleState";

export interface IButtonContext {
    buttons: IVisibleButton[];
    propagateClick: (name: string, state: VisibleButtonState) => void;
}

export const ButtonContext = createContext<IButtonContext | null>(null);

/**
 * A spectator's fight toolbar: the same buttons the scene publishes, each still shown, but all disabled. Returns
 * copies, so the scene's own button state is never touched.
 */
export const spectatorButtons = (buttons: readonly IVisibleButton[]): IVisibleButton[] =>
    buttons.map((button) => (button.isDisabled ? button : { ...button, isDisabled: true }));

export function useButtonContext() {
    const context = useContext(ButtonContext);
    if (!context) {
        throw new Error("useButtonContext must be used within a ButtonProvider");
    }
    return context;
}
