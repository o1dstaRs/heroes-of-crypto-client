import { afterEach, expect, test } from "bun:test";
import {
    Artifact,
    Doctrine,
    FightStateManager,
    GridVals,
    TeamVals,
    synergyVariantsForSeed,
} from "@heroesofcrypto/common";

import type { AuthoritativeGameSnapshot } from "../game_action_transport";
import { captureFightResultSetup, fightResultSetupFromSnapshot } from "./fightResultSetup";
import { FightStatsTracker } from "./FightStatsTracker";
import { RankedPlayScene, authoritativeSnapshotToSandboxSceneState } from "./RankedPlayScene";
import { Sandbox, type SandboxSceneState } from "./Sandbox";
import type { IFightResultSetup, IFightStatsReport } from "./VisibleState";

const manager = FightStateManager.getInstance();
afterEach(() => manager.reset());

const configure = () => {
    manager.reset();
    const fight = manager.getFightProperties();
    fight.setDoctrinePerTeam(TeamVals.LEFT, Doctrine.Doctrine.SEE_ALL);
    fight.setDoctrinePerTeam(TeamVals.RIGHT, Doctrine.Doctrine.SEE_NONE);
    fight.setArtifactPerTeam(TeamVals.LEFT, Artifact.ArtifactTier.TIER_1, Artifact.Tier1Artifact.WINGED_BOOTS);
    fight.setArtifactPerTeam(TeamVals.RIGHT, Artifact.ArtifactTier.TIER_1, Artifact.Tier1Artifact.BARREL_BARRICADE);
    fight.setArtifactPerTeam(TeamVals.LEFT, Artifact.ArtifactTier.TIER_2, Artifact.Tier2Artifact.CROWN_OF_COMMAND);
    fight.setArtifactPerTeam(TeamVals.RIGHT, Artifact.ArtifactTier.TIER_2, Artifact.Tier2Artifact.PENDANT_OF_VITALITY);
    fight.setSynergyVariants({ Life: 2, Nature: 1, Chaos: 2, Might: 1 });
    fight.setSynergiesPerTeam(TeamVals.LEFT, ["Nature:1:3", "Life:2:1"]);
    fight.setSynergiesPerTeam(TeamVals.RIGHT, ["Chaos:2:2"]);
    return fight;
};

const terminalSnapshot = (): AuthoritativeGameSnapshot => ({
    gameId: "completed-setup-test",
    phase: 1,
    gridType: GridVals.NORMAL,
    currentLap: 5,
    fightStarted: true,
    fightFinished: true,
    winnerTeam: TeamVals.LEFT,
    currentUnitId: "",
    currentTurnTeam: TeamVals.LEFT,
    latestSequence: 9,
    narrowingLayers: 0,
    centerDried: false,
    units: [],
    damageStats: [],
    leftStartUnits: 100,
    rightStartUnits: 100,
    leftDoctrine: Doctrine.Doctrine.THREE_REVEALS,
    rightDoctrine: Doctrine.Doctrine.SEE_ALL,
    leftArtifactTier1: Artifact.Tier1Artifact.NO_ARTIFACT,
    leftArtifactTier2: Artifact.Tier2Artifact.CROWN_OF_COMMAND,
    rightArtifactTier1: Artifact.Tier1Artifact.BARREL_BARRICADE,
    rightArtifactTier2: Artifact.Tier2Artifact.NO_ARTIFACT,
    leftSynergies: ["Nature:1:3", "Life:2:1"],
    rightSynergies: ["Chaos:2:2"],
});

test("local results copy both armies and the single global variant table, detached from next fight changes", () => {
    const fight = configure();
    const setup = captureFightResultSetup(fight);
    expect(setup.armies).toEqual([
        {
            team: TeamVals.LEFT,
            doctrine: Doctrine.Doctrine.SEE_ALL,
            artifactTier1: Artifact.Tier1Artifact.WINGED_BOOTS,
            artifactTier2: Artifact.Tier2Artifact.CROWN_OF_COMMAND,
            synergies: ["Nature:1:3", "Life:2:1"],
        },
        {
            team: TeamVals.RIGHT,
            doctrine: Doctrine.Doctrine.SEE_NONE,
            artifactTier1: Artifact.Tier1Artifact.BARREL_BARRICADE,
            artifactTier2: Artifact.Tier2Artifact.PENDANT_OF_VITALITY,
            synergies: ["Chaos:2:2"],
        },
    ]);
    fight.setDoctrinePerTeam(TeamVals.LEFT, Doctrine.Doctrine.SEE_NONE);
    fight.setArtifactPerTeam(TeamVals.RIGHT, Artifact.ArtifactTier.TIER_2, 0);
    fight.setSynergyVariants({ Life: 1, Nature: 2, Chaos: 1, Might: 2 });
    fight.setSynergiesPerTeam(TeamVals.LEFT, ["Might:2:1"]);
    expect(setup.armies[0].synergies).toEqual(["Nature:1:3", "Life:2:1"]);
    expect(setup.armies[0].doctrine).toBe(Doctrine.Doctrine.SEE_ALL);
    expect(setup.armies[1].artifactTier2).toBe(Artifact.Tier2Artifact.PENDANT_OF_VITALITY);
    expect(setup.synergyVariants).toEqual({ Life: 2, Nature: 1, Chaos: 2, Might: 1 });
});

