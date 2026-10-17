/** Shared bottom-right HUD mode, owned by the mounted game footers across route transitions. */

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
 * The dock artwork's bronze ring fills about 86% of its canvas. The sound and fullscreen medallions
 * fill about 92% of theirs, so `contain` in the same 32px box leaves this ring short of them. Both
 * axes are set (a single percentage is width plus `auto` height, which keeps the contained size in
 * Safari). 116% brings the ring out to the 32px box. The cropped edge is the transparent margin
 * around the ring. The box — hit target, gaps, fan offsets — is untouched.
 */
export const SYSTEM_DOCK_ARTWORK_BACKGROUND_SIZE = "116% 116%";

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
const owners = new Set<symbol>();
const listeners = new Set<Listener>();

/** Each mounted footer owns its registration; a retiring screen cannot clear the next screen's HUD. */
export const registerBattleSystemControls = (): (() => void) => {
    const owner = Symbol("game controls");
    const publish = () => {
        const next = owners.size > 0;
        if (active === next) return;
        active = next;
        for (const listener of listeners) listener();
    };
    owners.add(owner);
    publish();
    return () => {
        owners.delete(owner);
        publish();
    };
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

new Set<symbol>();
