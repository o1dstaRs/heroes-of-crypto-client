import { useSyncExternalStore } from "react";

import {
    getPremiumCapability,
    getPremiumPreference,
    getPremiumPreferenceServerSnapshot,
    subscribePremiumPreferences,
    type PremiumCapability,
    type PremiumPreference,
} from "../../settings/premiumPreferences";

export const usePremiumPreference = (preference: PremiumPreference): boolean =>
    useSyncExternalStore(
        subscribePremiumPreferences,
        () => getPremiumPreference(preference),
        getPremiumPreferenceServerSnapshot,
    );

export const usePremiumCapability = (capability: PremiumCapability): boolean =>
    useSyncExternalStore(
        subscribePremiumPreferences,
        () => getPremiumCapability(capability),
        getPremiumPreferenceServerSnapshot,
    );
