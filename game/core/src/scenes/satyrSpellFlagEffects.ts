import type { GameEvent } from "@heroesofcrypto/common";

export const SATYR_SPELL_FLAG_EFFECTS = {
    Courage: "satyr_courage",
    "Helping Hand": "satyr_helping_hand",
} as const;

export type SatyrSpellFlagKind = (typeof SATYR_SPELL_FLAG_EFFECTS)[keyof typeof SATYR_SPELL_FLAG_EFFECTS];

export function satyrSpellFlagKind(name: string): SatyrSpellFlagKind | undefined {
    return Object.prototype.hasOwnProperty.call(SATYR_SPELL_FLAG_EFFECTS, name)
        ? SATYR_SPELL_FLAG_EFFECTS[name as keyof typeof SATYR_SPELL_FLAG_EFFECTS]
        : undefined;
}

/** Use landed applications so refreshes animate, while failed casts and snapshot rebuilds do not. */
export function satyrSpellFlagApplications(events: readonly GameEvent[] | undefined): {
    unitId: string;
    kind: SatyrSpellFlagKind;
}[] {
    const recipients = new Map<string, { unitId: string; kind: SatyrSpellFlagKind }>();
    for (const event of events ?? []) {
        if (event.type !== "effects_applied") continue;
        for (const application of event.applications) {
            const kind = satyrSpellFlagKind(application.name);
            if (!kind || application.kind !== "buff" || application.resisted || !application.unitId) continue;
            recipients.set(`${application.unitId}:${kind}`, { unitId: application.unitId, kind });
        }
    }
    return [...recipients.values()];
}
