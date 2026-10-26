import { useEffect, useState } from "react";

import {
    isFullscreenActive,
    isFullscreenPresentationActive,
    onFullscreenChange,
    syncFullscreenPresentationAttribute,
} from "./fullscreen";

/** React state backed by the browser's actual fullscreen element, including vendor-prefixed events. */
export const useFullscreenActive = (nativeOnly = false): boolean => {
    const [active, setActive] = useState(nativeOnly ? isFullscreenActive : isFullscreenPresentationActive);

    useEffect(() => {
        const sync = () => {
            const presentation = syncFullscreenPresentationAttribute(nativeOnly);
            setActive(nativeOnly ? isFullscreenActive() : presentation);
        };
        sync();
        const unsubscribeFullscreen = onFullscreenChange(sync);
        window.addEventListener("resize", sync);
        return () => {
            unsubscribeFullscreen();
            window.removeEventListener("resize", sync);
        };
    }, [nativeOnly]);

    return active;
};
