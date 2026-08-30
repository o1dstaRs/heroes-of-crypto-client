import { describe, expect, it } from "bun:test";

import { lobbyShoutCooldownLabel } from "./lobbyShout";

describe("lobby shout cooldown label", () => {
    it("rounds up so the button never promises an early retry", () => {
        expect(lobbyShoutCooldownLabel(60_001, 1)).toBe("1m");
        expect(lobbyShoutCooldownLabel(61_001, 1)).toBe("2m");
    });

    it("uses compact hour and minute labels", () => {
        expect(lobbyShoutCooldownLabel(3_600_000, 0)).toBe("1h");
        expect(lobbyShoutCooldownLabel(5_400_000, 0)).toBe("1h 30m");
        expect(lobbyShoutCooldownLabel(0, 0)).toBe("");
    });
});
