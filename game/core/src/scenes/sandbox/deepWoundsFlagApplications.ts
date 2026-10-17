export type DeepWoundsVisualLevel = 1 | 2 | 3;
type WoundSource = Readonly<{ id: string; abilities: readonly string[] }>;

/** Cut count follows the source card, never the victim's cumulative damage multiplier. */
export function deepWoundsVisualLevel(abilities: readonly string[]): DeepWoundsVisualLevel {
    for (const level of [3, 2, 1] as const) {
        if (abilities.includes(`Deep Wounds Level ${level}`)) return level;
    }
    // The legacy level-zero card uses the same one-cut family as its static icon.
    return 1;
}

/** One flag pop per affected creature in an exchange, including the attacker's retaliation wound. */
export function deepWoundsFlagApplications(
    wounds: readonly Readonly<{ unitId: string; power: number }>[] | undefined,
    attacker: WoundSource,
    responder?: WoundSource,
): { unitId: string; level: DeepWoundsVisualLevel }[] {
    const recipients = new Map<string, DeepWoundsVisualLevel>();
    for (const wound of wounds ?? []) {
        if (!wound.unitId || !Number.isFinite(wound.power) || wound.power <= 0) continue;
        const source = wound.unitId === attacker.id ? responder : attacker;
        recipients.set(wound.unitId, deepWoundsVisualLevel(source?.abilities ?? []));
    }
    return Array.from(recipients, ([unitId, level]) => ({ unitId, level }));
}
