import { afterEach, describe, expect, test } from "bun:test";

import { getVolumeSlot, registerVolumeSlot, subscribeVolumeSlot, VOLUME_SLOT_PRIORITY } from "./volumeSlot";

const releases: (() => void)[] = [];

const host = (name: string): HTMLElement => ({ dataset: { name } }) as unknown as HTMLElement;

const claim = (element: HTMLElement, priority: number): (() => void) => {
    const release = registerVolumeSlot(element, priority);
    releases.push(release);
    return release;
};

afterEach(() => {
    while (releases.length) {
        releases.pop()?.();
    }
});

describe("volume slot ownership", () => {
    test("no host means no slot, so the control uses its floating fallback", () => {
        expect(getVolumeSlot()).toBeNull();
    });

    test("the sidebar footer outranks the social dock however they are ordered", () => {
        const dock = host("dock");
        const footer = host("footer");
        claim(dock, VOLUME_SLOT_PRIORITY.socialDock);
        claim(footer, VOLUME_SLOT_PRIORITY.sidebarFooter);
        expect(getVolumeSlot()).toBe(footer);

        while (releases.length) {
            releases.pop()?.();
        }

        claim(footer, VOLUME_SLOT_PRIORITY.sidebarFooter);
        claim(dock, VOLUME_SLOT_PRIORITY.socialDock);
        expect(getVolumeSlot()).toBe(footer);
    });

    /**
     * The bug this module was rewritten for: the sidebar's cleanup used to clear the slot outright, so a
     * sidebar remount dropped a slot the dock still owned and the speaker fell back onto the dock's row.
     */
    test("releasing one host never clears another's slot", () => {
        const dock = host("dock");
        const footer = host("footer");
        claim(dock, VOLUME_SLOT_PRIORITY.socialDock);
        const releaseFooter = claim(footer, VOLUME_SLOT_PRIORITY.sidebarFooter);

        releaseFooter();

        expect(getVolumeSlot()).toBe(dock);
    });

    test("a lower-priority host leaving does not disturb the current slot", () => {
        const dock = host("dock");
        const footer = host("footer");
        const releaseDock = claim(dock, VOLUME_SLOT_PRIORITY.socialDock);
        claim(footer, VOLUME_SLOT_PRIORITY.sidebarFooter);

        releaseDock();

        expect(getVolumeSlot()).toBe(footer);
    });

    test("the slot only falls back to null once every host is gone", () => {
        const dock = host("dock");
        const releaseDock = claim(dock, VOLUME_SLOT_PRIORITY.socialDock);
        expect(getVolumeSlot()).toBe(dock);
        releaseDock();
        expect(getVolumeSlot()).toBeNull();
    });

    test("re-registering the same priority keeps the control where it is", () => {
        const first = host("first");
        const second = host("second");
        claim(first, VOLUME_SLOT_PRIORITY.socialDock);
        claim(second, VOLUME_SLOT_PRIORITY.socialDock);
        expect(getVolumeSlot()).toBe(first);
    });

    test("subscribers are notified only when the slot actually changes", () => {
        let notifications = 0;
        const unsubscribe = subscribeVolumeSlot(() => {
            notifications += 1;
        });

        const footer = host("footer");
        claim(footer, VOLUME_SLOT_PRIORITY.sidebarFooter);
        expect(notifications).toBe(1);

        // A lower-priority host arriving does not move the control, so nothing should re-render.
        claim(host("dock"), VOLUME_SLOT_PRIORITY.socialDock);
        expect(notifications).toBe(1);

        unsubscribe();
    });

    test("a null element registers nothing and leaves the slot alone", () => {
        const footer = host("footer");
        claim(footer, VOLUME_SLOT_PRIORITY.sidebarFooter);
        const release = registerVolumeSlot(null, VOLUME_SLOT_PRIORITY.socialDock);
        expect(getVolumeSlot()).toBe(footer);
        release();
        expect(getVolumeSlot()).toBe(footer);
    });

    // The pick screen has both hosts on it at once. The dock's own row keeps a place for the speaker in
    // line with the buttons beside it (bottom 12 / right 10); the draft row sits on a different line
    // (1rem), so when it won this slot the speaker floated 4px above its neighbours with the dock's
    // reserved place left as a hole next to the bell (owner report 2026-09-19).
    test("the dock's own row keeps the speaker it reserves a place for, even against the draft row", () => {
        const dockRow = host("dock-row");
        const releaseDraft = claim(host("draft"), VOLUME_SLOT_PRIORITY.draftControls);
        const releaseDock = claim(dockRow, VOLUME_SLOT_PRIORITY.socialDockRow);
        expect(getVolumeSlot()).toBe(dockRow);

        // Order must not decide it.
        releaseDock();
        releaseDraft();
        const dockRow2 = host("dock-row-2");
        claim(dockRow2, VOLUME_SLOT_PRIORITY.socialDockRow);
        claim(host("draft-2"), VOLUME_SLOT_PRIORITY.draftControls);
        expect(getVolumeSlot()).toBe(dockRow2);
    });

    // In a fight the dock rides inside the game row or hands the corner to the medallion, and the game
    // row is the right host there — that pairing must keep working exactly as it did.
    test("a fight dock still yields to the game row", () => {
        const gameRow = host("game-row");
        claim(host("fight-dock"), VOLUME_SLOT_PRIORITY.socialDock);
        claim(gameRow, VOLUME_SLOT_PRIORITY.gameControls);
        expect(getVolumeSlot()).toBe(gameRow);
    });
});
