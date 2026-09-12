/**
 * Where the volume control should render.
 *
 * The <audio> element and everything that drives it live at the app root, above the router, so the theme
 * survives walking between screens — but the CONTROL belongs in the game system row next to fullscreen and
 * exit, which is mounted far below that and only on some routes. A context cannot cross that gap in this
 * direction, so the row publishes its slot here and ThemeMusic portals the control into it.
 *
 * No slot published means neither host is on screen, and the control falls back to the fixed bottom-right
 * corner (see ThemeMusic).
 *
 * Hosts REGISTER rather than assign. Two of them can be mounted at once — the game row and the
 * social dock — and a single last-writer-wins setter made the winner depend on effect order: the sidebar's
 * cleanup cleared the slot unconditionally, so a sidebar remount wiped a slot the social dock still owned.
 * The control then fell back to the fixed bottom-right corner, which is exactly where the dock's own button
 * row sits, and the speaker landed on top of the notifications bell (owner report 2026-08-29). Registering
 * with a priority makes the choice deterministic and makes release safe: dropping one host reverts to the
 * next one still mounted instead of to the colliding fallback.
 */

/** Higher wins. A full-screen draft must outrank the game row that remains mounted behind its modal. */
export const VOLUME_SLOT_PRIORITY = {
    socialDock: 1,
    gameControls: 2,
    /** Compatibility alias for existing callers/tests written before the footer became viewport-wide. */
    sidebarFooter: 2,
    draftControls: 3,
} as const;

interface IVolumeSlotRegistration {
    element: HTMLElement;
    priority: number;
}

let registrations: IVolumeSlotRegistration[] = [];
let slot: HTMLElement | null = null;
const listeners = new Set<() => void>();

const recomputeSlot = (): void => {
    let winner: IVolumeSlotRegistration | null = null;
    for (const registration of registrations) {
        // `>` not `>=`: ties keep the earliest registration, so a re-render that re-registers an equal
        // priority cannot make the control hop between two hosts.
        if (winner === null || registration.priority > winner.priority) {
            winner = registration;
        }
    }
    const next = winner?.element ?? null;
    if (slot === next) {
        return;
    }
    slot = next;
    for (const listener of listeners) {
        listener();
    }
};

/**
 * Offer an element as the volume control's host. Returns the release function; calling it removes only
 * THIS registration, so a host can never clear another's slot.
 */
export const registerVolumeSlot = (element: HTMLElement | null, priority: number): (() => void) => {
    if (!element) {
        return () => {};
    }
    const registration: IVolumeSlotRegistration = { element, priority };
    registrations = [...registrations, registration];
    recomputeSlot();

    return () => {
        registrations = registrations.filter((candidate) => candidate !== registration);
        recomputeSlot();
    };
};

let releaseLegacyVolumeSlot: () => void = () => {};

/** Compatibility setter for the preserved game-controls host. */
export const setVolumeSlot = (element: HTMLElement | null): void => {
    releaseLegacyVolumeSlot();
    releaseLegacyVolumeSlot = element ? registerVolumeSlot(element, VOLUME_SLOT_PRIORITY.gameControls) : () => {};
};

export const subscribeVolumeSlot = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

export const getVolumeSlot = (): HTMLElement | null => slot;

/** Server-side / first-pass snapshot: there is never a slot before a host has mounted. */
export const getVolumeSlotServerSnapshot = (): HTMLElement | null => null;
