import type { GameEvent } from "@heroesofcrypto/common";

export const OGRE_SPELL_FLAG_EFFECTS = {
    Riot: "ogre_riot",
    "Magic Mirror": "ogre_magic_mirror",
    "Mass Riot": "ogre_riot",
    "Mass Magic Mirror": "ogre_magic_mirror",
} as const;

export type OgreSpellFlagKind = (typeof OGRE_SPELL_FLAG_EFFECTS)[keyof typeof OGRE_SPELL_FLAG_EFFECTS];

export function ogreSpellFlagKind(name: string): OgreSpellFlagKind | undefined {
    return Object.prototype.hasOwnProperty.call(OGRE_SPELL_FLAG_EFFECTS, name)
        ? OGRE_SPELL_FLAG_EFFECTS[name as keyof typeof OGRE_SPELL_FLAG_EFFECTS]
        : undefined;
}

/** Successful applications include refreshes; neither cast intent nor snapshot diffs do. */
export function ogreSpellFlagApplications(events: readonly GameEvent[] | undefined): {
    unitId: string;
    kind: OgreSpellFlagKind;
}[] {
    const recipients = new Map<string, { unitId: string; kind: OgreSpellFlagKind }>();
    for (const event of events ?? []) {
        if (event.type !== "effects_applied") continue;
        for (const application of event.applications) {
            const kind = ogreSpellFlagKind(application.name);
            if (!kind || application.kind !== "buff" || application.resisted) continue;
            recipients.set(`${application.unitId}:${kind}`, { unitId: application.unitId, kind });
        }
    }
    return [...recipients.values()];
}
