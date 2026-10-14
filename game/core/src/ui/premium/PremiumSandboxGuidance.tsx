import { useEffect } from "react";

import { usePixiManager } from "../../pixi/PixiGameManager";
import { usePremiumAccess } from "./PremiumAccess";
import { usePremiumSuggestedMoves } from "./usePremiumSuggestedMoves";

/** Draw automatically for Premium players unless they have disabled suggested moves. */
export const PremiumSandboxGuidance = () => {
    const manager = usePixiManager();
    const access = usePremiumAccess();
    const suggestedMoves = usePremiumSuggestedMoves();
    const enabled = suggestedMoves && Boolean(access?.active);
    useEffect(() => {
        manager.SetPremiumSandboxGuidance(enabled);
        return () => manager.SetPremiumSandboxGuidance(false);
    }, [enabled, manager]);
    return null;
};
