import { describe, expect, test } from "bun:test";

import { PlayPhase } from "../api/play_protocol";
import { yourTurnActivationKey } from "./turnAlert";

const base = { gameId: "g", phase: PlayPhase.PLAY, currentTurnTeam: 2, currentUnitId: "u1", currentTurnStartMs: 100 };

describe("yourTurnActivationKey", () => {
    test("keys one activation of the viewer's unit and is empty otherwise", () => {
        expect(yourTurnActivationKey(base, 2)).toBe("g:u1:100");
        expect(yourTurnActivationKey(base, 1)).toBe("");
        expect(yourTurnActivationKey({ ...base, phase: PlayPhase.PLACEMENT }, 2)).toBe("");
        expect(yourTurnActivationKey({ ...base, currentUnitId: "" }, 2)).toBe("");
    });

    test("changes when the same unit gets a new turn, and stays put across repeated snapshots", () => {
        expect(yourTurnActivationKey({ ...base, currentTurnStartMs: 200 }, 2)).not.toBe(yourTurnActivationKey(base, 2));
        expect(yourTurnActivationKey({ ...base }, 2)).toBe(yourTurnActivationKey(base, 2));
    });
});
