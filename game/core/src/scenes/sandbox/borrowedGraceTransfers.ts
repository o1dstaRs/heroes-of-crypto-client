import type { GameEvent, IVisibleDamage } from "@heroesofcrypto/common";

export function borrowedGraceTransfers(damage?: IVisibleDamage, thiefId?: string) {
    const seen = new Set<string>();
    return (damage?.buffsStolen ?? []).filter((entry) => {
        if (!entry.buffName || entry.thiefId === entry.targetId || (thiefId && entry.thiefId !== thiefId)) return false;
        const key = JSON.stringify([entry.thiefId, entry.targetId, entry.buffName]);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

/** Snapshot diffs must not reveal a stolen buff before the painted theft sequence does. */
export function borrowedGraceBuffsByThief(events: readonly GameEvent[]): Map<string, Set<string>> {
    const result = new Map<string, Set<string>>();
    for (const event of events) {
        if (event.type !== "unit_attacked") continue;
        for (const transfer of borrowedGraceTransfers(event.damage)) {
            const names = result.get(transfer.thiefId) ?? new Set<string>();
            names.add(transfer.buffName);
            result.set(transfer.thiefId, names);
        }
    }
    return result;
}
