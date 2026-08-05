import { describe, expect, test } from "bun:test";

import { decodePlaySnapshot } from "./play_protocol";
import { toAuthoritativeGameSnapshot } from "./ranked_play_client";

describe("ranked play snapshot conversion", () => {
    test("forwards the split placement sub-stage to the Pixi scene snapshot", () => {
        const snapshot = decodePlaySnapshot(new Uint8Array());
        snapshot.placementSplit = true;
        snapshot.placementStage = 0;
        snapshot.hideOpponentRosterDuringSetup = true;

        const authoritative = toAuthoritativeGameSnapshot(snapshot);

        expect(authoritative.placementSplit).toBe(true);
        expect(authoritative.placementStage).toBe(0);
        expect(authoritative.hideOpponentRosterDuringSetup).toBe(true);

        snapshot.placementStage = 1;
        expect(toAuthoritativeGameSnapshot(snapshot).placementStage).toBe(1);

        snapshot.hideOpponentRosterDuringSetup = false;
        expect(toAuthoritativeGameSnapshot(snapshot).hideOpponentRosterDuringSetup).toBe(false);
    });
});
