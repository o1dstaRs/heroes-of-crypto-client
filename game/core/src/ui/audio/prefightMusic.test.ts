import { describe, expect, it } from "bun:test";

import {
    boardViewPrefightMusic,
    draftRoutePrefightMusic,
    isPrefightMusicActive,
    setPrefightMusicActive,
    subscribePrefightMusic,
} from "./prefightMusic";

// Two screens drive this flag from different places — the route (match check, picks, augments) and
// RankedGameView (placement) — and both fire it from effects that re-run on every snapshot. So the contract
// that matters is: repeated identical writes are silent, and a late subscriber still learns the state.
describe("pre-fight music flag", () => {
    it("notifies on change only, and never on a repeat of the same value", () => {
        setPrefightMusicActive(false);
        const seen: boolean[] = [];
        const unsubscribe = subscribePrefightMusic((active) => seen.push(active));

        // Subscribing reports the current value immediately, so a listener attached mid-draft is correct.
        expect(seen).toEqual([false]);

        setPrefightMusicActive(true);
        setPrefightMusicActive(true); // repeat: a re-render must not restart the track
        setPrefightMusicActive(true);
        expect(seen).toEqual([false, true]);

        setPrefightMusicActive(false);
        expect(seen).toEqual([false, true, false]);

        unsubscribe();
        setPrefightMusicActive(true);
        expect(seen).toEqual([false, true, false]);
        setPrefightMusicActive(false);
    });

    it("reads back the live value, which is what the ended-handler checks to decide whether to loop", () => {
        setPrefightMusicActive(false);
        expect(isPrefightMusicActive()).toBe(false);
        setPrefightMusicActive(true);
        expect(isPrefightMusicActive()).toBe(true);
        setPrefightMusicActive(false);
        expect(isPrefightMusicActive()).toBe(false);
    });

    it("keeps every subscriber in step", () => {
        setPrefightMusicActive(false);
        const a: boolean[] = [];
        const b: boolean[] = [];
        const offA = subscribePrefightMusic((v) => a.push(v));
        const offB = subscribePrefightMusic((v) => b.push(v));
        setPrefightMusicActive(true);
        expect(a).toEqual([false, true]);
        expect(b).toEqual([false, true]);
        offA();
        offB();
        setPrefightMusicActive(false);
    });
});

describe("who drives the pre-fight track through a ranked match", () => {
    const apply = (next: boolean | undefined) => {
        if (next !== undefined) {
            setPrefightMusicActive(next);
        }
    };

    it("plays once from the match check through the handoff into placement, and stops for the fight", () => {
        setPrefightMusicActive(false);
        const seen: boolean[] = [];
        const off = subscribePrefightMusic((active) => seen.push(active));

        apply(draftRoutePrefightMusic({ gameId: "g", showOverlay: false, routeMode: "checking" }));
        apply(draftRoutePrefightMusic({ gameId: "g", showOverlay: false, routeMode: "pick" }));
        // The handoff, in React's effect order: the board view mounts without a snapshot, then the route enters
        // play. Neither may switch the track off, or the menu playlist cuts in and the track restarts from the top.
        apply(boardViewPrefightMusic({ replayOnly: false, hasSnapshot: false, gameStarted: false }));
        apply(draftRoutePrefightMusic({ gameId: "g", showOverlay: false, routeMode: "play" }));
        apply(boardViewPrefightMusic({ replayOnly: false, hasSnapshot: true, gameStarted: false }));
        expect(seen).toEqual([false, true]);

        apply(boardViewPrefightMusic({ replayOnly: false, hasSnapshot: true, gameStarted: true }));
        expect(seen).toEqual([false, true, false]);
        off();
    });

    it("stays silent without a game, behind the error overlay, and for a replay", () => {
        expect(draftRoutePrefightMusic({ gameId: undefined, showOverlay: false, routeMode: "pick" })).toBe(false);
        expect(draftRoutePrefightMusic({ gameId: "g", showOverlay: true, routeMode: "pick" })).toBe(false);
        expect(draftRoutePrefightMusic({ gameId: "g", showOverlay: true, routeMode: "play" })).toBe(false);
        expect(boardViewPrefightMusic({ replayOnly: true, hasSnapshot: false, gameStarted: false })).toBe(false);
        expect(boardViewPrefightMusic({ replayOnly: true, hasSnapshot: true, gameStarted: false })).toBe(false);
    });
});
