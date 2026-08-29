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
});
