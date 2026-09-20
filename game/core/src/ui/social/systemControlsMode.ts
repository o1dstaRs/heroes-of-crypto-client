/**
 * Whether the compact top-right system-controls medallion belongs on the current screen.
 *
 * SocialDock is mounted above the router, while the sandbox and ranked battle are the components that
 * actually know whether a board is a live fight. They publish that fact here instead of making the dock
 * infer it from a URL or from the unrelated pre-fight music state.
 */

type Listener = () => void;

/**
 * The dock is one of the bottom-right corner controls, so it is built from their measurements: the same
 * square as the sound and fullscreen medallions, on the same gap. GameSystemControls owns those two
 * numbers; they are restated here rather than imported so this module (and its geometry test) stays free
 * of React, and the pair is pinned against the originals in systemControlsMode.test.ts.
 */
export const SYSTEM_DOCK_BUTTON_SIZE_PX = 32;
export const SYSTEM_DOCK_GAP_PX = 5.28;
/**
 * The dock artwork is authored with ~13% transparent margin around its forged ring, while the bronze
 * sound and fullscreen medallions beside it use ~2%. Drawn at `contain` in the same 32px box the dock
 * therefore READS about a tenth smaller than its neighbours. Painting the background at this size makes
 * the visible ring the same diameter as theirs; everything cropped at the box edge is that transparent
 * margin, and the box — hit target, gaps, fan offsets — is untouched.
 */
export const SYSTEM_DOCK_ARTWORK_BACKGROUND_SIZE = "112%";

/**
 * How far the medallion grows while it is hovered or its fan is open. It is the control the cursor is
 * actually on, so it lifts clearly above the row instead of nudging; the growth is drawn outside the
 * 32px box and stays well inside the gap to the sound button, so nothing in the row moves.
 */
export const SYSTEM_DOCK_HOVER_SCALE = 1.15;
/** Pressed: still lifted, just visibly pushed back down. */
export const SYSTEM_DOCK_PRESSED_SCALE = 1.11;

/** Centre-to-centre distance between two neighbouring controls of the opened row. */
export const SYSTEM_DOCK_STEP_PX = SYSTEM_DOCK_BUTTON_SIZE_PX + SYSTEM_DOCK_GAP_PX;

/**
 * The medallion sits on the fullscreen button's own line, one gap to its left, so the fan opens leftwards
 * (negative X) and stays on that line (y: 0). The three children land on consecutive steps, which makes
 * the open dock read as one row of four identical controls running into the fullscreen button. Keeping
 * the offsets out of the component makes the no-overlap geometry testable without mounting the full
 * authenticated social stack.
 */
export const SYSTEM_MENU_ITEM_OFFSETS = Object.freeze({
    predictions: Object.freeze({ x: -3 * SYSTEM_DOCK_STEP_PX, y: 0 }),
    friends: Object.freeze({ x: -2 * SYSTEM_DOCK_STEP_PX, y: 0 }),
    notifications: Object.freeze({ x: -SYSTEM_DOCK_STEP_PX, y: 0 }),
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
