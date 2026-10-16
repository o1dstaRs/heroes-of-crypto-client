import React, { Suspense } from "react";

import { useAuthContext } from "../auth/context/auth_context";
import { isMockPortalEnabled } from "../PlayerPortal/mockPortal";

const SocialDockRuntime = React.lazy(() =>
    import("./SocialDockRuntime").then(({ SocialDock }) => ({ default: SocialDock })),
);

export const SocialDock: React.FC = () => {
    const { authenticated, user } = useAuthContext();
    if ((!authenticated || user?.is_active === false) && !isMockPortalEnabled()) {
        return null;
    }

    return (
        <Suspense fallback={null}>
            <SocialDockRuntime />
        </Suspense>
    );
};
