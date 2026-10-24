import type { GameEvent } from "@heroesofcrypto/common";

/** Event-driven so an existing armor debuff can visibly gain another stack. */
export function shatterArmorRecipients(events: readonly GameEvent[] | undefined): string[] {
    const ids = new Set<string>();
    for (const event of events ?? []) {
        if (event.type !== "effects_applied") continue;
        for (const application of event.applications) {
            if (application.name === "Shatter Armor" && application.kind === "debuff" && !application.resisted) {
                ids.add(application.unitId);
            }
        }
    }
    return [...ids];
}
