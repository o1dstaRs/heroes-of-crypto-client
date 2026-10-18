import { describe, expect, mock, test } from "bun:test";
import { GridVals, HoCConfig, TeamVals, type UnitProperties } from "@heroesofcrypto/common";

import { Sandbox, type SandboxSceneState } from "../scenes/Sandbox";
import { authoritativeSnapshotToSandboxSceneState } from "../scenes/RankedPlayScene";
import { toAuthoritativeGameSnapshot } from "../api/ranked_play_client";
import type { AuthoritativeGameSnapshot } from "../game_action_transport";
import { PlayActionType, PlayEventKind, PlayPhase, type PlaySnapshot } from "../api/play_protocol";
import {
    collectRankedReplaySnapshots,
    createRankedReplayFromJournal,
    createSandboxReplayFromRankedReplay,
    getRankedReplayInitialSnapshot,
    type RankedReplay,
} from "./ranked_replay";
import {
    cloneReplayData,
    listSandboxReplays,
    SandboxReplayRecorder,
    type SandboxReplay,
    type ReplayStorage,
} from "./sandbox_replay";

const state = (): SandboxSceneState => ({
    gridType: GridVals.NORMAL,
    currentLap: 1,
    fightStarted: true,
    fightFinished: false,
    currentUnitId: "a",
    upNext: ["a", "b"],
    artifactBarrels: [{ team: TeamVals.LEFT, index: 0, cell: { x: 1, y: 2 } }],
    terrainCells: [{ kind: "fire_wall", x: 4, y: 4, lapsRemaining: 2, burnPercentage: 35 }],
    units: ["a", "b"].map((id, index) => ({
        properties: {
            id,
            name: "Healer",
            hp: 13,
            max_hp: 13,
            amount_alive: 40,
            abilities: ["Book of Healing"],
            spells: ["Life:Heal", "Life:Spiritual Armor"],
            applied_buffs: ["Blessing"],
            applied_buffs_laps: [2],
        } as UnitProperties,
        team: TeamVals.LEFT,
        placed: true,
        dead: false,
        cells: [{ x: index + 1, y: 2 }],
        baseCell: { x: index + 1, y: 2 },
        attackType: 0,
        responded: false,
    })),
});
const storage = (): ReplayStorage => {
    const values = new Map<string, string>();
    return {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => {
            values.set(key, value);
        },
        removeItem: (key) => {
            values.delete(key);
        },
    };
};
const internal = (recorder: SandboxReplayRecorder) => (recorder as unknown as { replay: SandboxReplay }).replay;

const idleQueue = () => {
    const jobs: { work: (hasTime: () => boolean) => void; cancelled: boolean }[] = [];
    return {
        jobs,
        schedule: (work: (hasTime: () => boolean) => void) => {
            const job = { work, cancelled: false };
            jobs.push(job);
            return () => {
                job.cancelled = true;
            };
        },
        run: (steps = Infinity) => {
            const job = jobs.shift()!;
            if (!job.cancelled) job.work(() => steps-- > 0);
        },
    };
};

