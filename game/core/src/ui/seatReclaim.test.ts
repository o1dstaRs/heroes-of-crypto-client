import { describe, expect, it } from "bun:test";

import { SEAT_RECLAIM_ATTEMPTS, SEAT_RECLAIM_INTERVAL_MS, seatReclaimDecision } from "./seatReclaim";

const GAME = "5f2f4c8e-0f2a-4d1f-9f3a-8b2c1d0e4a77";

describe("reclaiming a seat lost to a blip", () => {
    it("seats the viewer when the server calls this match theirs", () => {
        expect(seatReclaimDecision({ id: GAME, team: 1 }, GAME)).toBe("seat");
        expect(seatReclaimDecision({ id: GAME, team: 2, abandoned: false }, GAME)).toBe("seat");
    });

    /** A spectator's own lookup answers with another match, or with nothing — they keep watching. */
    it("never seats a viewer the server does not place in this match", () => {
        expect(seatReclaimDecision({ id: "another-match", team: 1 }, GAME)).toBe("keep-watching");
        expect(seatReclaimDecision(undefined, GAME)).toBe("keep-watching");
        expect(seatReclaimDecision(null, GAME)).toBe("keep-watching");
        expect(seatReclaimDecision({}, GAME)).toBe("keep-watching");
    });

    it("does not hand back a seat in a match that has been abandoned", () => {
        expect(seatReclaimDecision({ id: GAME, team: 1, abandoned: true }, GAME)).toBe("keep-watching");
    });

    it("has nothing to reclaim without a match to reclaim it in", () => {
        expect(seatReclaimDecision({ id: "", team: 1 }, "")).toBe("keep-watching");
    });

    /** Long enough to outlast a reconnect, short enough that a spectator stops being asked about. */
    it("gives up after a bounded window", () => {
        expect(SEAT_RECLAIM_INTERVAL_MS).toBeGreaterThanOrEqual(1000);
        expect(SEAT_RECLAIM_ATTEMPTS * SEAT_RECLAIM_INTERVAL_MS).toBeGreaterThanOrEqual(10_000);
        expect(SEAT_RECLAIM_ATTEMPTS * SEAT_RECLAIM_INTERVAL_MS).toBeLessThanOrEqual(30_000);
    });
});
