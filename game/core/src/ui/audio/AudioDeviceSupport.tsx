import React, { useLayoutEffect, useRef } from "react";

import { getGameAudioContext } from "./combatSounds";
import { supportMediaVolume } from "./mediaVolume";

export const listenForAudioActivation = (target: EventTarget, activate: () => void): (() => void) => {
    // Capture runs before the canvas stops propagation. Keep the listeners after initial success so
    // a Safari interruption can recover from the next tap, including a tap on fullscreen or sound.
    const events = ["pointerup", "touchend", "click", "keydown"];
    for (const event of events) target.addEventListener(event, activate, { capture: true, passive: true });
    return () => {
        for (const event of events) target.removeEventListener(event, activate, true);
    };
};

/** Adapt the existing media elements without remounting or replacing the shared music player. */
export const AudioDeviceSupport: React.FC<React.PropsWithChildren> = ({ children }) => {
    const root = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const releases = new Map<HTMLMediaElement, () => void>();
        const attach = () => {
            for (const [media, release] of releases) {
                if (!root.current?.contains(media)) {
                    release();
                    releases.delete(media);
                }
            }
            root.current?.querySelectorAll("audio").forEach((media) => {
                if (!releases.has(media)) releases.set(media, supportMediaVolume(media));
            });
        };
        attach();
        const observer = new MutationObserver(attach);
        if (root.current) observer.observe(root.current, { childList: true, subtree: true });
        const activate = () => {
            getGameAudioContext();
        };
        const stopActivation = listenForAudioActivation(window, activate);
        const onVisibility = () => {
            if (!document.hidden) activate();
        };
        document.addEventListener("visibilitychange", onVisibility);
        window.addEventListener("pageshow", activate);
        return () => {
            observer.disconnect();
            stopActivation();
            document.removeEventListener("visibilitychange", onVisibility);
            window.removeEventListener("pageshow", activate);
            releases.forEach((release) => release());
        };
    }, []);
    return (
        <div ref={root} style={{ display: "contents" }}>
            {children}
        </div>
    );
};
