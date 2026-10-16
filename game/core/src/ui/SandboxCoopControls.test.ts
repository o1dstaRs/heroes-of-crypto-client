import { describe, expect, test } from "bun:test";

import { sandboxCoopSeatStatuses, SANDBOX_UNREADY_REASON } from "./SandboxCoopControls";
import type { SandboxCoopSession } from "../api/sandbox_coop_client";

const session: SandboxCoopSession = {
    gameId: "11111111-0000-4000-8000-000000000001",
    team: 2,
    host: { playerId: "host-id", username: "alice", team: 2, connected: true, ready: false },
    guest: { playerId: "guest-id", username: "bob", team: 1, connected: false, ready: false },
    phase: 1,
    fightStarted: false,
    fightFinished: false,
};

describe("sandboxCoopSeatStatuses", () => {
    test("falls back to the invite's seats before the first snapshot lands", () => {
        const seats = sandboxCoopSeatStatuses(session, null, 2);
        expect(seats.map((seat) => [seat.username, seat.team, seat.isViewer, seat.connected, seat.ready])).toEqual([
            ["alice", 2, true, true, false],
            ["bob", 1, false, false, false],
        ]);
    });

    test("reads connection and readiness live from the snapshot, keyed by player id", () => {
        const seats = sandboxCoopSeatStatuses(
            session,
            {
                players: [
                    { playerId: "guest-id", team: 1, connected: true, aiControlled: false, lastSeenMs: 0 },
                    { playerId: "host-id", team: 2, connected: false, aiControlled: false, lastSeenMs: 0 },
                ],
                readyPlayerIds: ["guest-id"],
            },
            1,
        );
        expect(seats.find((seat) => seat.username === "bob")).toMatchObject({
            isViewer: true,
            connected: true,
            ready: true,
        });
        expect(seats.find((seat) => seat.username === "alice")).toMatchObject({
            isViewer: false,
            connected: false,
            ready: false,
        });
    });

    test("the unready reason mirrors the server's constant", () => {
        expect(SANDBOX_UNREADY_REASON).toBe("unready");
    });
});
