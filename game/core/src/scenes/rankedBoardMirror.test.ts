import { afterEach, describe, expect, test } from "bun:test";

import { TeamVals, type TeamType } from "@heroesofcrypto/common";

import type { AuthoritativeGameSnapshot } from "../game_action_transport";
import { isBoardMirrored, releaseBoardMirror } from "../pixi/boardMirror";
import type { SandboxReplay } from "../replay/sandbox_replay";
import { writeBoardSidePreference } from "../settings/playerBoardSide";
import { clearPersonalArmyTint } from "./personalArmyTint";
import { RankedPlayScene } from "./RankedPlayScene";
import { Sandbox } from "./Sandbox";

// The preference lives in localStorage, which the test runner has no DOM to provide.
const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
        store.set(key, value);
    },
};

interface MirrorScene {
    replayViewingActive: boolean;
    fullReplayPlaybackActive: boolean;
    applyRankedSnapshotMetadata: (snapshot: AuthoritativeGameSnapshot) => void;
    playSandboxReplay: (replay: SandboxReplay) => Promise<boolean>;
}

const scenes: MirrorScene[] = [];

/** A ranked scene with only the state its snapshot metadata pass reads; nothing is rendered. */
const sceneFor = (): MirrorScene => {
    const scene = Object.assign(Object.create(RankedPlayScene.prototype), {
        replayViewingActive: false,
        fullReplayPlaybackActive: false,
        sandboxCoop: false,
        authoritativePlaybackGameId: "",
        playedAuthoritativeActionSequences: new Set<number>(),
        setLocalModelTeamOverride: () => undefined,
        restoreRankedAiToggle: () => undefined,
        updateUnitsOverlayVisibility: () => undefined,
        refreshUnits: () => undefined,
        resetRankedReplayPresentation: () => undefined,
        sc_sceneLog: { isSuppressed: () => false, setSuppressed: () => undefined },
    }) as MirrorScene;
    scenes.push(scene);
    return scene;
};

const snapshot = (viewerTeam: TeamType | undefined, overrides: Partial<AuthoritativeGameSnapshot> = {}) =>
    ({ gameId: "game-1", viewerTeam, ...overrides }) as AuthoritativeGameSnapshot;

afterEach(() => {
    for (const scene of scenes.splice(0)) {
        releaseBoardMirror(scene);
    }
    clearPersonalArmyTint();
    store.clear();
});

describe("a ranked fight turns the board for the seated player who asked for it", () => {
    test("a right-seated player who wants the left side sees the board mirrored", () => {
        writeBoardSidePreference("left");
        const scene = sceneFor();
        scene.applyRankedSnapshotMetadata(snapshot(TeamVals.RIGHT));

        expect(isBoardMirrored()).toBe(true);
    });

    test("a player already on their chosen side, or on the default, sees the board as dealt", () => {
        writeBoardSidePreference("left");
        const leftSeat = sceneFor();
        leftSeat.applyRankedSnapshotMetadata(snapshot(TeamVals.LEFT));
        expect(isBoardMirrored()).toBe(false);

        writeBoardSidePreference("seat");
        const defaultRightSeat = sceneFor();
        defaultRightSeat.applyRankedSnapshotMetadata(snapshot(TeamVals.RIGHT));
        expect(isBoardMirrored()).toBe(false);
    });

    test("an observer, a replay and a co-op sandbox always show the true sides", () => {
        writeBoardSidePreference("right");

        sceneFor().applyRankedSnapshotMetadata(snapshot(undefined));
        expect(isBoardMirrored()).toBe(false);

        const replay = sceneFor();
        replay.replayViewingActive = true;
        replay.applyRankedSnapshotMetadata(snapshot(TeamVals.LEFT));
        expect(isBoardMirrored()).toBe(false);

        sceneFor().applyRankedSnapshotMetadata(snapshot(TeamVals.LEFT, { sandboxCoop: true }));
        expect(isBoardMirrored()).toBe(false);
    });

    test("the fight-results replay shows the true sides, and the live board turns back afterwards", async () => {
        writeBoardSidePreference("left");
        const scene = sceneFor();
        scene.applyRankedSnapshotMetadata(snapshot(TeamVals.RIGHT));
        expect(isBoardMirrored()).toBe(true);

        const basePlayback = Sandbox.prototype.playSandboxReplay;
        let mirroredDuringPlayback: boolean | undefined;
        Sandbox.prototype.playSandboxReplay = async function () {
            mirroredDuringPlayback = isBoardMirrored();
            return true;
        };
        try {
            await scene.playSandboxReplay({ actions: [] } as unknown as SandboxReplay);
        } finally {
            Sandbox.prototype.playSandboxReplay = basePlayback;
        }
        expect(mirroredDuringPlayback).toBe(false);

        // Playback over, the view re-applies the live terminal snapshot.
        scene.applyRankedSnapshotMetadata(snapshot(TeamVals.RIGHT));
        expect(isBoardMirrored()).toBe(true);
    });
});
