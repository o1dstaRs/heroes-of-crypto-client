import type { GameEvent } from "@heroesofcrypto/common/src/engine/events";

export function lastFuseDamageTaken(events: readonly GameEvent[] | undefined, unitId: string) {
    let amount = 0;
    let unitsDied = 0;
    for (const event of events ?? []) {
        if (event.type !== "pyre_exploded") continue;
        for (const hit of event.hits) {
            if (hit.unitId !== unitId) continue;
            amount += hit.amount;
            unitsDied += hit.unitsDied;
        }
    }
    return { amount, unitsDied };
}
