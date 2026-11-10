import type { GameEvent } from "@heroesofcrypto/common";

/** Wind Flow affects flying units on both teams; use landed applications, including refreshes. */
export function windFlowRecipients(events: readonly GameEvent[] | undefined): string[] {
    const ids = new Set<string>();
    for (const event of events ?? []) {
        if (event.type !== "effects_applied") continue;
        for (const application of event.applications) {
            if (
                application.name === "Wind Flow" &&
                application.kind === "buff" &&
                !application.resisted &&
                application.unitId
            ) {
                ids.add(application.unitId);
            }
        }
    }
    return [...ids];
}
