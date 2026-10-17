import type { IVisibleDamage } from "@heroesofcrypto/common";

/** Preserve the attacked target even if the physical blow killed it before the magical rider ran. */
export function chainLightningRecipients(damage?: IVisibleDamage) {
    if (!damage || damage.missed) return [];
    const hits = damage.secondary?.filter((entry) => entry.source === "chain_lightning" && entry.amount > 0) ?? [];
    if (!hits.length) return [];
    const points = [{ unitId: damage.unitId, position: damage.unitPosition }];
    const seen = new Set<string>(damage.unitId ? [damage.unitId] : []);
    for (const hit of hits) {
        if (seen.has(hit.unitId)) continue;
        seen.add(hit.unitId);
        if (!damage.unitId && hit.position.x === damage.unitPosition.x && hit.position.y === damage.unitPosition.y)
            continue;
        points.push({ unitId: hit.unitId, position: hit.position });
    }
    return points;
}
