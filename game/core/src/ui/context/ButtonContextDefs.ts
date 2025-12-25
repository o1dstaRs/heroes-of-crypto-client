import { createContext, useContext } from "react";
import { IVisibleButton, VisibleButtonState } from "../../scenes/VisibleState";

export interface IButtonContext {
    buttons: IVisibleButton[];
    propagateClick: (name: string, state: VisibleButtonState) => void;
}

export const ButtonContext = createContext<IButtonContext | null>(null);

export function useButtonContext() {
    const context = useContext(ButtonContext);
    if (!context) {
        throw new Error("useButtonContext must be used within a ButtonProvider");
    }
    return context;
}
