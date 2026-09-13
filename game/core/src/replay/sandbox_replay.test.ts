import { describe, expect, it } from "bun:test";

import { GridVals, type GameAction, type IGameActionResult } from "@heroesofcrypto/common";

import {
    MAX_SAVED_SANDBOX_REPLAYS,
    SandboxReplayRecorder,
    cloneReplayData,
    listSandboxReplays,
    saveSandboxReplay,
    type ReplayStorage,
    type SandboxReplay,
} from "./sandbox_replay";
import type { SandboxSceneState } from "../scenes/Sandbox";

class MemoryStorage implements ReplayStorage {
    private readonly values = new Map<string, string>();
    public getItem(key: string): string | null {
        return this.values.get(key) ?? null;
    }
    public setItem(key: string, value: string): void {
        this.values.set(key, value);
    }
    public removeItem(key: string): void {
        this.values.delete(key);
    }
}

/** A storage that rejects writes above a byte budget, like localStorage under quota pressure. */
class QuotaStorage extends MemoryStorage {
    private rejectedOnce = false;
    public constructor(private readonly capacityBytes: number) {
        super();
    }
    public override setItem(key: string, value: string): void {
        if (value.length > this.capacityBytes) {
            this.rejectedOnce = true;
            throw new DOMException("setItem exceeded the quota", "QuotaExceededError");
        }
        super.setItem(key, value);
    }
    public get sawQuotaError(): boolean {
        return this.rejectedOnce;
    }
}

const createInitialState = (): SandboxSceneState => ({
    gridType: GridVals.NORMAL,
    currentLap: 0,
    fightStarted: false,
    fightFinished: false,
    units: [],
});

const completedResult: IGameActionResult = {
    completed: true,
    events: [{ type: "fight_started", leftUnitsAlive: 1, rightUnitsAlive: 1 }],
};

