/**
 * Where the volume control should render.
 *
 * The <audio> element and everything that drives it live at the app root, above the router, so the theme
 * survives walking between screens — but the CONTROL belongs in the sidebar's footer next to the fullscreen
 * toggle, which is mounted far below that and only on some routes. A context cannot cross that gap in this
 * direction, so the footer publishes its slot here and ThemeMusic portals the control into it.
 *
 * No slot published means no footer on screen, and the control falls back to the fixed bottom-right corner.
 */

let slot: HTMLElement | null = null;
const listeners = new Set<() => void>();

export const setVolumeSlot = (element: HTMLElement | null): void => {
    if (slot === element) {
        return;
    }
    slot = element;
    for (const listener of listeners) {
        listener();
    }
};

export const subscribeVolumeSlot = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

export const getVolumeSlot = (): HTMLElement | null => slot;

/** Server-side / first-pass snapshot: there is never a slot before the footer has mounted. */
export const getVolumeSlotServerSnapshot = (): HTMLElement | null => null;
