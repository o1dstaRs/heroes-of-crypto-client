import type { GameEvent } from "@heroesofcrypto/common";

/** Authoritative applications include recasts; merely opening the book never triggers a pop. */
export function empowerAppliedUnitIds(events: readonly GameEvent[] | undefined): string[] {
    const recipients = new Set<string>();
    for (const event of events ?? []) {
        if (event.type !== "effects_applied") continue;
        for (const application of event.applications) {
            if (application.name === "Empower" && application.kind === "buff" && !application.resisted)
                recipients.add(application.unitId);
        }
    }
    return [...recipients];
}
