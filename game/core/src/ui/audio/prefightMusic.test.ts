import { describe, expect, it } from "bun:test";

import { isPrefightMusicActive, setPrefightMusicActive, subscribePrefightMusic } from "./prefightMusic";

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
