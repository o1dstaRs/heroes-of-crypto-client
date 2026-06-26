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

const createInitialState = (): SandboxSceneState => ({
    gridType: GridVals.NORMAL,
    currentLap: 0,
    fightStarted: false,
    fightFinished: false,
    units: [],
});

const completedResult: IGameActionResult = {
    completed: true,
    events: [{ type: "fight_started", lowerUnitsAlive: 1, upperUnitsAlive: 1 }],
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
});