const ranked = (): RankedReplay => {
    const snapshot = (sequence: number): PlaySnapshot => ({
        gameId: "memory-test",
        phase: PlayPhase.PLAY,
        gridType: GridVals.NORMAL,
        currentLap: 1,
        fightStarted: true,
        fightFinished: false,
        currentUnitId: "a",
        currentTurnTeam: TeamVals.LEFT,
        latestSequence: sequence,
        serverTimeMs: sequence * 1000,
        placementDeadlineMs: 0,
        placementStage: 1,
        placementSplit: false,
        hideOpponentRosterDuringSetup: false,
        currentTurnStartMs: 0,
        currentTurnEndMs: 60000,
        units: [],
        players: [],
        readyPlayerIds: [],
        journalTail: [],
        upNext: ["a", "b"],
        maxLeftUnits: 2,
        maxRightUnits: 2,
        narrowingLayers: 0,
        centerDried: false,
        damageStats: [],
    });
    const checkpoints = [0, 1, 2, 3].map(snapshot);
    return createRankedReplayFromJournal({
        gameId: "memory-test",
        completeJournal: true,
        initialSnapshot: checkpoints[0],
        currentSnapshot: checkpoints[3],
        events: checkpoints.map((checkpoint) => ({
            sequence: checkpoint.latestSequence,
            kind: PlayEventKind.SNAPSHOT,
            gameId: "memory-test",
            playerId: "",
            rejectionReason: "",
            message: "",
            serverTimeMs: 0,
            snapshot: checkpoint,
        })),
        entries: [1, 2, 3].map((sequence) => ({
            sequence,
            actionId: `action-${sequence}`,
            playerId: "left",
            team: TeamVals.LEFT,
            actionType: PlayActionType.WAIT_TURN,
            actionJson: JSON.stringify({ type: "wait_turn", unitId: "a" }),
            eventsJson: JSON.stringify([{ type: "unit_waited", unitId: "a", team: TeamVals.LEFT }]),
            acceptedAtMs: sequence * 1000,
        })),
    });
};
const convert = (snapshot: PlaySnapshot): SandboxSceneState => {
    const result = state();
    result.units[0].properties.hp -= snapshot.latestSequence;
    return result;
};

