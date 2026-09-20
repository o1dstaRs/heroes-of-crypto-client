import { SynergyKeysToPower } from "@heroesofcrypto/common";

import { SYNERGY_NAME_TO_DESCRIPTION } from "./SynergiesConstants";

/**
 * A synergy's whole ladder — what it gives at level 1, 2 and 3 — so a tooltip can show the number in force
 * AND the two the army is drafting towards, instead of only the one it happens to have now.
 *
 * The numbers are the engine's own (SynergyKeysToPower); the units come from the sentence that describes the
 * synergy, so "{}%" prints a percentage and "{} cells" does not, without a second table to keep in step.
 */

export interface SynergyLadderRow {
    /** Which of the synergy's numbers this row follows. Empty when it carries only one. */
    label: string;
    /** Level 1, 2 and 3, already carrying the unit the sentence gives them; "—" for a level with no value. */
    values: string[];
}

export const SYNERGY_LEVELS = [1, 2, 3] as const;

/** The text between one placeholder and the next: what tells us the unit and what the number is for. */
const tailAfterPlaceholder = (template: string, index: number): string => template.split("{}")[index + 1] ?? "";

/** "…by {}% at…" gives the value a percent sign; "…+{} morale…" leaves it bare. */
const unitFor = (template: string, index: number): string =>
    tailAfterPlaceholder(template, index).startsWith("%") ? "%" : "";

/**
 * What this number is, taken from the word the sentence puts right after it ("morale", "luck").
 *
 * Only used when a synergy carries more than one number, which is exactly where two bare ladders would be
 * unreadable — and where the sentence always names them.
 */
const labelFor = (template: string, index: number): string =>
    tailAfterPlaceholder(template, index)
        .replace(/^%/, "")
        .trim()
        .match(/^[A-Za-z]+/)?.[0] ?? "";

/**
 * One row per number the synergy gives, each with its level 1 / 2 / 3 values.
 *
 * `variant` is the 1-or-2 of the faction's pair, the same one the image and description keys carry.
 */
export const synergyLadder = (faction: string, variant: number | string): SynergyLadderRow[] => {
    const template = (SYNERGY_NAME_TO_DESCRIPTION as Record<string, string>)[`${faction}:${variant}:1`] ?? "";
    const count = template.split("{}").length - 1;
    if (count <= 0) {
        return [];
    }
    return Array.from({ length: count }, (_, index) => ({
        label: count > 1 ? labelFor(template, index) : "",
        values: SYNERGY_LEVELS.map((level) => {
            const power = (SynergyKeysToPower as Record<string, number[]>)[`${faction}:${variant}:${level}`]?.[index];
            return power === undefined ? "—" : `${power}${unitFor(template, index)}`;
        }),
    }));
};

/** The sentence with its placeholders filled at one level: "Flying units get +24% of additional armor". */
export const synergyEffectAtLevel = (faction: string, variant: number | string, level: number): string => {
    const key = `${faction}:${variant}:${Math.min(Math.max(level, 1), 3)}`;
    const template = (SYNERGY_NAME_TO_DESCRIPTION as Record<string, string>)[key] ?? "";
    const powers = (SynergyKeysToPower as Record<string, number[]>)[key] ?? [];
    let index = 0;
    return template.replace(/\{\}/g, () => {
        const value = powers[index];
        index += 1;
        return value === undefined ? "—" : `${value}`;
    });
};

/** How many units of a faction the army needs for the next level, and which level that is; null at the top. */
export const synergyNextLevel = (units: number, unitsPerLevel = 2): { level: number; unitsAway: number } | null => {
    const level = Math.min(Math.floor(units / unitsPerLevel), 3);
    if (level >= 3) {
        return null;
    }
    return { level: level + 1, unitsAway: (level + 1) * unitsPerLevel - units };
};
