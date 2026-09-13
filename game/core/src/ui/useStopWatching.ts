import { useCallback } from "react";
// react-router, NOT react-router-dom: the app mounts its Router from the former.
import { useLocation, useNavigate } from "react-router";

import { siteUrl } from "../api/site_origin";
import { openFriendsPanel } from "./social/openFriendsEvent";
import { spectatorExitFor, type SpectatorOrigin } from "./spectatorExit";

/** Leave a spectated match the way the viewer came in — see spectatorExitFor. */
export const useStopWatching = (): (() => void) => {
    const navigate = useNavigate();
    const location = useLocation();
    return useCallback(() => {
        const exit = spectatorExitFor((location.state ?? null) as SpectatorOrigin | null);
        if (exit.kind === "site") {
            // Relative on single-host rigs (staging), the apex on production — never production from a test box.
            window.location.assign(siteUrl(exit.path));
            return;
        }
        navigate(exit.path);
        if (exit.openFriends) {
            openFriendsPanel();
        }
    }, [location.state, navigate]);
};
