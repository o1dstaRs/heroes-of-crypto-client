import type { GameEvent } from "@heroesofcrypto/common";

/** The aura's friendly buff is also named Stun; only the hostile applied debuff is a hit cue. */
export function stunRecipients(events: readonly GameEvent[] | undefined): string[] {
    const ids = new Set<string>();
    for (const event of events ?? []) {
        if (event.type !== "effects_applied") continue;
        for (const application of event.applications) {
            if (application.name === "Stun" && application.kind === "debuff" && !application.resisted)
                ids.add(application.unitId);
        }
    }
    return [...ids];
}
