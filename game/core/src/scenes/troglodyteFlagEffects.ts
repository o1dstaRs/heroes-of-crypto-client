import type { GameEvent } from "@heroesofcrypto/common";

export type TroglodyteFlagKind = "blind_fury" | "miner" | "madness";

/** Only confirmed armor theft and explicitly attributed mind immunity are presented. */
export function troglodyteFlagApplications(
    events: readonly GameEvent[] | undefined,
): { unitId: string; kind: "miner" | "madness" }[] {
    const results = new Map<string, { unitId: string; kind: "miner" | "madness" }>();
    for (const event of events ?? []) {
        if (event.type !== "effects_applied") continue;
        for (const application of event.applications) {
            const kind =
                application.resisted && application.resistedBy === "Madness"
                    ? "madness"
                    : application.name === "Miner" && application.kind === "debuff" && !application.resisted
                      ? "miner"
                      : undefined;
            if (kind) results.set(`${application.unitId}:${kind}`, { unitId: application.unitId, kind });
        }
    }
    return [...results.values()];
}
