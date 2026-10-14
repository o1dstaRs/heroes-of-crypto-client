export type PremiumCapability = "chat" | "draft" | "setup" | "suggestedMoves";
export type PremiumPreference = "enabled" | PremiumCapability;

const sessionPreferences: Partial<Record<PremiumPreference, boolean>> = {};
const listeners = new Set<() => void>();

/** Keep the existing suggested-moves key so earlier manual choices survive. */
export const readPremiumPreference = (preference: PremiumPreference): boolean => {
    try {
        return globalThis.localStorage?.getItem(`hoc.premium.${preference}`) !== "false";
    } catch {
        return true;
    }
};

export const getPremiumPreference = (preference: PremiumPreference): boolean =>
    sessionPreferences[preference] ?? readPremiumPreference(preference);

export const getPremiumCapability = (capability: PremiumCapability): boolean =>
    getPremiumPreference("enabled") && getPremiumPreference(capability);

export const getPremiumPreferenceServerSnapshot = (): boolean => true;

export const subscribePremiumPreferences = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

export const setPremiumPreference = (preference: PremiumPreference, enabled: boolean): void => {
    sessionPreferences[preference] = enabled;
    try {
        globalThis.localStorage?.setItem(`hoc.premium.${preference}`, String(enabled));
    } catch {
        // Keep the manual choice for this session even when browser storage is unavailable.
    }
    for (const listener of listeners) listener();
};
