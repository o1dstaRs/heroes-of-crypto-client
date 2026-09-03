import type { TeamType } from "@heroesofcrypto/common";
import React, { Suspense } from "react";

const LocalModelDraftOpponentRuntime = React.lazy(() =>
    import("./LocalModelDraftOpponentRuntime").then(({ LocalModelDraftOpponent }) => ({
        default: LocalModelDraftOpponent,
    })),
);

export const LocalModelDraftOpponent: React.FC<{ eventUrl: string; userTeam: TeamType }> = (props) => (
    <Suspense fallback={null}>
        <LocalModelDraftOpponentRuntime {...props} />
    </Suspense>
);
