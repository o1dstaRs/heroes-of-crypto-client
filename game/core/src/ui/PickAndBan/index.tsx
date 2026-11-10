import type { TeamType } from "@heroesofcrypto/common";
import React from "react";
import type { DraftBanPlacement } from "./DraftBanPlacement";

const DraftRuntime = React.lazy(() => import("./runtime"));

interface Props {
    banPlacement?: DraftBanPlacement;
    userTeam: TeamType;
    gameId?: string;
    opponentLabel?: string;
    height?: number;
    showOpponentRosterDuringAugmentHandoff?: boolean;
    systemControl?: React.ReactNode;
}

/** Route boundary that keeps the live draft implementation out of sandbox startup. */
const StainedGlassWindow: React.FC<Props> = (props) => (
    <React.Suspense fallback={null}>
        <DraftRuntime {...props} />
    </React.Suspense>
);

export default StainedGlassWindow;
