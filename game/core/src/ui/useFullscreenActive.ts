import { useEffect, useState } from "react";

import { isFullscreenPresentationActive, onFullscreenChange, syncFullscreenPresentationAttribute } from "./fullscreen";

/** React state backed by the browser's actual fullscreen element, including vendor-prefixed events. */
export const useFullscreenActive = (): boolean => {
    const [active, setActive] = useState(isFullscreenPresentationActive);

    useEffect(() => {
        const sync = () => setActive(syncFullscreenPresentationAttribute());
        sync();
        const unsubscribeFullscreen = onFullscreenChange(sync);
        window.addEventListener("resize", sync);
        return () => {
            unsubscribeFullscreen();
            window.removeEventListener("resize", sync);
        };
    }, []);

    return active;
};
