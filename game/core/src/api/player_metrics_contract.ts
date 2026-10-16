export const STYLE_AXES = ["melee", "ranged", "magic", "area", "flying", "support"] as const;
export type StyleAxis = (typeof STYLE_AXES)[number];
export type MetricMode = "ranked" | "custom" | "practice";
export type ArmyStyle = Record<StyleAxis, number>;
export interface IMetricArmyEntry {
    creatureId: number;
    amount: number;
    experience: number;
    roles: StyleAxis[];
}
export interface IMetricActions {
    turns: number;
    attacks: number;
    offensiveSpells: number;
    supportSpells: number;
    utilitySpells: number;
    moves: number;
    advances: number;
    waits: number;
    defends: number;
    skips: number;
    timeouts: number;
    forcedSkips: number;
}
export interface IMetricHealth {
    damageDealtHp: number;
    damageReceivedHp: number;
    damageReceivedWithoutSourceHp: number;
    friendlyDamageHp: number;
    multiTargetDamageHp: number;
    healingReceivedHp: number;
    healingDoneHp: number;
    resurrectionReceivedHp: number;
    resurrectionDoneHp: number;
    regenerationHp: number;
    resurrectedUnits: number;
    damageByResolution: { melee: number; ranged: number; spell: number; other: number };
}
export interface IMetricChoices {
    attack: number;
    support: number;
    move: number;
    hold: number;
    utility: number;
}
export interface IPlayerGameMetrics {
    playerId: string;
    team: number;
    army: IMetricArmyEntry[];
    style: ArmyStyle;
    human: IMetricActions;
    automated: IMetricActions;
    systemTurns: number;
    humanChoices: IMetricChoices;
    automatedChoices: IMetricChoices;
    health: IMetricHealth;
    healingHp: number;
    resurrectedUnits: number;
    resurrectionHp: number;
    reportedDamage: { melee: number; ranged: number; spell: number; multiTarget: number };
    damageByCreature: { unitName: string; damage: number }[];
    artifacts: { tier: number; id: number }[];
    augments: { kind: number; level: number }[];
    doctrine: number;
}
export type PlayerMetricsMode = MetricMode | "all";
export interface PlayerMetricsSummary {
    version: 1;
    window: number;
    mode: PlayerMetricsMode;
    gamesConsidered: number;
    recordedGames: number;
    missingGames: number;
    minimumVersatilityGames: number;
    stylePct: ArmyStyle | null;
    versatility: number | null;
    uniqueCreatures: number | null;
    human: IMetricActions | null;
    automated: IMetricActions | null;
    health: IMetricHealth | null;
    humanChoices: IMetricChoices | null;
    automatedChoices: IMetricChoices | null;
    damageCoverage: string;
    recent: Array<{
        gameId: string;
        finishedTime: number;
        winnerTeam: number;
        mode: MetricMode;
        map: number;
        balanceVersion: string;
        player: IPlayerGameMetrics;
    }>;
}
const record = (value: unknown): Record<string, unknown> | null =>
    value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
const count = (value: unknown): value is number =>
    typeof value === "number" && Number.isFinite(value) && value >= 0 && Number.isInteger(value);
const bounded = (value: unknown, max: number): value is number =>
    typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max;
const actionKeys = [
    "turns",
    "attacks",
    "offensiveSpells",
    "supportSpells",
    "utilitySpells",
    "moves",
    "advances",
    "waits",
    "defends",
    "skips",
    "timeouts",
    "forcedSkips",
] as const;
const actions = (value: unknown): value is IMetricActions => {
    const row = record(value);
    return !!row && actionKeys.every((key) => count(row[key]));
};
const healthKeys = [
    "damageDealtHp",
    "damageReceivedHp",
    "damageReceivedWithoutSourceHp",
    "friendlyDamageHp",
    "multiTargetDamageHp",
    "healingReceivedHp",
    "healingDoneHp",
    "resurrectionReceivedHp",
    "resurrectionDoneHp",
    "regenerationHp",
    "resurrectedUnits",
] as const;
const choices = (value: unknown): value is IMetricChoices => {
    const row = record(value);
    return !!row && ["attack", "support", "move", "hold", "utility"].every((key) => count(row[key]));
};
const health = (value: unknown): value is IMetricHealth => {
    const row = record(value);
    const resolution = record(row?.damageByResolution);
    return (
        !!row &&
        healthKeys.every((key) => bounded(row[key], Number.MAX_SAFE_INTEGER)) &&
        !!resolution &&
        ["melee", "ranged", "spell", "other"].every((key) => bounded(resolution[key], Number.MAX_SAFE_INTEGER))
    );
};
export const normalizePlayerMetrics = (value: unknown): PlayerMetricsSummary | null => {
    const row = record(value);
    if (!row || row.version !== 1 || !["ranked", "custom", "practice", "all"].includes(String(row.mode))) return null;
    if (
        !["window", "gamesConsidered", "recordedGames", "missingGames", "minimumVersatilityGames"].every((key) =>
            count(row[key]),
        )
    )
        return null;
    if (
        row.window !== 20 ||
        Number(row.gamesConsidered) > 20 ||
        Number(row.recordedGames) + Number(row.missingGames) !== row.gamesConsidered
    )
        return null;
    const style = record(row.stylePct);
    if (row.stylePct !== null && (!style || !STYLE_AXES.every((axis) => bounded(style[axis], 100.00001)))) return null;
    if (row.versatility !== null && !bounded(row.versatility, 100)) return null;
    if (row.uniqueCreatures !== null && !count(row.uniqueCreatures)) return null;
    if (row.human !== null && !actions(row.human)) return null;
    if (row.automated !== null && !actions(row.automated)) return null;
    if (row.health !== null && !health(row.health)) return null;
    if (row.humanChoices !== null && !choices(row.humanChoices)) return null;
    if (row.automatedChoices !== null && !choices(row.automatedChoices)) return null;
    if (typeof row.damageCoverage !== "string" || !Array.isArray(row.recent) || row.recent.length !== row.recordedGames)
        return null;
    if (
        !row.recent.every((value) => {
            const sample = record(value);
            const player = record(sample?.player);
            const sampleStyle = record(player?.style);
            return (
                !!sample &&
                typeof sample.gameId === "string" &&
                bounded(sample.finishedTime, Number.MAX_SAFE_INTEGER) &&
                bounded(sample.winnerTeam, 2) &&
                ["ranked", "custom", "practice"].includes(String(sample.mode)) &&
                count(sample.map) &&
                typeof sample.balanceVersion === "string" &&
                !!player &&
                typeof player.playerId === "string" &&
                (player.team === 1 || player.team === 2) &&
                !!sampleStyle &&
                STYLE_AXES.every((axis) => bounded(sampleStyle[axis], 1.0000001)) &&
                health(player.health) &&
                choices(player.humanChoices) &&
                choices(player.automatedChoices) &&
                actions(player.human) &&
                actions(player.automated) &&
                Array.isArray(player.army) &&
                Array.isArray(player.artifacts) &&
                Array.isArray(player.augments) &&
                Array.isArray(player.damageByCreature) &&
                !!record(player.reportedDamage) &&
                count(player.systemTurns) &&
                count(player.doctrine) &&
                count(player.resurrectedUnits) &&
                bounded(player.healingHp, Number.MAX_SAFE_INTEGER) &&
                bounded(player.resurrectionHp, Number.MAX_SAFE_INTEGER)
            );
        })
    )
        return null;
    return row as unknown as PlayerMetricsSummary;
};
