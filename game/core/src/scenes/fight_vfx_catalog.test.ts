import { describe, expect, it } from "bun:test";

import { FIGHT_EVENT_VFX } from "./fight_vfx_catalog";

describe("FIGHT_EVENT_VFX catalog", () => {
    // The `Record<GameEvent["type"], ...>` type already forces every event type to be classified at COMPILE
    // time — a new GameEvent type won't build until it has an entry here, which is the whole point (so an
    // animation can't ship wired in Sandbox but forgotten in ranked). These runtime checks keep the entries
    // internally consistent so the catalog stays trustworthy as the routing source of truth.
    it("marks an event as rendered iff it has a live ranked VFX path", () => {
        for (const [type, entry] of Object.entries(FIGHT_EVENT_VFX)) {
            expect(entry.rendered, `${type}: rendered=${entry.rendered} but ranked=${entry.ranked}`).toBe(
                entry.ranked !== "none",
            );
        }
    });

    it("gives every entry a non-empty note", () => {
        for (const [type, entry] of Object.entries(FIGHT_EVENT_VFX)) {
            expect(entry.note.trim().length, `${type} has an empty note`).toBeGreaterThan(0);
        }
    });
});