describe("sandbox recording memory and isolation", () => {
    test("leaving the scene saves the last action, cancels idle work and releases the recording", () => {
        const idle = idleQueue();
        const saved = storage();
        const recorder = new SandboxReplayRecorder(state, saved, idle.schedule);
        recorder.beginAction(100);
        recorder.recordAction({ type: "wait_turn", unitId: "a" }, { completed: true, events: [] }, 110);
        const pending = idle.jobs[0];
        recorder.dispose();
        expect(pending.cancelled).toBe(true);
        expect(recorder.getCurrentReplay()).toBeUndefined();
        expect(listSandboxReplays(saved)[0].actions).toHaveLength(1);
        const failed = new SandboxReplayRecorder(
            state,
            {
                ...storage(),
                setItem: () => {
                    throw new Error("storage unavailable");
                },
            },
            idle.schedule,
        );
        failed.beginAction(200);
        failed.recordAction({ type: "wait_turn", unitId: "b" }, { completed: true, events: [] }, 210);
        expect(() => failed.dispose()).not.toThrow();
        expect(failed.getCurrentReplay()).toBeUndefined();
    });
    test("shares private checkpoints while storage and mutable exports preserve every independent state", () => {
        const saved = storage();
        const live = state();
        const idle = idleQueue();
        const recorder = new SandboxReplayRecorder(() => cloneReplayData(live), saved, idle.schedule);
        recorder.beginAction(100);
        for (let index = 0; index < 3; index++) {
            live.units[0].properties.hp--;
            recorder.recordAction({ type: "wait_turn", unitId: "a" }, { completed: true, events: [] }, 110 + index);
        }
        idle.run();
        const retained = internal(recorder);
        expect(retained.actions[0].stateAfter.units[1]).toBe(retained.initialState.units[1]);
        expect(retained.actions[2].stateAfter.units[0].properties.spells).toBe(
            retained.initialState.units[0].properties.spells,
        );
        expect(retained.actions[1].stateAfter.terrainCells).toBe(retained.initialState.terrainCells);
        const exported = recorder.getCurrentReplay()!;
        expect(exported).toEqual(retained);
        exported.actions[0].stateAfter.units[1].properties.spells.push("Life:Blessing");
        exported.actions[0].stateAfter.terrainCells![0].lapsRemaining = 99;
        expect(exported.actions[1].stateAfter.units[1].properties.spells).toHaveLength(2);
        expect(exported.initialState.terrainCells![0].lapsRemaining).toBe(2);
        expect(retained.actions[0].stateAfter.units[1].properties.spells).toHaveLength(2);
        recorder.flush();
        const restored = listSandboxReplays(saved)[0];
        expect(restored).toEqual(JSON.parse(JSON.stringify(retained)));
        expect(restored.version).toBe(1);
        expect(restored.actions.map((record) => record.stateAfter.units[0].properties.hp)).toEqual([12, 11, 10]);
        restored.actions[0].stateAfter.units[1].properties.spells.push("Life:Heal");
        expect(restored.actions[1].stateAfter.units[1].properties.spells).toHaveLength(2);
        expect(listSandboxReplays(saved)[0].actions[0].stateAfter.units[1].properties.spells).toHaveLength(2);
        recorder.reset();
        expect(recorder.hasActions()).toBe(false);
        recorder.beginAction(200);
        expect(internal(recorder).initialState.units[1]).not.toBe(retained.initialState.units[1]);
        recorder.reset();
    });

    test("shares in bounded idle slices, preserving unprocessed records and yielding when the browser is busy", () => {
        const idle = idleQueue();
        const recorder = new SandboxReplayRecorder(state, storage(), idle.schedule);
        recorder.beginAction(100);
        recorder.recordAction({ type: "wait_turn", unitId: "a" }, { completed: true, events: [] }, 110);
        recorder.recordAction({ type: "wait_turn", unitId: "b" }, { completed: true, events: [] }, 120);
        const retained = internal(recorder);
        expect(Object.isFrozen(retained.actions[0].stateAfter)).toBe(false);
        expect(idle.jobs).toHaveLength(1);
        const before = JSON.stringify(retained);
        idle.run(0);
        expect(Object.isFrozen(retained.initialState)).toBe(false);
        expect(idle.jobs).toHaveLength(1);
        idle.run(1);
        expect(Object.isFrozen(retained.initialState.units[0])).toBe(true);
        expect(Object.isFrozen(retained.initialState.units[1])).toBe(false);
        expect(Object.isFrozen(retained.actions[0].stateAfter)).toBe(false);
        idle.run(3);
        expect(Object.isFrozen(retained.initialState)).toBe(true);
        expect(retained.actions[0].stateAfter.units[0]).toBe(retained.initialState.units[0]);
        expect(Object.isFrozen(retained.actions[1].stateAfter)).toBe(false);
        idle.run();
        expect(retained.actions[0].stateAfter).toBe(retained.initialState);
        expect(retained.actions[1].stateAfter).toBe(retained.initialState);
        expect(idle.jobs).toHaveLength(0);
        expect(JSON.stringify(retained)).toBe(before);
        recorder.reset();
    });

    test("a retired match's late idle callback cannot compact or unschedule the next recording", () => {
        const idle = idleQueue();
        const recorder = new SandboxReplayRecorder(state, storage(), idle.schedule);
        recorder.beginAction(100);
        recorder.recordAction({ type: "wait_turn", unitId: "a" }, { completed: true, events: [] }, 110);
        const stale = idle.jobs.shift()!;
        recorder.reset();
        expect(stale.cancelled).toBe(true);
        recorder.beginAction(200);
        recorder.recordAction({ type: "wait_turn", unitId: "b" }, { completed: true, events: [] }, 210);
        stale.work(() => true);
        recorder.recordAction({ type: "wait_turn", unitId: "a" }, { completed: true, events: [] }, 220);
        expect(idle.jobs).toHaveLength(1);
        idle.run();
        expect(internal(recorder).actions[1].stateAfter).toBe(internal(recorder).initialState);
        recorder.reset();
    });

    test("availability checks neither capture nor clone a replay", () => {
        const capture = mock(() => state());
        const recorder = new SandboxReplayRecorder(capture, storage());
        const scene = Object.assign(Object.create(Sandbox.prototype), {
            replayRecorder: recorder,
            getCurrentSandboxReplay: () => {
                throw new Error("availability must not export a replay");
            },
        });
        expect(scene.canPlayCurrentSandboxReplay()).toBe(false);
        recorder.beginAction(100);
        recorder.recordAction({ type: "wait_turn", unitId: "a" }, { completed: true, events: [] }, 110);
        for (let index = 0; index < 100; index++) expect(scene.canPlayCurrentSandboxReplay()).toBe(true);
        expect(capture).toHaveBeenCalledTimes(2);
        recorder.reset();
    });
});

