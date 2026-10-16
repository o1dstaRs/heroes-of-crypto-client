import {
    getPremiumPreference,
    getPremiumPreferenceServerSnapshot,
    readPremiumPreference,
    setPremiumPreference,
    subscribePremiumPreferences,
} from "./premiumPreferences";

/** Suggestions start enabled until the player explicitly turns them off. */
export const readPremiumSuggestedMoves = (): boolean => readPremiumPreference("suggestedMoves");

export const getPremiumSuggestedMoves = (): boolean => getPremiumPreference("suggestedMoves");
export const getPremiumSuggestedMovesServerSnapshot = getPremiumPreferenceServerSnapshot;

export const subscribePremiumSuggestedMoves = subscribePremiumPreferences;

export const setPremiumSuggestedMoves = (enabled: boolean): void => setPremiumPreference("suggestedMoves", enabled);
