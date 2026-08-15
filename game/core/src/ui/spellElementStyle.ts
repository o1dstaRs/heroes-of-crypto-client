import { SpellElement } from "@heroesofcrypto/common";

/**
 * How a spell's ELEMENT is presented on its spell-book card.
 *
 * The element is the one property of a spell that changes who it can even be aimed at — an element
 * cannot target the creature that IS it (no Ring of Fire on an Efreet, no Whirlpool on a Water Element)
 * and it swings damage by half again against its counter. That is worth more than another grey line of
 * body text, so each element gets its own colour and mark on the card.
 *
 * Colours are the ones the game already uses for these forces on the board, so a player reads "this is
 * fire" from the card the same way they read it from a Ring of Fire burning on the grid.
 */
export interface SpellElementStyle {
    label: string;
    /** Text colour for the element chip. */
    color: string;
    /** Soft background behind the chip, keyed to the same hue. */
    background: string;
    border: string;
    mark: string;
}

const STYLES: Readonly<Partial<Record<SpellElement, SpellElementStyle>>> = {
    [SpellElement.FIRE]: {
        label: "Fire",
        color: "#ff9d4d",
        background: "rgba(255, 122, 26, 0.14)",
        border: "rgba(255, 122, 26, 0.5)",
        mark: "🔥",
    },
    [SpellElement.WATER]: {
        label: "Water",
        color: "#6fc7ff",
        background: "rgba(56, 165, 255, 0.14)",
        border: "rgba(56, 165, 255, 0.5)",
        mark: "💧",
    },
    [SpellElement.AIR]: {
        label: "Air",
        color: "#d9d2ff",
        background: "rgba(180, 168, 255, 0.14)",
        border: "rgba(180, 168, 255, 0.5)",
        mark: "⚡",
    },
    [SpellElement.EARTH]: {
        label: "Earth",
        color: "#d3b07c",
        background: "rgba(168, 124, 62, 0.16)",
        border: "rgba(168, 124, 62, 0.5)",
        mark: "⛰️",
    },
};

/** The card presentation for a spell's element, or undefined for the elementless majority. */
export const spellElementStyle = (element?: SpellElement): SpellElementStyle | undefined =>
    element === undefined || element === SpellElement.NO_ELEMENT ? undefined : STYLES[element];
