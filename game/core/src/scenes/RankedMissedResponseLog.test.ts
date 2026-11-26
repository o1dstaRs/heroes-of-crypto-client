import { expect, test } from "bun:test";
import { TeamVals, type GameEvent } from "@heroesofcrypto/common";

import { RankedPlayScene } from "./RankedPlayScene";

type LogBuilder = {
    buildAuthoritativeSceneLogLines(
        entries: { sequence: number; actionType: number; team: number; eventsJson: string }[],
        names: ReadonlyMap<string, string>,
    ): string[];
};

// Game 00889997 (2026-11-26): a Scavenger's Dodge made the Nomad's counterattack miss, and the ranked log said
// nothing about it. The engine writes "misses ⚔️ resp on"; ranked rebuilds its log from events.
test("the ranked log names a counterattack that missed, after the attack it answered", () => {
    const scene = Object.assign(Object.create(RankedPlayScene.prototype), {
        rankedUnitTeamsById: new Map([
            ["scavenger", TeamVals.RIGHT],
            ["nomad", TeamVals.LEFT],
        ]),
        unitsHolder: { getAllUnits: () => new Map() },
    }) as LogBuilder;
    const attack = (missedResponse?: { unitId: string; position: { x: number; y: number } }): GameEvent => ({
        type: "unit_attacked",
        attackType: "melee",
        attackerId: "scavenger",
        targetId: "nomad",
        unitIdsDied: [],
        damage: {
            amount: 212,
            render: true,
            unitPosition: { x: -512, y: 320 },
            unitIsSmall: false,
            hits: [{ amount: 212, unitsDied: 8 }],
            luckyStrikeBy: [],
            secondary: [],
            ...(missedResponse ? { missedResponse } : {}),
            unitId: "nomad",
        },
        animations: [],
    });
    const names = new Map([
        ["scavenger", "Scavenger"],
        ["nomad", "Nomad"],
    ]);
    const log = (event: GameEvent) =>
        scene.buildAuthoritativeSceneLogLines(
            [{ sequence: 34, actionType: 8, team: TeamVals.RIGHT, eventsJson: JSON.stringify([event]) }],
            names,
        );

    const missed = log(attack({ unitId: "scavenger", position: { x: -320, y: 320 } }));
    const miss = missed.findIndex((line) => line.endsWith("Nomad misses ⚔️ resp on Scavenger"));
    expect(miss).toBeGreaterThan(0);
    expect(missed[miss - 1]).toContain("Scavenger");
    expect(missed[miss]).not.toBe("Nomad misses ⚔️ resp on Scavenger");
    // An answered or unanswered attack without a recorded miss adds no such line.
    expect(log(attack()).some((line) => line.includes("resp on"))).toBe(false);
});
