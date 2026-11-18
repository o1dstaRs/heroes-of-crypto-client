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

describe("transient terrain forwarding", () => {
    test("forwards the snapshot's smoke / vine / fire-wall cells and their count untouched", () => {
        const snapshot = decodePlaySnapshot(new Uint8Array());
        snapshot.transientCells = [{ kind: 1, x: 5, y: 5, lapsRemaining: 4, team: 0 }];
        snapshot.transientCellsCount = 1;

        const authoritative = toAuthoritativeGameSnapshot(snapshot);

        expect(authoritative.transientCells).toEqual([{ kind: 1, x: 5, y: 5, lapsRemaining: 4, team: 0 }]);
        expect(authoritative.transientCellsCount).toBe(1);
        expect(toAuthoritativeGameSnapshot(decodePlaySnapshot(new Uint8Array())).transientCellsCount).toBeUndefined();
    });
});

describe("co-op sandbox snapshot flags", () => {
    test("stay absent for ranked and mark both-ready only when every seat is in the ready list", () => {
        const base = decodePlaySnapshot(new Uint8Array());
        expect(toAuthoritativeGameSnapshot(base).sandboxCoop).toBeUndefined();

        const seats = [
            { playerId: "h", team: 2, connected: true, aiControlled: false, lastSeenMs: 0 },
            { playerId: "g", team: 1, connected: true, aiControlled: false, lastSeenMs: 0 },
        ];
        const oneReady = toAuthoritativeGameSnapshot(
            { ...base, players: seats, readyPlayerIds: ["h"] },
            2,
            undefined,
            true,
        );
        expect(oneReady.sandboxCoop).toBe(true);
        expect(oneReady.sandboxCoopBothReady).toBe(false);
        expect(oneReady.viewerPlacementReady).toBe(true);
        expect(
            toAuthoritativeGameSnapshot({ ...base, players: seats, readyPlayerIds: ["h"] }, 1).viewerPlacementReady,
        ).toBe(false);
        expect(
            toAuthoritativeGameSnapshot({ ...base, players: seats, readyPlayerIds: ["h"] }).viewerPlacementReady,
        ).toBe(false);

        const bothReady = toAuthoritativeGameSnapshot(
            { ...base, players: seats, readyPlayerIds: ["g", "h"] },
            2,
            undefined,
            true,
        );
        expect(bothReady.sandboxCoopBothReady).toBe(true);
        expect(
            toAuthoritativeGameSnapshot({ ...base, players: [], readyPlayerIds: [] }, 2, undefined, true)
                .sandboxCoopBothReady,
        ).toBe(false);
    });
});

test("live and recorded scene conversion retain both doctrines and both artifact tiers, including empty slots", () => {
    const snapshot = decodePlaySnapshot(new Uint8Array());
    Object.assign(snapshot, {
        gameId: "result-setup-routing",
        leftDoctrine: 2,
        rightDoctrine: 3,
        leftArtifactTier1: 0,
        leftArtifactTier2: 5,
        rightArtifactTier1: 4,
        rightArtifactTier2: 0,
    });
    const routed = JSON.parse(JSON.stringify(toAuthoritativeGameSnapshot(snapshot))) as ReturnType<
        typeof toAuthoritativeGameSnapshot
    >;
    expect([routed.leftDoctrine, routed.rightDoctrine]).toEqual([2, 3]);
    expect([
        routed.leftArtifactTier1,
        routed.leftArtifactTier2,
        routed.rightArtifactTier1,
        routed.rightArtifactTier2,
    ]).toEqual([0, 5, 4, 0]);
    // The server can deliberately redact a setup field before combat. Conversion must not fill it
    // from another match, a local default doctrine, or a selection for the next game.
    delete snapshot.rightDoctrine;
    delete snapshot.rightArtifactTier1;
    expect(toAuthoritativeGameSnapshot(snapshot).rightDoctrine).toBeUndefined();
    expect(toAuthoritativeGameSnapshot(snapshot).rightArtifactTier1).toBeUndefined();
});
