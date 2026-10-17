import { describe, expect, test } from "bun:test";
import { TeamVals, type TeamType, type Unit } from "@heroesofcrypto/common";

import { RankedPlayScene } from "./RankedPlayScene";

type Scene = {
    viewerTeam?: TeamType;
    fullReplayPlaybackActive: boolean;
    replayViewingActive: boolean;
    replayPlaybackActive: boolean;
    sc_screenBloodImpacts: number;
    onCombatImpact(
        attacker: Unit,
        victimTeam: TeamType | undefined,
        amount: number,
        attackType: "melee" | "range",
    ): void;
};
const fixture = (viewerTeam?: TeamType): Scene =>
    Object.assign(Object.create(RankedPlayScene.prototype) as Scene, {
        viewerTeam,
        fullReplayPlaybackActive: false,
        replayViewingActive: false,
        // Live authoritative attacks use this flag too. It must not suppress personal hit effects.
        replayPlaybackActive: true,
        sc_screenBloodImpacts: 0,
    });
const attacker = (team: TeamType, name = "Zena") => ({ getTeam: () => team, getName: () => name }) as Unit;

describe("Zena's personal screen blood", () => {
    for (const [victim, source] of [
        [TeamVals.LEFT, TeamVals.RIGHT],
        [TeamVals.RIGHT, TeamVals.LEFT],
    ] as const) {
        test(`only the struck seat gets blood when team ${source}'s Zena lands a ranged hit`, () => {
            const struck = fixture(victim);
            const attacking = fixture(source);
            const spectator = fixture();
            for (const scene of [struck, attacking, spectator])
                scene.onCombatImpact(attacker(source), victim, 12, "range");
            expect(struck.sc_screenBloodImpacts).toBe(1);
            expect(attacking.sc_screenBloodImpacts).toBe(0);
            expect(spectator.sc_screenBloodImpacts).toBe(0);
        });

        test(`team ${source}'s Zena melee hits and counters leave the opponent's screen clear`, () => {
            const scene = fixture(victim);
            scene.onCombatImpact(attacker(source), victim, 12, "melee");
            scene.onCombatImpact(attacker(source), victim, 30, "melee");
            expect(scene.sc_screenBloodImpacts).toBe(0);
        });
    }

    test("misses, shield absorption, other creatures and unknown victims add no blood", () => {
        const scene = fixture(TeamVals.RIGHT);
        scene.onCombatImpact(attacker(TeamVals.LEFT), TeamVals.RIGHT, 0, "range");
        scene.onCombatImpact(attacker(TeamVals.LEFT), TeamVals.RIGHT, -10, "range");
        scene.onCombatImpact(attacker(TeamVals.LEFT), TeamVals.RIGHT, NaN, "range");
        scene.onCombatImpact(attacker(TeamVals.LEFT, "Archer"), TeamVals.RIGHT, 10, "range");
        scene.onCombatImpact(attacker(TeamVals.LEFT), undefined, 10, "range");
        expect(scene.sc_screenBloodImpacts).toBe(0);
    });

    test("full replay and replay snapshot views do not obstruct a seated player's screen", () => {
        const scene = fixture(TeamVals.RIGHT);
        scene.fullReplayPlaybackActive = true;
        scene.onCombatImpact(attacker(TeamVals.LEFT), TeamVals.RIGHT, 10, "range");
        scene.fullReplayPlaybackActive = false;
        scene.replayViewingActive = true;
        scene.onCombatImpact(attacker(TeamVals.LEFT), TeamVals.RIGHT, 10, "range");
        expect(scene.sc_screenBloodImpacts).toBe(0);
        scene.replayViewingActive = false;
        scene.onCombatImpact(attacker(TeamVals.LEFT), TeamVals.RIGHT, 10, "range");
        expect(scene.sc_screenBloodImpacts).toBe(1);
    });
});
