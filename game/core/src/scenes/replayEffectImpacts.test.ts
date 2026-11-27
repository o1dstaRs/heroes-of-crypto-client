import { expect, test } from "bun:test";
import { TeamVals, type GameEvent } from "@heroesofcrypto/common";

import type { AuthoritativeGameSnapshot } from "../game_action_transport";
import type { SandboxReplayActionRecord } from "../replay/sandbox_replay";
import { RankedPlayScene } from "./RankedPlayScene";
import { Sandbox } from "./Sandbox";

function fixture() {
    let now = 0;
    const pops: { id: string; names: string[]; at: number }[] = [];
    const units = new Map(
        ["attacker", "target", "support"].map((id) => [id, { getId: () => id, isDead: () => false }]),
    );
    const snapshot = {
        gameId: "replay",
        latestSequence: 2,
        fightStarted: true,
        fightFinished: false,
        units: [
            { id: "attacker", debuffs: ["Weakness"], buffs: [], dead: false },
            { id: "target", debuffs: ["Sadness"], buffs: [], dead: false },
            { id: "support", debuffs: [], buffs: ["Hidden"], dead: false },
        ],
    } as unknown as AuthoritativeGameSnapshot;
    const record = {
        authoritativeSnapshot: snapshot,
        action: { type: "range_attack", attackerId: "attacker", targetId: "target" },
        events: [],
        stateAfter: { units: [] },
    } as unknown as SandboxReplayActionRecord;
    const scene = Object.assign(Object.create(RankedPlayScene.prototype), {
        replayPlaybackActive: true,
        fullReplayPlaybackActive: true,
        currentReplayImpactRecord: record,
        effectPopsGameId: "replay",
        effectPopsSequence: 1,
        unitDebuffs: new Map([...units.keys()].map((id) => [id, new Set<string>()])),
        unitBuffs: new Map([...units.keys()].map((id) => [id, new Set<string>()])),
        unitsHolder: { getAllUnits: () => units },
        pendingEffectPops: [],
        playEffectPops: (entry: { unit: { getId(): string }; debuffs: string[]; buffs: string[] }) => {
            pops.push({ id: entry.unit.getId(), names: [...entry.debuffs, ...entry.buffs], at: now });
        },
        rememberStatusSnapshot: () => {},
        rememberStatusApplications: () => {},
        applyAuthoritativeSceneLog: () => {},
        renderNewlyAppliedMorale: () => {},
        renderNewlyAppliedPoison: () => {},
        renderNewlyAppliedArmageddon: () => {},
        renderNewlyAppliedPyre: () => {},
        reconcileAuraEffectsFromSnapshot: () => {},
        applyRankedTimer: () => {},
        applyRankedFightStats: () => {},
    });
    return {
        scene,
        snapshot,
        record,
        pops,
        units,
        at: (value: number) => {
            now = value;
        },
    };
}

test("replay statuses land on each recipient's own hit and response, not the following action", () => {
    const f = fixture();
    f.at(100);
    f.scene.onReplayUnitImpact(new Set(["target"]));
    expect(f.pops).toEqual([{ id: "target", names: ["Sadness"], at: 100 }]);
    expect(f.scene.effectPopsSequence).toBe(1);
    f.at(200);
    f.scene.onReplayUnitImpact(new Set(["target"]));
    expect(f.pops).toHaveLength(1);
    f.at(350);
    f.scene.onReplayUnitImpact(new Set(["attacker"]));
    expect(f.pops[1]).toEqual({ id: "attacker", names: ["Weakness"], at: 350 });
    f.at(700);
    f.scene.onReplayRecordPresented(f.record);
    expect(f.pops[2]).toEqual({ id: "support", names: ["Hidden"], at: 700 });
    expect(f.scene.pendingEffectPops).toEqual([]);
    expect(f.pops).toHaveLength(3);
});

test("replay spells commit their recorded recipients at the cast's impact", () => {
    const f = fixture();
    f.record.action = { type: "cast_spell", casterId: "support", targetId: "target", spellName: "Weakness" };
    f.at(250);
    f.scene.onReplaySpellImpact(f.record);
    expect(f.pops.some((pop) => pop.id === "target" && pop.at === 250)).toBe(true);
    expect(f.pops.some((pop) => pop.id === "attacker")).toBe(false);
});

test("dead recipients and resisted/no-op changes do not invent replay status animations", () => {
    const f = fixture();
    f.snapshot.units[0].debuffs = [];
    f.snapshot.units[1].dead = true;
    f.scene.onReplayUnitImpact(new Set(["target", "attacker"]));
    expect(f.pops).toEqual([]);
});

test("sandbox journals also show only confirmed debuffs on the unit currently being struck", () => {
    const f = fixture();
    Object.setPrototypeOf(f.scene, Sandbox.prototype);
    const events: GameEvent[] = [
        {
            type: "effects_applied",
            applications: [
                { unitId: "target", name: "Sadness", kind: "effect" },
                { unitId: "target", name: "Paralysis", kind: "effect", resisted: true },
                { unitId: "attacker", name: "Weakness", kind: "debuff" },
                { unitId: "target", name: "Wolf Trail Blessing", kind: "buff" },
            ],
        },
    ];
    f.scene.onReplayUnitImpact(new Set(["target"]), events);
    f.scene.onReplayUnitImpact(new Set(["target"]), events);
    expect(f.pops).toEqual([{ id: "target", names: ["Sadness"], at: 0 }]);
    f.at(300);
    f.scene.onReplayUnitImpact(new Set(["attacker"]), events);
    expect(f.pops[1]).toEqual({ id: "attacker", names: ["Weakness"], at: 300 });
});

test("the terminal authoritative replay report is republished after final hydration", () => {
    const f = fixture();
    f.snapshot.fightFinished = true;
    let restored = false;
    f.scene.applyRankedFightStats = (snapshot: AuthoritativeGameSnapshot, units: unknown[]) => {
        expect(snapshot).toBe(f.snapshot);
        expect(units).toBe(f.record.stateAfter.units);
        restored = true;
    };
    f.scene.onReplayCompleted(f.record);
    expect(restored).toBe(true);
    expect(f.scene.sc_visibleStateUpdateNeeded).toBe(true);
});

test("a terminal draw snapshot produces a final report even without an engine finish event", () => {
    const f = fixture();
    f.snapshot.fightFinished = true;
    f.scene.rankedStatsGameId = "replay";
    f.scene.rankedStatsSequence = 2;
    f.scene.sc_visibleState = { hasFinished: false };
    f.scene.applyRankedDamageStatistics = () => {};
    f.scene.ensureRankedFightStatsStarted = () => {};
    f.scene.mergeRankedRoster = () => {};
    f.scene.applyServerStartTotals = () => {};
    f.scene.sampleRankedFightStats = () => {};
    f.scene.inferRankedWinner = () => TeamVals.NO_TEAM;
    f.scene.winnerByAliveTotals = () => TeamVals.NO_TEAM;
    f.scene.buildRankedFightStats = () => ({
        winner: TeamVals.NO_TEAM,
        leftStartTotal: 1,
        rightStartTotal: 1,
        totalLaps: 4,
    });
    RankedPlayScene.prototype["applyRankedFightStats"].call(f.scene, f.snapshot, []);
    expect(f.scene.sc_visibleState.hasFinished).toBe(true);
    expect(f.scene.sc_visibleState.teamWin).toBe(TeamVals.NO_TEAM);
    expect(f.scene.sc_visibleState.fightStats.winner).toBe(TeamVals.NO_TEAM);
});