test("ranked and replay results read the recorded snapshot even when the engine belongs to another fight", () => {
    configure();
    const snapshot = terminalSnapshot();
    const setup = fightResultSetupFromSnapshot(snapshot);
    expect(setup.armies[0]).toEqual({
        team: TeamVals.LEFT,
        doctrine: snapshot.leftDoctrine,
        artifactTier1: 0,
        artifactTier2: snapshot.leftArtifactTier2,
        synergies: ["Nature:1:3", "Life:2:1"],
    });
    expect(setup.armies[1]).toEqual({
        team: TeamVals.RIGHT,
        doctrine: snapshot.rightDoctrine,
        artifactTier1: snapshot.rightArtifactTier1,
        artifactTier2: 0,
        synergies: ["Chaos:2:2"],
    });
    expect(setup.synergyVariants).toEqual(synergyVariantsForSeed(snapshot.gameId));
    expect(authoritativeSnapshotToSandboxSceneState(snapshot).resultSetup).toEqual(setup);
    const original = JSON.stringify(setup);
    snapshot.leftDoctrine = Doctrine.Doctrine.SEE_NONE;
    snapshot.rightArtifactTier1 = 0;
    snapshot.leftSynergies!.push("Might:1:1");
    expect(JSON.stringify(setup)).toBe(original);
});

test("legacy authority fields stay unknown, while explicit empty slots remain zero", () => {
    configure();
    const snapshot = terminalSnapshot();
    delete snapshot.leftSynergies;
    snapshot.rightSynergies = [];
    delete snapshot.leftDoctrine;
    delete snapshot.leftArtifactTier1;
    delete snapshot.leftArtifactTier2;
    const setup = fightResultSetupFromSnapshot(snapshot);
    expect(setup.armies[0].synergies).toBeUndefined();
    expect(setup.armies[1].synergies).toEqual([]);
    expect(setup.armies[0].doctrine).toBeUndefined();
    expect(setup.armies[0].artifactTier1).toBeUndefined();
    expect(setup.armies[0].artifactTier2).toBeUndefined();
    expect(setup.armies[1].artifactTier2).toBe(0);
});

test("the live sandbox report and recorded scene carry setup into a later replay", () => {
    configure();
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        unitsHolder: { getAllUnits: () => new Map() },
        grid: { getArtifactBarrels: () => [] },
        dungeonVisuals: { isCenterDried: () => false, hasScatteredMountains: () => false },
        fightStatsTracker: new FightStatsTracker(),
        sc_visibleState: { hasFinished: false },
        fightReplayPlaybackActive: false,
    }) as Sandbox;
    Sandbox.prototype["updateLiveFightStats"].call(scene);
    const report = (scene as unknown as { sc_visibleState: { fightStats: IFightStatsReport } }).sc_visibleState
        .fightStats;
    expect(report.setup).toEqual(captureFightResultSetup(manager.getFightProperties()));
    const saved = JSON.parse(JSON.stringify(Sandbox.prototype["captureSceneState"].call(scene))) as SandboxSceneState;
    expect(saved.resultSetup).toEqual(report.setup);
    manager.reset();
    Object.assign(scene, { fightReplayPlaybackActive: true, replayResultSetup: saved.resultSetup });
    Sandbox.prototype["updateLiveFightStats"].call(scene);
    expect(
        (scene as unknown as { sc_visibleState: { fightStats: IFightStatsReport } }).sc_visibleState.fightStats.setup,
    ).toEqual(report.setup);
});

test("an older local replay cannot borrow the current game's doctrine, artifacts or global variants", () => {
    configure();
    const scene = Object.assign(Object.create(Sandbox.prototype), { fightReplayPlaybackActive: true }) as Sandbox;
    expect(Sandbox.prototype["getFightResultSetup"].call(scene)).toBeUndefined();
});

test("cold terminal ranked publication includes both armies' setup even with no survivors or React setup effect", () => {
    configure();
    const scene = Object.assign(Object.create(RankedPlayScene.prototype), {
        rankedStatsGameId: "",
        rankedDamageStatistics: [],
        rankedStatsAliveCreatureGroups: new Map(),
        rankedStatsLeftRoster: new Map(),
        rankedStatsRightRoster: new Map(),
        rankedStatsCountedUnitIds: new Set(),
        sc_visibleState: { hasFinished: false },
    }) as RankedPlayScene;
    const snapshot = terminalSnapshot();
    RankedPlayScene.prototype["applyRankedFightStats"].call(scene, snapshot, []);
    const state = (scene as unknown as { sc_visibleState: { hasFinished: boolean; fightStats: IFightStatsReport } })
        .sc_visibleState;
    expect(state.hasFinished).toBe(true);
    expect(state.fightStats.winner).toBe(TeamVals.LEFT);
    expect(state.fightStats.setup).toEqual(fightResultSetupFromSnapshot(snapshot));
    const setup: IFightResultSetup = state.fightStats.setup!;
    manager.reset();
    expect(state.fightStats.setup).toBe(setup);
});
