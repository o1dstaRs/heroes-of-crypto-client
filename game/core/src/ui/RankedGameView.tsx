import type { TeamType } from "@heroesofcrypto/common";
import React from "react";

import type { IWindowSize } from "../scenes/VisibleState";

export { fetchRankedPlaySnapshot } from "../api/ranked_play_client";

const RankedGameViewRuntime = React.lazy(() =>
    import("./RankedGameViewRuntime").then((module) => ({ default: module.RankedGameView })),
);

type Props = {
    gameId: string;
    userTeam: TeamType;
    windowSize: IWindowSize;
    replayOnly?: boolean;
};

/** Route boundary that keeps the live ranked controller out of sandbox and draft startup. */
export const RankedGameView: React.FC<Props> = (props) => (
    <React.Suspense fallback={null}>
        <RankedGameViewRuntime {...props} />
    </React.Suspense>
);
