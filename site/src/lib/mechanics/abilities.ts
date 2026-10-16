import abilitiesJson from "@heroesofcrypto/common/src/configuration/abilities.json";

import { ABILITY_NOTES_A_L } from "./abilities-a-l";
import { ABILITY_NOTES_M_Z } from "./abilities-m-z";
import { renderNote, type NoteLanguage, type NoteSpec } from "./format";

export const ABILITY_NOTES: Readonly<Record<string, NoteSpec>> = { ...ABILITY_NOTES_A_L, ...ABILITY_NOTES_M_Z };

/** How the engine resolves an ability, with the numbers its configured power gives; undefined when unwritten. */
export const abilityNote = (name: string, language: NoteLanguage): string | undefined => {
    const raw = (abilitiesJson as unknown as Record<string, { power?: number | null }>)[name];
    return renderNote(ABILITY_NOTES[name], raw?.power ?? 0, language);
};
