import React, { useLayoutEffect, useRef } from "react";

import type { PlaySnapshot } from "../../api/play_protocol";
import { usePixiManager } from "../../pixi/PixiGameManager";
import { usePremiumAccess } from "./PremiumAccess";
import { canSuggestPremiumTurn, premiumFightTurnKey } from "./premiumFightState";
import { startPremiumTurnPreview } from "./premiumTurnRequest";
import { usePremiumSuggestedMoves } from "./usePremiumSuggestedMoves";
import { usePublishPremiumTurnReview } from "./PremiumTurnPreviewContext";
import { premiumSearchPlayVersion } from "./premiumSearchFreshness";

export const PremiumFightOverlay: React.FC<{
    snapshot: PlaySnapshot;
    userTeam: number;
    disabled?: boolean;
}> = ({ snapshot, userTeam, disabled = false }) => {
    const manager = usePixiManager();
    const access = usePremiumAccess();
    const suggestedMoves = usePremiumSuggestedMoves();
    const publishReview = usePublishPremiumTurnReview();
    const key = premiumFightTurnKey(snapshot);
    const enabled = suggestedMoves && Boolean(access?.active) && canSuggestPremiumTurn(snapshot, userTeam) && !disabled;
    const latestSnapshot = useRef(snapshot);
    latestSnapshot.current = snapshot;

    useLayoutEffect(() => {
        if (!enabled) {
            manager.SetPremiumTurnPreview(undefined);
            publishReview(undefined);
            return;
        }
        const current = latestSnapshot.current;
        return startPremiumTurnPreview(current, (turn) => {
            manager.SetPremiumTurnPreview(turn);
            publishReview(
                turn
                    ? {
                          ...turn,
                          actorName: current.units.find((unit) => unit.id === turn.unitId)?.name ?? "Acting unit",
                          versionKey: premiumSearchPlayVersion(current),
                      }
                    : undefined,
            );
        });
    }, [enabled, key, manager, publishReview]);

    return null;
};
