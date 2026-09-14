import type { TeamType } from "@heroesofcrypto/common";
import React from "react";

import type { SandboxCoopSession } from "../api/sandbox_coop_client";
import type { IWindowSize } from "../scenes/VisibleState";
import { GameErrorBoundary } from "./GameErrorBoundary";

export { fetchRankedPlaySnapshot } from "../api/ranked_play_client";

const loadRuntime = () => import("./RankedGameViewRuntime");

const RankedGameViewRuntime = React.lazy(() => loadRuntime().then((module) => ({ default: module.RankedGameView })));

/** Fetch the board view's code ahead of the handoff (the draft calls this), so the lazy route renders at once. */
export const preloadRankedGameView = (): void => {
    // A failed preload is not an error: the route's own lazy import fetches it again when it is needed.
    loadRuntime().catch(() => undefined);
};

type Props = {
    gameId: string;
    userTeam: TeamType;
    windowSize: IWindowSize;
    replayOnly?: boolean;
    /** Friend co-op sandbox (route /sandbox/:id): the two seats and which one is ours. */
    sandboxCoop?: SandboxCoopSession;
    /** Called once the view has a board (or the reason it cannot load) to show; the draft covers it until then. */
    onReadyToShow?: () => void;
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
