import type { TeamType } from "@heroesofcrypto/common";
import { CssVarsProvider } from "@mui/joy/styles";
import React from "react";

import type { SandboxCoopSession } from "../api/sandbox_coop_client";
import type { IWindowSize } from "../scenes/VisibleState";
import { GameErrorBoundary } from "./GameErrorBoundary";
import { hocJoyTheme } from "./hocTheme";

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

/**
 * Route boundary that keeps the live ranked controller out of sandbox and draft startup.
 *
 * The Joy theme is provided here, not inside the runtime. Joy's CssVarsProvider (on @mui/system 5)
 * rebuilds its theme object on every render, and a new theme re-renders every styled element under
 * it whatever its props. The runtime re-renders several times a second during a fight, which re-ran
 * the styles of both sidebars and the battle log each time (measured 2026-11-20); this wrapper
 * re-renders only when the route's props change.
 */
export const RankedGameView: React.FC<Props> = (props) => (
    <GameErrorBoundary
        context={`${props.sandboxCoop ? "sandbox" : props.replayOnly ? "replay" : "game"} ${props.gameId}`}
    >
        <CssVarsProvider theme={hocJoyTheme}>
            <React.Suspense fallback={null}>
                <RankedGameViewRuntime {...props} />
            </React.Suspense>
        </CssVarsProvider>
    </GameErrorBoundary>
);
