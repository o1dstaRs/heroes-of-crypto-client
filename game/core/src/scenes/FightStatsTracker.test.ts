import { describe, expect, test } from "bun:test";

import { TeamType, TeamVals } from "@heroesofcrypto/common";

import { FightStatsTracker } from "./FightStatsTracker";

const makeUnit = (name: string, team: TeamType, startingAmount: number) => {
    let amountAlive = startingAmount;
    return {
        getTeam: () => team,
        getName: () => name,
        getSmallTextureName: () => `${name.toLowerCase()}_512`,
        getAmountAlive: () => amountAlive,
        getCumulativeHp: () => amountAlive * 10,
        setAmountAlive: (amount: number) => {
            amountAlive = amount;
        },
    };
};

describe("fight creature eliminations", () => {
    test("waits until every deployed stack of the same creature is dead", () => {
        const tracker = new FightStatsTracker();
        const fairyOne = makeUnit("Fairy", TeamVals.LEFT as TeamType, 1);
        const fairyTwo = makeUnit("Fairy", TeamVals.LEFT as TeamType, 1);
        const fairyArmy = makeUnit("Fairy", TeamVals.LEFT as TeamType, 120);
        const wolf = makeUnit("Wolf", TeamVals.RIGHT as TeamType, 9);

        tracker.start([fairyOne, fairyTwo, fairyArmy, wolf]);

        fairyOne.setAmountAlive(0);
        expect(tracker.sample([fairyOne, fairyTwo, fairyArmy, wolf], 2)).toBe(true);
        fairyTwo.setAmountAlive(0);
        expect(tracker.sample([fairyOne, fairyTwo, fairyArmy, wolf], 3)).toBe(true);

        fairyArmy.setAmountAlive(0);
        expect(tracker.sample([fairyOne, fairyTwo, fairyArmy, wolf], 4)).toBe(true);
        const report = tracker.buildReport(TeamVals.RIGHT as TeamType, [fairyOne, fairyTwo, fairyArmy, wolf], 4);
        const markerSamples = report.series.filter((sample) => sample.eliminations?.length);

        expect(markerSamples).toHaveLength(1);
        expect(markerSamples[0]).toMatchObject({ lap: 4, leftKilled: 122 });
        expect(markerSamples[0].eliminations).toEqual([
            {
                creatureKey: `${TeamVals.LEFT}|fairy`,
                name: "Fairy",
                smallTextureName: "fairy_512",
                team: TeamVals.LEFT,
            },
        ]);
    });
});
