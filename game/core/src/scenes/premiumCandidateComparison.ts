import type { IEnumeratedCandidate } from "@heroesofcrypto/common";

const mainAttack = (candidate: IEnumeratedCandidate) =>
    candidate.actions.filter((action) => action.type !== "end_turn" && action.type !== "select_attack_type").at(-1);

export const hasClearPremiumAttackAdvantage = (
    preferred: IEnumeratedCandidate,
    alternative: IEnumeratedCandidate,
): boolean => {
    if (preferred.kind !== "incumbent") return false;
    const best = mainAttack(preferred);
    const other = mainAttack(alternative);
    if (
        !best ||
        !other ||
        (best.type !== "melee_attack" && best.type !== "range_attack") ||
        best.type !== other.type ||
        !("attackerId" in other) ||
        best.attackerId !== other.attackerId
    )
        return false;
    const target = preferred.targetId ?? best.targetId;
    if (!target || target !== (alternative.targetId ?? ("targetId" in other ? other.targetId : undefined)))
        return false;
    if (
        best.type === "melee_attack" &&
        other.type === "melee_attack" &&
        (best.attackFrom.x !== other.attackFrom.x || best.attackFrom.y !== other.attackFrom.y)
    )
        return false;
    for (const hazard of ["hasLavaCell", "hasWaterCell"] as const) {
        const crosses = (candidate: IEnumeratedCandidate) =>
            candidate.actions.some((action) =>
                hazard === "hasLavaCell"
                    ? "hasLavaCell" in action && action.hasLavaCell
                    : "hasWaterCell" in action && action.hasWaterCell,
            );
        if (crosses(preferred) && !crosses(alternative)) return false;
    }
    const a = preferred.features;
    const b = alternative.features;
    for (const cost of ["spendsRangeShot", "spendsSpellCharge", "burnsResurrectionCharge", "hourglassSpent"] as const) {
        if (!Number.isFinite(a[cost]) || !Number.isFinite(b[cost]) || a[cost] > b[cost]) return false;
    }
    for (const benefit of ["moraleDelta", "luckDelta", "expectedKill"] as const) {
        if (!Number.isFinite(a[benefit]) || !Number.isFinite(b[benefit]) || a[benefit] < b[benefit]) return false;
    }
    if (best.type === "range_attack") {
        const shot = preferred.shotFeatures;
        const comparison = alternative.shotFeatures;
        if (!shot || !comparison) return false;
        for (const value of ["enemyDamage", "friendlyFireDamage", "primaryTargetDamage"] as const) {
            if (
                !Number.isFinite(shot[value]) ||
                !Number.isFinite(comparison[value]) ||
                shot[value] < 0 ||
                comparison[value] < 0
            )
                return false;
        }
        if (
            shot.friendlyFireDamage > comparison.friendlyFireDamage ||
            shot.enemyDamage < comparison.enemyDamage ||
            shot.primaryTargetDamage < comparison.primaryTargetDamage
        )
            return false;
    }
    return (
        Number.isFinite(a.expectedDamage) &&
        Number.isFinite(b.expectedDamage) &&
        a.expectedDamage > 0 &&
        a.expectedDamage - b.expectedDamage >= Math.max(25, Math.abs(b.expectedDamage) * 0.5)
    );
};
