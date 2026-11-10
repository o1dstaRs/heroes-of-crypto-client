import type { GameEvent } from "@heroesofcrypto/common";

export const MAGE_SPELL_FLAG_EFFECTS = {
    Misfortune: "mage_misfortune",
    "Fireforged Sword": "mage_fireforged",
} as const;
export type MageSpellFlagKind = (typeof MAGE_SPELL_FLAG_EFFECTS)[keyof typeof MAGE_SPELL_FLAG_EFFECTS];

/** Landed applications only: resisted casts and snapshot reconstruction never retrigger a pop. */
export function mageSpellFlagApplications(events: readonly GameEvent[] | undefined): {
    unitId: string;
    kind: MageSpellFlagKind;
}[] {
    const recipients = new Map<string, { unitId: string; kind: MageSpellFlagKind }>();
    for (const event of events ?? []) {
        if (event.type !== "effects_applied") continue;
        for (const application of event.applications) {
            const kind = Object.prototype.hasOwnProperty.call(MAGE_SPELL_FLAG_EFFECTS, application.name)
                ? MAGE_SPELL_FLAG_EFFECTS[application.name as keyof typeof MAGE_SPELL_FLAG_EFFECTS]
                : undefined;
            const expected = kind === "mage_misfortune" ? "debuff" : "buff";
            if (!kind || application.kind !== expected || application.resisted || !application.unitId) continue;
            recipients.set(`${application.unitId}:${kind}`, { unitId: application.unitId, kind });
        }
    }
    return [...recipients.values()];
}
