import type { GameEvent } from "@heroesofcrypto/common";

/** Manual resurrection belongs to its caster; automatic resurrection belongs to its recipient. */
export function angelResurrectionActor(event: GameEvent): string | undefined {
    if (event.type === "unit_resurrected") return event.unitId;
    if (event.type === "spell_cast" && (event.resurrected?.length || /resurrect/i.test(event.spellName)))
        return event.casterId;
    return undefined;
}