describe("ranked replay preparation memory and isolation", () => {
    test("the production converters keep shared cells, spell charges, statuses and creature configuration safe", () => {
        const source = ranked();
        const snapshots = new Set([
            source.initialSnapshot!,
            source.currentSnapshot!,
            ...source.events.map((event) => event.snapshot!),
        ]);
        for (const snapshot of snapshots) {
            snapshot.units = ["a", "b"].map((id, index) => ({
                id,
                name: "Healer",
                team: index ? TeamVals.RIGHT : TeamVals.LEFT,
                creatureId: 36,
                amountAlive: 40,
                amountDied: 0,
                hp: 13 - (index ? 0 : snapshot.latestSequence),
                maxHp: 13,
                attackType: 3,
                size: 1,
                baseCell: { x: index ? 12 : 2, y: 7 },
                cells: [{ x: index ? 12 : 2, y: 7 }],
                initiative: 4.1,
                morale: 0,
                luck: -1,
                dead: false,
                placed: true,
                stackPower: 5,
                rangeShots: 0,
                onHourglass: snapshot.latestSequence === 2,
                webMovementLocked: false,
                spellEntriesAuthoritative: true,
                spellEntries: ["Life:Heal"],
                spellAmounts: [1],
                buffs: ["Spiritual Armor"],
                buffLaps: [2],
                buffDescriptions: ["Armor"],
                abilities: ["Book of Healing"],
                footprintWidth: 1,
                footprintHeight: 1,
            }));
        }
        const before = cloneReplayData(source);
        const options = {
            snapshotToState: (snapshot: PlaySnapshot) =>
                authoritativeSnapshotToSandboxSceneState(toAuthoritativeGameSnapshot(snapshot)),
            snapshotToAuthoritative: (snapshot: PlaySnapshot) => toAuthoritativeGameSnapshot(snapshot),
        };
        const legacy = createSandboxReplayFromRankedReplay(source, options)!;
        const compact = createSandboxReplayFromRankedReplay(source, { ...options, shareSnapshots: true })!;
        expect(compact).toEqual(legacy);
        expect(source).toEqual(before);
        expect(compact.actions[1].stateAfter.units[0].onHourglass).toBe(true);
        expect(compact.actions[2].stateAfter.units[0].properties.spells).toEqual(["Life:Heal"]);
        expect(Object.isFrozen(compact.actions[0].authoritativeSnapshot!.units[0].baseCell)).toBe(true);
        const configured = HoCConfig.getCreatureConfig(TeamVals.LEFT, "Life", "Healer", "", 40);
        expect(() => configured.spells.push("Life:Heal")).not.toThrow();
        expect(() => configured.abilities.push("fresh-config-only")).not.toThrow();
        expect(HoCConfig.getCreatureConfig(TeamVals.LEFT, "Life", "Healer", "", 40).abilities).not.toContain(
            "fresh-config-only",
        );
    });
    test("the compact and legacy conversions have identical boards, events, log tails, stats and clocks", () => {
        const source = ranked();
        const before = cloneReplayData(source);
        const options = {
            nowMs: 5000,
            snapshotToState: convert,
            snapshotToAuthoritative: (snapshot: PlaySnapshot) =>
                ({
                    ...snapshot,
                    units: state().units.map((unit) => ({ id: unit.properties.id, hp: 13, buffs: ["Blessing"] })),
                }) as unknown as AuthoritativeGameSnapshot,
        };
        const legacy = createSandboxReplayFromRankedReplay(source, options)!;
        const compact = createSandboxReplayFromRankedReplay(source, { ...options, shareSnapshots: true })!;
        expect(compact).toEqual(legacy);
        expect(source).toEqual(before);
        expect(Object.isFrozen(source.initialSnapshot)).toBe(false);
        expect(compact.actions[0].stateAfter.units[1]).toBe(compact.initialState.units[1]);
        expect(compact.actions[2].authoritativeSnapshot!.units[0]).toBe(
            compact.actions[0].authoritativeSnapshot!.units[0],
        );
        expect(
            compact.actions.map((record) => record.authoritativeSnapshot!.journalTail!.map((entry) => entry.sequence)),
        ).toEqual([[1], [2], [3]]);
        expect(() => {
            compact.actions[0].stateAfter.units[1].properties.hp = 99;
        }).toThrow();
        legacy.actions[0].stateAfter.units[1].properties.spells.push("Life:Heal");
        expect(legacy.actions[1].stateAfter.units[1].properties.spells).toHaveLength(2);
        source.currentSnapshot!.upNext.push("changed-source");
        expect(compact.actions.at(-1)!.authoritativeSnapshot!.upNext).toEqual(["a", "b"]);
    });

    test("converters can mutate their working checkpoint without touching the downloaded replay", () => {
        const source = ranked();
        const before = cloneReplayData(source);
        const converted = createSandboxReplayFromRankedReplay(source, {
            shareSnapshots: true,
            snapshotToState: (snapshot) => {
                snapshot.upNext.push("working-copy");
                return convert(snapshot);
            },
            snapshotToAuthoritative: (snapshot) => snapshot as unknown as AuthoritativeGameSnapshot,
        })!;
        expect(source).toEqual(before);
        expect(converted.actions[0].authoritativeSnapshot!.upNext).toEqual(["a", "b", "working-copy"]);
    });

    test("snapshot selection deduplicates sequences with the latest representation and keeps public results mutable", () => {
        const replay = ranked();
        replay.currentSnapshot = { ...replay.initialSnapshot!, upNext: ["newest-copy"] };
        const collected = collectRankedReplaySnapshots(replay);
        expect(collected.map((snapshot) => snapshot.latestSequence)).toEqual([0, 1, 2, 3]);
        expect(collected[0].upNext).toEqual(["newest-copy"]);
        expect(getRankedReplayInitialSnapshot(replay)).toEqual(collected[0]);
        collected[0].upNext.push("edited");
        expect(replay.currentSnapshot.upNext).toEqual(["newest-copy"]);
        const later = replay.events[2].snapshot!;
        Object.defineProperty(later, "units", {
            get: () => {
                throw new Error("opening selection cloned a later checkpoint");
            },
            enumerable: true,
        });
        expect(getRankedReplayInitialSnapshot(replay)!.latestSequence).toBe(0);
    });
});

