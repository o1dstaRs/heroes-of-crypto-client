import type { GameEvent } from "@heroesofcrypto/common";

export function terrifyingGazeRecipients(events: readonly GameEvent[] | undefined): Set<string> {
    const ids = new Set<string>();
    for (const event of events ?? []) {
        if (event.type !== "effects_applied") continue;
        for (const application of event.applications) {
            if (application.name === "Terrifying Gaze" && application.kind !== "buff" && !application.resisted) {
                ids.add(application.unitId);
            }
        }
    }
    return ids;
}
