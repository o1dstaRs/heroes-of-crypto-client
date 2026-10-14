const STORAGE_KEY = "hoc.premium.suggestedMoves";
let sessionPreference: boolean | undefined;
const listeners = new Set<() => void>();

/** Suggestions start enabled until the player explicitly turns them off. */
export const readPremiumSuggestedMoves = (): boolean => {
    try {
        return globalThis.localStorage?.getItem(STORAGE_KEY) !== "false";
    } catch {
        return true;
    }
};

export const getPremiumSuggestedMoves = (): boolean => sessionPreference ?? readPremiumSuggestedMoves();
export const getPremiumSuggestedMovesServerSnapshot = (): boolean => true;

export const subscribePremiumSuggestedMoves = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

export const setPremiumSuggestedMoves = (enabled: boolean): void => {
    sessionPreference = enabled;
    try {
        globalThis.localStorage?.setItem(STORAGE_KEY, String(enabled));
    } catch {
        // Keep the manual choice for this session even when browser storage is unavailable.
    }
    for (const listener of listeners) listener();
};
