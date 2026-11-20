import { setPremiumPreference } from "./premiumPreferences";

export const setPremiumSuggestedMoves = (enabled: boolean): void => setPremiumPreference("suggestedMoves", enabled);