test("repeated playback, partial playback and rewind never mutate shared checkpoints", async () => {
    const replay = createSandboxReplayFromRankedReplay(ranked(), { shareSnapshots: true, snapshotToState: convert })!;
    const before = JSON.stringify(replay);
    const landed: number[] = [];
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        isSceneDestroyed: () => false,
        setReplayPlaybackActive: mock(),
        preloadTextureKeys: async () => {},
        waitForPendingTextures: async () => {},
        onSupplementaryTexturesLoaded: () => {},
        sc_sceneLog: { clear: () => {} },
        shouldApplyReplayRecordAsCheckpoint: () => false,
        hydrateSceneState: (checkpoint: SandboxSceneState) => {
            landed.push(checkpoint.units[0].properties.hp);
            checkpoint.units[0].properties.spells.push("Life:Heal");
            checkpoint.terrainCells![0].lapsRemaining = 99;
        },
        playSandboxReplayRecord: async () => true,
        onReplayRecordSettling: () => {},
        onReplayRecordPresented: () => {},
        delayReplay: async () => {},
    });
    for (const through of [3, 0, 2, 3]) {
        expect(await scene.playSandboxReplay(replay, through)).toBe(true);
        expect(landed.at(-1)).toBe(13 - through);
        expect(JSON.stringify(replay)).toBe(before);
    }
    expect(scene.replayRecordingSuspended).toBe(false);
    expect(scene.setReplayPlaybackActive).toHaveBeenLastCalledWith(false);
});
