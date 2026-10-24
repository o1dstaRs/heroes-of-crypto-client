import type { GameEvent } from "@heroesofcrypto/common";

/** Follow the landed recipient, including absorption and reflection, rather than the aimed-at unit. */
export function hamstringRecipients(events: readonly GameEvent[] | undefined): string[] {
    const ids = new Set<string>();
    for (const event of events ?? []) {
        if (event.type !== "effects_applied") continue;
        for (const application of event.applications) {
            if (
                application.name === "Hamstrung" &&
                application.kind === "debuff" &&
                !application.resisted &&
                application.unitId
            )
                ids.add(application.unitId);
        }
    }
    return [...ids];
}
