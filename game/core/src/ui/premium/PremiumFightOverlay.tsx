import React, { useEffect, useRef } from "react";

import type { PlaySnapshot } from "../../api/play_protocol";
import { usePixiManager } from "../../pixi/PixiGameManager";
import { usePremiumAdvisor } from "./PremiumAdvisor";
import { canSuggestPremiumTurn, premiumFightTurnKey } from "./premiumFightState";
import { startPremiumTurnPreview } from "./premiumTurnRequest";
import { usePremiumSuggestedMoves } from "./usePremiumSuggestedMoves";

export const PremiumFightOverlay: React.FC<{
    snapshot: PlaySnapshot;
    userTeam: number;
    disabled?: boolean;
}> = ({ snapshot, userTeam, disabled = false }) => {
    const manager = usePixiManager();
    const { advice: account } = usePremiumAdvisor();
    const suggestedMoves = usePremiumSuggestedMoves();
    const key = premiumFightTurnKey(snapshot);
    const enabled =
        suggestedMoves &&
        Boolean(account?.entitlement.active) &&
        canSuggestPremiumTurn(snapshot, userTeam) &&
        !disabled;
    const latestSnapshot = useRef(snapshot);
    latestSnapshot.current = snapshot;

    useEffect(() => {
        if (!enabled) {
            manager.SetPremiumTurnPreview(undefined);
            return;
        }
        return startPremiumTurnPreview(latestSnapshot.current, (turn) => manager.SetPremiumTurnPreview(turn));
    }, [enabled, key, manager]);

    return null;
};
