import { useCallback, useEffect, useRef, useState } from "react";

import { reportPremiumAdviceView } from "../../api/premium_client";

export const observePremiumAdviceView = (
    element: Element,
    send: (signal: AbortSignal) => Promise<void>,
    ownerDocument = element.ownerDocument,
): (() => void) => {
    const controller = new AbortController();
    let intersecting = false;
    let pending = false;
    let recorded = false;
    let attempts = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const report = () => {
        if (
            !intersecting ||
            ownerDocument.visibilityState !== "visible" ||
            pending ||
            recorded ||
            controller.signal.aborted ||
            attempts >= 3
        )
            return;
        pending = true;
        attempts++;
        void send(controller.signal)
            .then(() => {
                recorded = true;
            })
            .catch(() => {
                if (!controller.signal.aborted && attempts < 3) retry = setTimeout(report, 1500);
            })
            .finally(() => {
                pending = false;
            });
    };
    const Observer = ownerDocument.defaultView?.IntersectionObserver;
    if (!Observer) return () => controller.abort();
    const observer = new Observer((entries) => {
        intersecting = entries.some((entry) => entry.target === element && entry.isIntersecting);
        report();
    });
    observer.observe(element);
    ownerDocument.addEventListener("visibilitychange", report);
    return () => {
        controller.abort();
        clearTimeout(retry);
        observer.disconnect();
        ownerDocument.removeEventListener("visibilitychange", report);
    };
};

export const usePremiumAdviceView = (gameId?: string, adviceId?: string) => {
    const [element, setElement] = useState<HTMLElement | null>(null);
    const recorded = useRef<string | undefined>(undefined);
    const ref = useCallback((next: HTMLElement | null) => setElement(next), []);
    useEffect(() => {
        if (!element || !gameId || !adviceId || recorded.current === `${gameId}:${adviceId}`) return;
        return observePremiumAdviceView(element, async (signal) => {
            await reportPremiumAdviceView(gameId, adviceId, signal);
            if (!signal.aborted) recorded.current = `${gameId}:${adviceId}`;
        });
    }, [element, gameId, adviceId]);
    return ref;
};
