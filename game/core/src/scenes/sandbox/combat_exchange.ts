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

/** Present each strike and its reaction before starting the next recorded strike. */
export function groupCombatExchange(plan: readonly CombatExchangeStrike[]): CombatExchangeStrike[][] {
    if (!plan.length) return [];
    const first = plan[0];
    const responses = plan.slice(1).filter((strike) => strike.response);
    const response = responses[0];
    // Both opening blows are authoritative even when one combatant dies. Let the doomed
    // fighter finish its outgoing blow before showing the survivor's lethal answer.
    const dyingDefenderFirst =
        first.lethal &&
        response &&
        !response.lethal &&
        response.attackerId === first.targetId &&
        response.targetId === first.attackerId;
    const opening = dyingDefenderFirst ? [...responses, first] : [first, ...responses];
    return [...opening, ...plan.slice(1).filter((strike) => !strike.response)].map((strike) => [strike]);
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
    // Resolve availability from the engine’s simultaneous opening exchange, independently of presentation.
    const opening = [ordered[0], ...ordered.slice(1).filter((strike) => strike.response)];
    const groups = [
        opening,
        ...ordered
            .slice(1)
            .filter((strike) => !strike.response)
            .map((strike) => [strike]),
    ];
    for (const group of groups) {
        const simultaneous = group.filter((strike) => !dead.has(strike.targetId) && !dead.has(strike.attackerId));
        result.push(...simultaneous);
        for (const strike of simultaneous) if (strike.lethal) dead.add(strike.targetId);
    }
    return result;
}
