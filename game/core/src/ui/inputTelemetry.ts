import { PlayInputSource } from "../api/play_protocol";

/**
 * Light input telemetry for ranked integrity phase 1: how many pointer presses happened since the previous
 * action this client sent, which kind of input came last, and whether the tab was hidden at send time.
 * Counts only; no positions, no keys. The server stores it as supporting evidence and never acts on it alone.
 */

export interface IInputTelemetry {
    inputSource: number;
    pointerEvents: number;
    tabHidden: boolean;
}

let installed = false;
let pointerPresses = 0;
let lastInputSource: number = PlayInputSource.UNKNOWN;

export const noteInput = (kind: "pointer" | "keyboard"): void => {
    if (kind === "pointer") {
        pointerPresses += 1;
        lastInputSource = PlayInputSource.POINTER;
    } else {
        lastInputSource = PlayInputSource.KEYBOARD;
    }
};

export const installInputTelemetry = (): void => {
    if (installed || typeof window === "undefined") {
        return;
    }
    installed = true;
    const listenerOptions = { capture: true, passive: true };
    window.addEventListener("pointerdown", () => noteInput("pointer"), listenerOptions);
    window.addEventListener("keydown", () => noteInput("keyboard"), listenerOptions);
};

/** Read and reset: each action carries only the presses since the one before it. */
export const takeInputTelemetry = (): IInputTelemetry => {
    const telemetry: IInputTelemetry = {
        inputSource: lastInputSource,
        pointerEvents: pointerPresses,
        tabHidden: typeof document !== "undefined" && document.visibilityState === "hidden",
    };
    pointerPresses = 0;
    return telemetry;
};
