import { createContext, useContext } from "react";

export interface PremiumInspectionFocus {
    unitId: string;
    name: string;
    optionId?: string;
    moveNumber?: number;
}

export const PremiumSearchPromptContext = createContext<
    ((question: string, focus?: PremiumInspectionFocus) => void) | undefined
>(undefined);

export const useAskPremiumQuestion = () => useContext(PremiumSearchPromptContext);
