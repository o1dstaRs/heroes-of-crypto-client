/**
 * Footer mount point for the fight's social controls.
 *
 * SocialDock stays above the router so conversations survive route changes, while RightSideBar owns the
 * physical footer the three launch buttons belong to. The sidebar publishes that element here during a
 * fight and SocialDock portals only the buttons into it; the panels themselves remain top-level overlays.
 */

let slot: HTMLElement | null = null;
const listeners = new Set<() => void>();

export const setSocialDockSlot = (element: HTMLElement | null): void => {
    if (slot === element) {
        return;
    }
    slot = element;
    for (const listener of listeners) {
        listener();
    }
};

export const subscribeSocialDockSlot = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

export const getSocialDockSlot = (): HTMLElement | null => slot;

export const getSocialDockSlotServerSnapshot = (): HTMLElement | null => null;
