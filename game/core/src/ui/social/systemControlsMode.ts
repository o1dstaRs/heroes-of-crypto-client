/**
 * Whether the compact top-right system-controls medallion belongs on the current screen.
 *
 * SocialDock is mounted above the router, while the sandbox and ranked battle are the components that
 * actually know whether a board is a live fight. They publish that fact here instead of making the dock
 * infer it from a URL or from the unrelated pre-fight music state.
 */

type Listener = () => void;

let active = false;
const listeners = new Set<Listener>();

export const setBattleSystemControlsActive = (next: boolean): void => {
    if (next === active) {
        return;
    }
    active = next;
    for (const listener of listeners) {
        listener();
    }
};

export const getBattleSystemControlsActive = (): boolean => active;

export const getBattleSystemControlsServerSnapshot = (): boolean => false;

export const subscribeBattleSystemControls = (listener: Listener): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};
