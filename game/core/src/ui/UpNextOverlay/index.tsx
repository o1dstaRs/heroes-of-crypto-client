import React, { Suspense } from "react";

import type { IExitStanding } from "../exitRules/exitRulesModel";

const UpNextOverlayRuntime = React.lazy(() =>
    import("./UpNextOverlayRuntime").then(({ UpNextOverlay }) => ({ default: UpNextOverlay })),
);

export const UpNextOverlay: React.FC<{ exitStanding?: IExitStanding }> = ({ exitStanding }) => (
    <Suspense fallback={null}>
        <UpNextOverlayRuntime exitStanding={exitStanding} />
    </Suspense>
);
