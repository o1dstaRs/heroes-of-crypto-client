import {
    STYLE_AXES,
    type ArmyStyle,
    type IMetricActions,
    type IMetricHealth,
    type PlayerMetricsSummary,
} from "../../api/player_metrics_contract";

export type MockPlaystyle = "adaptive" | "ranged" | "magic" | "new";
const styles: ArmyStyle[] = [
    { melee: 82, ranged: 18, magic: 12, area: 30, flying: 48, support: 26 },
    { melee: 20, ranged: 70, magic: 10, area: 54, flying: 12, support: 42 },
    { melee: 28, ranged: 12, magic: 74, area: 68, flying: 52, support: 60 },
];
export function buildMockPlayerMetrics(kind: MockPlaystyle = "adaptive"): PlayerMetricsSummary {
    const count = kind === "new" ? 3 : 20;
    const selected = Array.from(
        { length: count },
        (_, i) => styles[kind === "ranged" ? 1 : kind === "magic" ? 2 : i % 3],
    );
    const stylePct = Object.fromEntries(
        STYLE_AXES.map((axis) => [axis, selected.reduce((sum, row) => sum + row[axis], 0) / count]),
    ) as ArmyStyle;
    let distance = 0;
    let pairs = 0;
    selected.forEach((a, i) =>
        selected.slice(i + 1).forEach((b) => {
            distance +=
                STYLE_AXES.reduce((sum, axis) => sum + Math.abs(a[axis] - b[axis]) / 100, 0) / STYLE_AXES.length;
            pairs++;
        }),
    );
    const humanChoices =
        kind === "magic"
            ? { attack: 10, support: 6, move: 2, hold: 1, utility: 1 }
            : kind === "ranged"
              ? { attack: 14, support: 1, move: 2, hold: 3, utility: 0 }
              : { attack: 11, support: 3, move: 4, hold: 1, utility: 1 };
    const human: IMetricActions = {
        turns: 20,
        attacks: humanChoices.attack,
        offensiveSpells: 0,
        supportSpells: humanChoices.support,
        utilitySpells: humanChoices.utility,
        moves: humanChoices.move,
        advances: Math.max(0, humanChoices.move - 1),
        waits: 0,
        defends: humanChoices.hold,
        skips: 0,
        timeouts: 0,
        forcedSkips: 0,
    };
    const automated = {
        ...human,
        turns: 2,
        attacks: 2,
        supportSpells: 0,
        utilitySpells: 0,
        moves: 0,
        advances: 0,
        defends: 0,
    };
    const health: IMetricHealth = {
        damageDealtHp: 8420,
        damageReceivedHp: 6100,
        damageReceivedWithoutSourceHp: 120,
        friendlyDamageHp: 0,
        multiTargetDamageHp: 2400,
        healingReceivedHp: 1440,
        healingDoneHp: kind === "magic" ? 1640 : 640,
        resurrectionReceivedHp: 120,
        resurrectionDoneHp: 120,
        regenerationHp: 80,
        resurrectedUnits: 8,
        damageByResolution: { melee: 3000, ranged: 4000, spell: 1420, other: 0 },
    };
    const recent: PlayerMetricsSummary["recent"] = selected.map((style, i) => ({
        gameId: `mock-game-${i}`,
        finishedTime: 1792000000000 - i * 3600000,
        winnerTeam: 2,
        mode: "ranked",
        map: 0,
        balanceVersion: "mock-preview",
        player: {
            playerId: "11111111-1111-4111-8111-111111111111",
            team: 2,
            army: Array.from({ length: 6 }, (_, j) => ({
                creatureId: kind === "adaptive" || kind === "new" ? ((i * 3 + j) % 24) + 1 : j + 1,
                amount: 20,
                experience: 1000,
                roles: [],
            })),
            style: Object.fromEntries(STYLE_AXES.map((axis) => [axis, style[axis] / 100])) as ArmyStyle,
            human: { ...human },
            automated: { ...automated },
            humanChoices: { ...humanChoices },
            automatedChoices: { attack: 2, support: 0, move: 0, hold: 0, utility: 0 },
            systemTurns: 0,
            health: structuredClone(health),
            healingHp: health.healingDoneHp,
            resurrectedUnits: 8,
            resurrectionHp: 120,
            reportedDamage: { melee: 3000, ranged: 4000, spell: 1420, multiTarget: 2400 },
            damageByCreature: [],
            artifacts: [],
            augments: [],
            doctrine: 0,
        },
    }));
    const scaleActions = (row: IMetricActions): IMetricActions =>
        Object.fromEntries(
            Object.entries(row).map(([key, value]) => [key, value * count]),
        ) as unknown as IMetricActions;
    const aggregateHealth = { ...health, damageByResolution: { ...health.damageByResolution } };
    for (const key of Object.keys(aggregateHealth) as (keyof IMetricHealth)[]) {
        if (key === "damageByResolution")
            for (const channel of Object.keys(aggregateHealth[key]) as (keyof IMetricHealth["damageByResolution"])[])
                aggregateHealth[key][channel] *= count;
        else aggregateHealth[key] *= count;
    }
    return {
        version: 1,
        window: 20,
        mode: "ranked",
        gamesConsidered: 20,
        recordedGames: count,
        missingGames: 20 - count,
        minimumVersatilityGames: 5,
        stylePct,
        versatility: count < 5 ? null : Math.round((100 * distance) / pairs),
        uniqueCreatures: new Set(recent.flatMap((row) => row.player.army.map((entry) => entry.creatureId))).size,
        human: scaleActions(human),
        automated: scaleActions(automated),
        health: aggregateHealth,
        humanChoices: Object.fromEntries(
            Object.entries(humanChoices).map(([key, value]) => [key, value * count]),
        ) as typeof humanChoices,
        automatedChoices: { attack: 2 * count, support: 0, move: 0, hold: 0, utility: 0 },
        damageCoverage: "Mock data",
        recent,
    };
}
