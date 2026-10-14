import { usePremiumCapability } from "./usePremiumPreference";

export const usePremiumSuggestedMoves = (): boolean => usePremiumCapability("suggestedMoves");
