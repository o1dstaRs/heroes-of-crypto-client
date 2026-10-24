import type { Unit } from "@heroesofcrypto/common";

interface Casualty {
    unitId: string;
    amount: number;
    unitsDied: number;
    missed?: boolean;
}

/** Whole enemy stacks destroyed directly by one ranged action, across all of its throws. */
export function cyclopsMultiKillTargets(
    attacker: Pick<Unit, "getName" | "getTeam">,
    waves: readonly (readonly Casualty[])[],
    amountsBefore: ReadonlyMap<string, number>,
    deadIds: ReadonlySet<string>,
    units: ReadonlyMap<string, Pick<Unit, "getTeam">>,
): ReadonlySet<string> {
    const killed = new Set<string>();
    if (attacker.getName() !== "Cyclops") return killed;
    const remaining = new Map(amountsBefore);
    for (const wave of waves) {
        for (const hit of wave) {
            if (hit.missed || hit.amount <= 0 || hit.unitsDied <= 0) continue;
            const before = remaining.get(hit.unitId);
            if (before === undefined || before <= 0) continue;
            const after = Math.max(0, before - hit.unitsDied);
            remaining.set(hit.unitId, after);
            const victim = units.get(hit.unitId);
            if (after === 0 && deadIds.has(hit.unitId) && victim && victim.getTeam() !== attacker.getTeam()) {
                killed.add(hit.unitId);
            }
        }
    }
    return killed.size > 1 ? killed : new Set();
}
