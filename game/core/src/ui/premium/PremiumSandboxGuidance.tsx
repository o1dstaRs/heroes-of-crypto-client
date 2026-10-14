import { useEffect } from "react";

import { usePixiManager } from "../../pixi/PixiGameManager";
import { usePremiumAdvisor } from "./PremiumAdvisor";
import { usePremiumSuggestedMoves } from "./usePremiumSuggestedMoves";

/** Draw automatically for Premium players unless they have disabled suggested moves. */
export const PremiumSandboxGuidance = () => {
    const manager = usePixiManager();
    const { advice } = usePremiumAdvisor();
    const suggestedMoves = usePremiumSuggestedMoves();
    const enabled = suggestedMoves && Boolean(advice?.entitlement.active);
    useEffect(() => {
        manager.SetPremiumSandboxGuidance(enabled);
        return () => manager.SetPremiumSandboxGuidance(false);
    }, [enabled, manager]);
    return null;
};
