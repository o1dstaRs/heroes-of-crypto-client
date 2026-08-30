/**
 * Whether the compact top-right system-controls medallion belongs on the current screen.
 *
 * SocialDock is mounted above the router, while the sandbox and ranked battle are the components that
 * actually know whether a board is a live fight. They publish that fact here instead of making the dock
 * infer it from a URL or from the unrelated pre-fight music state.
 */

type Listener = () => void;

/**
 * Ranked battle controls open in one clean row to the left of the master medallion. These offsets are
 * deliberately spaced by the 34px child diameter plus an 8px gap; keeping them outside the component
 * makes the no-overlap geometry testable without mounting the full authenticated social stack.
 */
export const SYSTEM_MENU_ITEM_OFFSETS = Object.freeze({
    predictions: Object.freeze({ x: -138, y: 2 }),
    friends: Object.freeze({ x: -96, y: 2 }),
    notifications: Object.freeze({ x: -54, y: 2 }),
});

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

/** The master hint must disappear as soon as its fan opens, while child-button hints remain visible. */
export const shouldShowSystemMenuLabel = (menuOpen: boolean, label: string | undefined): boolean =>
    !!label && (!menuOpen || label !== "System controls");
