import React, { createContext, useContext } from "react";

import type { PremiumAdvice } from "../../api/premium_client";
import { usePremiumAdvisor } from "./PremiumAdvisor";

const PremiumAccessContext = createContext<PremiumAdvice["entitlement"] | undefined>(undefined);

/** Access stays available to Settings even when every capability is switched off. */
export const PremiumAccessProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { advice } = usePremiumAdvisor();
    return <PremiumAccessContext.Provider value={advice?.entitlement}>{children}</PremiumAccessContext.Provider>;
};

export const usePremiumAccess = () => useContext(PremiumAccessContext);
