import { useEffect } from "react";

/**
 * While `active`, closing or reloading the tab asks the browser's own "Leave site?" question. Browsers don't let a page
 * change that text, so the explanation lives in the exit dialogs and the Alt meter (plan §5).
 */
export const useLeaveGuard = (active: boolean): void => {
    useEffect(() => {
        if (!active || typeof window === "undefined") {
            return undefined;
        }
        const onBeforeUnload = (event: BeforeUnloadEvent): void => {
            event.preventDefault();
            // Older browsers still need a returnValue to show the prompt.
            event.returnValue = "";
        };
        window.addEventListener("beforeunload", onBeforeUnload);
        return () => window.removeEventListener("beforeunload", onBeforeUnload);
    }, [active]);
};
