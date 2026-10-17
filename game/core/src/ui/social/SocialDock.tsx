import React, { Suspense } from "react";

import { useAuthContext } from "../auth/context/auth_context";
import {
    getBattleSystemControlsActive,
    getBattleSystemControlsServerSnapshot,
    subscribeBattleSystemControls,
} from "./systemControlsMode";

const SocialDockRuntime = React.lazy(() =>
    import("./SocialDockRuntime").then(({ SocialDock }) => ({ default: SocialDock })),
);

export const SocialDock: React.FC = () => {
    const { authenticated, user } = useAuthContext();
    const systemMenuMode = React.useSyncExternalStore(
        subscribeBattleSystemControls,
        getBattleSystemControlsActive,
        getBattleSystemControlsServerSnapshot,
    );
    if ((!authenticated || user?.is_active === false) && !systemMenuMode) {
        return null;
    }

    return (
        <Suspense fallback={null}>
            <SocialDockRuntime />
        </Suspense>
    );
};
