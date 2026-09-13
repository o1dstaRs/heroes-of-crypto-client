import type { TeamType } from "@heroesofcrypto/common";
import React from "react";

import type { SandboxCoopSession } from "../api/sandbox_coop_client";
import type { IWindowSize } from "../scenes/VisibleState";
import { GameErrorBoundary } from "./GameErrorBoundary";

export { fetchRankedPlaySnapshot } from "../api/ranked_play_client";

const RankedGameViewRuntime = React.lazy(() =>
    import("./RankedGameViewRuntime").then((module) => ({ default: module.RankedGameView })),
);

type Props = {
    gameId: string;
    userTeam: TeamType;
    windowSize: IWindowSize;
    replayOnly?: boolean;
    /** Friend co-op sandbox (route /sandbox/:id): the two seats and which one is ours. */
    sandboxCoop?: SandboxCoopSession;
};

/** Route boundary that keeps the live ranked controller out of sandbox and draft startup. */
export const RankedGameView: React.FC<Props> = (props) => (
    <GameErrorBoundary
        context={`${props.sandboxCoop ? "sandbox" : props.replayOnly ? "replay" : "game"} ${props.gameId}`}
    >
        <React.Suspense fallback={null}>
            <RankedGameViewRuntime {...props} />
        </React.Suspense>
    </GameErrorBoundary>
);
