import React, { Suspense } from "react";

import type { IExitStanding } from "../exitRules/exitRulesModel";

const UpNextOverlayRuntime = React.lazy(() =>
    import("./UpNextOverlayRuntime").then(({ UpNextOverlay }) => ({ default: UpNextOverlay })),
);

export const UpNextOverlay: React.FC<{ exitStanding?: IExitStanding }> = ({ exitStanding }) => (
    <Suspense fallback={null}>
        <div data-desktop-turn-overlay style={{ display: "contents" }}>
            <UpNextOverlayRuntime exitStanding={exitStanding} />
        </div>
    </Suspense>
);
