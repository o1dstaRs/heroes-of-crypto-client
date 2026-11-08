/** A visual strike describes already-resolved combat; it never applies damage to the engine. */
export interface CombatExchangeStrike {
    attackerId: string;
    targetId: string;
    amount: number;
    unitsDied: number;
    lethal: boolean;
    response: boolean;
    hitIndex: number;
    position?: { x: number; y: number };

    missed?: boolean;
}

/**
 * INTENDED COMBAT TIMING: the opening blow and its recorded response share one presentation group.
 * Never serialize them, including lethal exchanges. Later blows wait for the entire opening group
 * (outgoing attacks and hit reactions), so neither a counterattack nor a second hit cancels a clip.
 * This is presentation of authoritative results, not a second damage calculation.
 */
export function groupCombatExchange(plan: readonly CombatExchangeStrike[]): CombatExchangeStrike[][] {
    if (!plan.length) return [];
    return [
        [plan[0], ...plan.slice(1).filter((strike) => strike.response)],
        ...plan
            .slice(1)
            .filter((strike) => !strike.response)
            .map((strike) => [strike]),
    ];
}

/** Preserve both sides of the first exchange, then omit later blows by or against a dead stack. */
export function orderCombatExchange(
    primary: readonly CombatExchangeStrike[],
    response?: CombatExchangeStrike,
): CombatExchangeStrike[] {
    if (!primary.length) return [];
    const ordered = [primary[0], ...(response ? [response] : []), ...primary.slice(1)];
    const dead = new Set<string>();
    const result: CombatExchangeStrike[] = [];
    for (const group of groupCombatExchange(ordered)) {
        const simultaneous = group.filter((strike) => !dead.has(strike.targetId) && !dead.has(strike.attackerId));
        result.push(...simultaneous);
        for (const strike of simultaneous) if (strike.lethal) dead.add(strike.targetId);
    }
    return result;
}
