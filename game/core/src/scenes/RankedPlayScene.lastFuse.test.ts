import { describe, expect, test } from "bun:test";
import type { GameEvent } from "@heroesofcrypto/common/src/engine/events";
import type { AuthoritativeGameSnapshot, AuthoritativeJournalEntry } from "../game_action_transport";
import { RankedPlayScene } from "./RankedPlayScene";

type Blast = Extract<GameEvent, { type: "pyre_exploded" }>;
type Scene = {
    pyreVfxGameId: string;
    pyreVfxSequence: number;
    renderNewlyAppliedPyre(snapshot: AuthoritativeGameSnapshot, replaying?: boolean): void;
    renderPyreExplosion(event: Blast, delay: number): void;
};
const blast = (unitId: string): Blast => ({ type: "pyre_exploded", unitId, position: { x: 10, y: 20 }, hits: [] });
const entry = (sequence: number, events: GameEvent[]): AuthoritativeJournalEntry => ({
    sequence,
    eventsJson: JSON.stringify(events),
    actionId: String(sequence),
    playerId: "player",
    team: 1,
    actionType: 0,
    actionJson: "{}",
    acceptedAtMs: 0,
});
const snapshot = (latestSequence: number, journalTail: AuthoritativeJournalEntry[] = [], gameId = "fight") =>
    ({ gameId, latestSequence, journalTail }) as AuthoritativeGameSnapshot;
const fixture = () => {
    const calls: { event: Blast; delay: number }[] = [];
    const scene = Object.assign(Object.create(RankedPlayScene.prototype) as Scene, {
        pyreVfxGameId: "",
        pyreVfxSequence: -1,
        unitsHolder: { getAllUnits: () => new Map() },
        dyingVisualUnits: new Set(),
        renderPyreExplosion: (event: Blast, delay: number) => calls.push({ event, delay }),
    });
    return { scene, calls };
};

describe("Last Fuse journal playback", () => {
    test("an empty initial journal still allows the first live explosion", () => {
        const { scene, calls } = fixture();
        scene.renderNewlyAppliedPyre(snapshot(0));
        scene.renderNewlyAppliedPyre(snapshot(1, [entry(1, [blast("first")])]));
        expect(calls).toEqual([{ event: blast("first"), delay: 0 }]);
    });
    test("reconnect baselines history, then renders each new chained blast once in sequence order", () => {
        const { scene, calls } = fixture();
        scene.renderNewlyAppliedPyre(snapshot(5, [entry(5, [blast("old")])]));
        expect(calls).toEqual([]);
        const update = snapshot(7, [entry(7, [blast("chain")]), entry(5, [blast("old")]), entry(6, [blast("new")])]);
        scene.renderNewlyAppliedPyre(update);
        scene.renderNewlyAppliedPyre(update);
        scene.renderNewlyAppliedPyre(snapshot(6, [entry(6, [blast("new")])]));
        expect(calls).toEqual([
            { event: blast("new"), delay: 0 },
            { event: blast("chain"), delay: 0.18 },
        ]);
    });
    test("a different fight baselines its own journal without replaying the previous fight", () => {
        const { scene, calls } = fixture();
        scene.renderNewlyAppliedPyre(snapshot(10));
        scene.renderNewlyAppliedPyre(snapshot(1, [entry(1, [blast("history")])], "other"));
        scene.renderNewlyAppliedPyre(snapshot(2, [entry(2, [blast("live")])], "other"));
        expect(calls.map(({ event }) => event.unitId)).toEqual(["live"]);
    });
    test("the first replay action can explode without playing earlier journal history", () => {
        const { scene, calls } = fixture();
        scene.renderNewlyAppliedPyre(snapshot(5, [entry(3, [blast("old")]), entry(5, [blast("first replay")])]), true);
        expect(calls).toEqual([{ event: blast("first replay"), delay: 0 }]);
    });
});
