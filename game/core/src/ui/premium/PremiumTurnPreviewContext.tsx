import React, { createContext, useCallback, useContext, useState } from "react";

import type { PremiumTurnPreview } from "../../api/premium_client";
import type { PremiumSearchMatchVersion } from "./premiumSearchFreshness";

export interface PremiumTurnReview extends PremiumTurnPreview {
    versionKey: string;
    actorName: string;
}

const Preview = createContext<PremiumTurnReview | undefined>(undefined);
const SetPreview = createContext<(preview?: PremiumTurnReview) => void>(() => {});

export const PremiumTurnPreviewProvider: React.FC<{ scope: string; children: React.ReactNode }> = ({
    scope,
    children,
}) => {
    const [state, setState] = useState<{ scope: string; preview?: PremiumTurnReview }>();
    const publish = useCallback((preview?: PremiumTurnReview) => setState({ scope, preview }), [scope]);
    return (
        <SetPreview.Provider value={publish}>
            <Preview.Provider value={state?.scope === scope ? state.preview : undefined}>{children}</Preview.Provider>
        </SetPreview.Provider>
    );
};

export const currentPremiumTurnReview = (
    preview: PremiumTurnReview | undefined,
    gameId: string | undefined,
    version: PremiumSearchMatchVersion | undefined,
): PremiumTurnReview | undefined =>
    preview?.status === "ready" &&
    preview.options.length > 0 &&
    preview.gameId === gameId &&
    version?.gameId === gameId &&
    version.source === "play" &&
    version.stage === "fight" &&
    version.key === preview.versionKey
        ? preview
        : undefined;

export const usePremiumTurnReview = () => useContext(Preview);
export const usePublishPremiumTurnReview = () => useContext(SetPreview);
