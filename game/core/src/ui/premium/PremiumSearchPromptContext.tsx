import { createContext, useContext } from "react";

export const PremiumSearchPromptContext = createContext<((question: string) => void) | undefined>(undefined);

export const useAskPremiumQuestion = () => useContext(PremiumSearchPromptContext);