describe("SandboxReplayRecorder", () => {
    it("captures the initial state before recording the completed action", () => {
        const storage = new MemoryStorage();
        const initialState = createInitialState();
        // The real captureSceneState() returns a fresh detached snapshot each call; mirror that here
        // (a shared reference would be mutated by the line below before the snapshot is taken).
        const recorder = new SandboxReplayRecorder(() => cloneReplayData(initialState), storage);
        const action: GameAction = { type: "start_fight" };

        recorder.beginAction(100);
        initialState.fightStarted = true;
        recorder.recordAction(action, completedResult, 120);

        const replay = recorder.getCurrentReplay();
        expect(replay?.initialState.fightStarted).toBe(false);
        expect(replay?.actions).toHaveLength(1);
        expect(replay?.actions[0]).toMatchObject({ sequence: 1, action });
        expect(replay?.actions[0].stateAfter.fightStarted).toBe(true);
        recorder.flush(); // persistence is now debounced; force the write before asserting storage
        expect(listSandboxReplays(storage)).toHaveLength(1);
    });

    it("debounces persistence: a recorded action updates memory but is not written to storage synchronously", () => {
        // Regression guard for the move-landing hitch: saveSandboxReplay serializes the whole (growing)
        // replay, so doing it on every recordAction was O(n^2) over a match. recordAction must only touch
        // the in-memory replay; the expensive localStorage write is deferred behind a debounce.
        const storage = new MemoryStorage();
        const recorder = new SandboxReplayRecorder(createInitialState, storage);

        recorder.beginAction(100);
        recorder.recordAction({ type: "start_fight" }, completedResult, 120);

        expect(recorder.getCurrentReplay()?.actions).toHaveLength(1); // in-memory: immediate
        expect(listSandboxReplays(storage)).toHaveLength(0); // storage: deferred

        recorder.flush(); // cancels the pending debounce timer and persists now
        expect(listSandboxReplays(storage)).toHaveLength(1);
    });

    it("coalesces multiple recorded actions into a single debounced write", () => {
        const storage = new MemoryStorage();
        const recorder = new SandboxReplayRecorder(createInitialState, storage);

        recorder.beginAction(100);
        for (let i = 0; i < 5; i += 1) {
            recorder.recordAction({ type: "start_fight" }, completedResult, 120 + i);
        }

        expect(listSandboxReplays(storage)).toHaveLength(0); // no per-action writes
        expect(recorder.getCurrentReplay()?.actions).toHaveLength(5);

        recorder.flush();
        const saved = listSandboxReplays(storage);
        expect(saved).toHaveLength(1);
        expect(saved[0].actions).toHaveLength(5); // one write, all actions present
    });

    it("flushes the pending replay on reset so a finished match is not lost", () => {
        const storage = new MemoryStorage();
        const recorder = new SandboxReplayRecorder(createInitialState, storage);

        recorder.beginAction(100);
        recorder.recordAction({ type: "start_fight" }, completedResult, 120);
        expect(listSandboxReplays(storage)).toHaveLength(0); // still debounced

        recorder.reset();
        expect(listSandboxReplays(storage)).toHaveLength(1); // persisted before discarding
        expect(recorder.getCurrentReplay()).toBeUndefined(); // and cleared
    });

    it("does not persist rejected actions", () => {
        const storage = new MemoryStorage();
        const recorder = new SandboxReplayRecorder(createInitialState, storage);

        recorder.beginAction(100);
        recorder.recordAction(
            { type: "wait_turn", unitId: "u1" },
            { completed: false, events: [], rejectionReason: "fight_not_started" },
            120,
        );

        expect(recorder.getCurrentReplay()?.actions).toHaveLength(0);
        expect(listSandboxReplays(storage)).toHaveLength(0);
    });

    it("keeps a bounded newest-first local replay history", () => {
        const storage = new MemoryStorage();
        const base = {
            version: 1,
            kind: "sandbox",
            initialState: createInitialState(),
            actions: [],
        } satisfies Pick<SandboxReplay, "actions" | "initialState" | "kind" | "version">;

        for (let i = 0; i < MAX_SAVED_SANDBOX_REPLAYS + 3; i += 1) {
            saveSandboxReplay(
                {
                    ...base,
                    id: `replay-${i}`,
                    createdAtMs: i,
                    updatedAtMs: i,
                },
                storage,
            );
        }

        const saved = listSandboxReplays(storage);
        expect(saved).toHaveLength(MAX_SAVED_SANDBOX_REPLAYS);
        expect(saved[0].id).toBe(`replay-${MAX_SAVED_SANDBOX_REPLAYS + 2}`);
        expect(saved.at(-1)?.id).toBe("replay-3");
    });

    it("trims the oldest replays under quota pressure instead of throwing", () => {
        // Regression guard for the sandbox-reload incident: a QuotaExceededError escaping
        // saveSandboxReplay spammed uncaught errors from the debounced persist and aborted the
        // scene rebuild halfway when reset() flushed synchronously mid-teardown.
        const base = {
            version: 1,
            kind: "sandbox",
            initialState: createInitialState(),
            actions: [],
        } satisfies Pick<SandboxReplay, "actions" | "initialState" | "kind" | "version">;
        const bigReplay = (id: string, updatedAtMs: number): SandboxReplay => ({
            ...base,
            id,
            createdAtMs: updatedAtMs,
            updatedAtMs,
        });

        // Budget that fits exactly two big replays: the save must shed older history, not throw.
        const reference = JSON.stringify([bigReplay("ref-a", 1), bigReplay("ref-b", 2)]);
        const storage = new QuotaStorage(reference.length);

        expect(() => {
            for (let i = 0; i < 6; i += 1) {
                saveSandboxReplay(bigReplay(`replay-${i}`, i), storage);
            }
        }).not.toThrow();
        expect(storage.sawQuotaError).toBe(true);

        const saved = listSandboxReplays(storage);
        expect(saved.length).toBeGreaterThan(0);
        expect(saved.length).toBeLessThan(6); // history was shed
        expect(saved[0].id).toBe("replay-5"); // the newest always survives
    });

    it("clears storage rather than throwing when a single replay exceeds the whole quota", () => {
        const base = {
            version: 1,
            kind: "sandbox",
            initialState: createInitialState(),
            actions: [],
        } satisfies Pick<SandboxReplay, "actions" | "initialState" | "kind" | "version">;
        const replay: SandboxReplay = { ...base, id: "huge", createdAtMs: 1, updatedAtMs: 1 };
        const storage = new QuotaStorage(JSON.stringify([replay]).length - 1);

        expect(() => saveSandboxReplay(replay, storage)).not.toThrow();
        expect(storage.sawQuotaError).toBe(true);
        expect(listSandboxReplays(storage)).toHaveLength(0); // slate wiped clean, no stale blob
    });
});
