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
}

/** Separate blows, with one retaliation between them. A dying responder acts before the fatal blow. */
export function orderCombatExchange(
    primary: readonly CombatExchangeStrike[],
    response?: CombatExchangeStrike,
): CombatExchangeStrike[] {
    if (!primary.length) return [];
    const responseFirst = !!response && primary[0].lethal && primary[0].targetId === response.attackerId;
    const ordered = responseFirst
        ? [response!, ...primary]
        : [primary[0], ...(response ? [response] : []), ...primary.slice(1)];
    const dead = new Set<string>();
    const result: CombatExchangeStrike[] = [];
    for (const strike of ordered) {
        if (dead.has(strike.targetId)) continue;
        // The initial blow remains simultaneous in a mutually lethal first exchange.
        if (dead.has(strike.attackerId) && !(responseFirst && strike === primary[0])) continue;
        result.push(strike);
        if (strike.lethal) dead.add(strike.targetId);
    }
    return result;
}
