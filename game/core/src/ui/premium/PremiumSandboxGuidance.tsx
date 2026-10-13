import { useEffect } from "react";

import { usePixiManager } from "../../pixi/PixiGameManager";
import { usePremiumAdvisor } from "./PremiumAdvisor";

/** Account access enables automatic board drawings; no button or question is needed. */
export const PremiumSandboxGuidance = () => {
    const manager = usePixiManager();
    const { advice } = usePremiumAdvisor();
    const enabled = Boolean(advice?.entitlement.active);
    useEffect(() => {
        manager.SetPremiumSandboxGuidance(enabled);
        return () => manager.SetPremiumSandboxGuidance(false);
    }, [enabled, manager]);
    return null;
};
