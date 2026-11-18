export const DEFAULT_PICK_STAT_ORDER = [
    "health",
    "damage",
    "attack",
    "movement",
    "armor",
    "magicResist",
    "shotDistance",
    "shots",
    "initiative",
    "size",
] as const;
export type PickStatId = (typeof DEFAULT_PICK_STAT_ORDER)[number];
export const PICK_STAT_LABELS: Record<PickStatId, string> = {
    health: "Здоровье",
    damage: "Урон",
    attack: "Атака",
    shotDistance: "Дальность",
    shots: "Боезапас",
    armor: "Броня",
    magicResist: "Маг. защита",
    size: "Размер",
    initiative: "Инициатива",
    movement: "Движение",
};
export const PICK_STAT_ORDER_KEY = "hoc.pick.stat-order.v1";
export const PICK_STAT_ORDER_ENDPOINT = "/__hoc-dev/pick-stat-order";

export function validatePickStatOrder(value: unknown): PickStatId[] {
    if (
        !Array.isArray(value) ||
        value.length !== DEFAULT_PICK_STAT_ORDER.length ||
        new Set(value).size !== value.length ||
        value.some((id) => !DEFAULT_PICK_STAT_ORDER.includes(id))
    ) {
        throw new Error("Invalid stat order");
    }
    return [...value];
}

export function swapPickStats(order: readonly PickStatId[], first: PickStatId, second: PickStatId): PickStatId[] {
    const next = [...order];
    const a = next.indexOf(first),
        b = next.indexOf(second);
    if (a >= 0 && b >= 0) [next[a], next[b]] = [next[b], next[a]];
    return next;
}
