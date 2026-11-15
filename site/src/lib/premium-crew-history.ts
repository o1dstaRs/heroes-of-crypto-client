import type { PremiumCatalog, PremiumRow } from "./premium-library";

export const CREW_HISTORY_MINIMUM = 50;
export interface CrewHistoryGroup {
    contextUnits: number[];
    opponentUnits?: number[];
    rows: PremiumRow[];
}
export interface PremiumCrewHistory {
    schema: "hoc-premium-crew-history-v1";
    snapshotId: string;
    sourceSha256: string;
    partition: "train";
    cohort: string;
    map: string;
    ownUnits: number[];
    enemyUnits?: number[];
    minimumFamilies: number;
    slots: (CrewHistoryGroup & { slot: number })[];
    artifacts: (CrewHistoryGroup & { tier: number })[];
    synergies: CrewHistoryGroup;
    synergiesByFaction?: (CrewHistoryGroup & { faction: string; level: number })[];
}

/** The same family-level confidence order as the SQLite library; no game-policy weights. */
export function compareCrewHistory(a?: PremiumRow, b?: PremiumRow): number {
    return (
        Number((b?.families ?? 0) >= CREW_HISTORY_MINIMUM) - Number((a?.families ?? 0) >= CREW_HISTORY_MINIMUM) ||
        Number(Boolean(b)) - Number(Boolean(a)) ||
        (b?.interval[0] ?? 0) - (a?.interval[0] ?? 0) ||
        (b?.families ?? 0) - (a?.families ?? 0) ||
        (b?.score ?? 0) - (a?.score ?? 0) ||
        (a?.key ?? "").localeCompare(b?.key ?? "")
    );
}

/** Reject responses from another crew, snapshot, environment or invalid statistical rows. */
export function validCrewHistory(
    value: unknown,
    expected: Pick<PremiumCrewHistory, "snapshotId" | "sourceSha256" | "cohort" | "map" | "ownUnits" | "enemyUnits">,
    catalog: PremiumCatalog,
): value is PremiumCrewHistory {
    if (!value || typeof value !== "object") return false;
    const data = value as PremiumCrewHistory;
    if (
        data.schema !== "hoc-premium-crew-history-v1" ||
        data.partition !== "train" ||
        data.minimumFamilies !== CREW_HISTORY_MINIMUM ||
        data.snapshotId !== expected.snapshotId ||
        data.sourceSha256 !== expected.sourceSha256 ||
        data.cohort !== expected.cohort ||
        data.map !== expected.map ||
        JSON.stringify(data.ownUnits) !== JSON.stringify(expected.ownUnits) ||
        JSON.stringify(data.enemyUnits ?? []) !== JSON.stringify(expected.enemyUnits ?? []) ||
        !Array.isArray(data.slots) ||
        data.slots.length !== 6 ||
        !Array.isArray(data.artifacts) ||
        data.artifacts.length !== 2
    )
        return false;
    const group = (item: CrewHistoryGroup, arity: number) => {
        if (
            !item ||
            !Array.isArray(item.contextUnits) ||
            !Array.isArray(item.rows) ||
            item.rows.length > 256 ||
            new Set(item.contextUnits).size !== item.contextUnits.length ||
            item.contextUnits.some((id) => !expected.ownUnits.includes(id)) ||
            (item.opponentUnits !== undefined &&
                (!Array.isArray(item.opponentUnits) ||
                    new Set(item.opponentUnits).size !== item.opponentUnits.length ||
                    item.opponentUnits.some((id) => !expected.enemyUnits?.includes(id))))
        )
            return false;
        return (
            new Set(item.rows.map((row) => row?.key)).size === item.rows.length &&
            item.rows.every(
                (row) =>
                    row &&
                    typeof row.key === "string" &&
                    Array.isArray(row.ids) &&
                    row.ids.length === arity &&
                    row.ids.every((id) => Number.isSafeInteger(id) && id > 0) &&
                    Number.isSafeInteger(row.families) &&
                    row.families > 0 &&
                    Number.isSafeInteger(row.observations) &&
                    row.observations >= row.families &&
                    Number.isFinite(row.score) &&
                    row.score >= 0 &&
                    row.score <= 1 &&
                    Array.isArray(row.interval) &&
                    row.interval.length === 2 &&
                    row.interval.every(Number.isFinite) &&
                    row.interval[0] >= 0 &&
                    row.interval[0] <= row.score &&
                    row.interval[1] >= row.score &&
                    row.interval[1] <= 1 &&
                    Number.isFinite(row.frequency) &&
                    row.frequency >= 0 &&
                    row.frequency <= 1,
            )
        );
    };
    const remaining = [...expected.ownUnits];
    const slots = [1, 1, 2, 2, 3, 4].map((level) => {
        const index = remaining.findIndex((id) => catalog.units[id]?.level === level);
        return index < 0 ? undefined : remaining.splice(index, 1)[0];
    });
    return (
        data.slots.every(
            (item, index) =>
                item.slot === index &&
                group(item, 1) &&
                !item.contextUnits.includes(slots[index]!) &&
                item.rows.every(
                    (row) =>
                        catalog.units[row.ids[0]]?.kit?.amount &&
                        catalog.units[row.ids[0]].level === [1, 1, 2, 2, 3, 4][index],
                ),
        ) &&
        data.artifacts.every(
            (item, index) =>
                item.tier === index + 1 &&
                group(item, 1) &&
                item.rows.every((row) => Boolean(catalog.artifacts[`${item.tier}:${row.ids[0]}`])),
        ) &&
        group(data.synergies, 3) &&
        (data.synergiesByFaction === undefined ||
            (Array.isArray(data.synergiesByFaction) &&
                data.synergiesByFaction.length === 4 &&
                new Set(data.synergiesByFaction.map((item) => item?.faction)).size === 4 &&
                data.synergiesByFaction.every((item) => {
                    const code = ({ Life: 4, Nature: 3, Chaos: 1, Might: 2 } as Record<string, number>)[item?.faction];
                    const level = Math.min(
                        3,
                        Math.floor(
                            expected.ownUnits.filter((id) => catalog.units[id]?.faction === item?.faction).length / 2,
                        ),
                    );
                    return (
                        Boolean(code) &&
                        item.level === level &&
                        group(item, 3) &&
                        item.rows.every(
                            (row) => row.ids[0] === code && [1, 2].includes(row.ids[1]) && row.ids[2] === level,
                        )
                    );
                })))
    );
}
