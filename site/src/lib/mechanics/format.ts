/**
 * "How it works" notes: what the fight engine actually does with an ability, spell, artifact or status
 * effect, in the words a player needs. The game's own card text is a one-line summary; these notes carry the
 * scaling, the triggers and the exceptions, each checked against the engine (common) rather than the card.
 *
 * Numbers come from the same configuration the engine reads, so a rebalance moves the notes with it. A note
 * is a pair of functions rather than a template so each language can phrase the arithmetic naturally.
 */

export type NoteLanguage = "en" | "ru";

/** Formats an engine number the way a player reads it: 3.6, 0.2, 35 — with a decimal comma in Russian. */
export const formatNumber = (value: number, language: NoteLanguage): string => {
    const text = String(Number(value.toFixed(2)));
    return language === "ru" ? text.replace(".", ",") : text;
};

export interface NoteContext {
    /** The configured power of the thing the note describes (0 when it has none). */
    p: number;
    /** Number formatter for the note's language. */
    n: (value: number) => string;
}

export interface NoteSpec {
    en: (context: NoteContext) => string;
    ru: (context: NoteContext) => string;
}

export const renderNote = (spec: NoteSpec | undefined, power: number, language: NoteLanguage): string | undefined =>
    spec?.[language]({ p: power, n: (value) => formatNumber(value, language) });
