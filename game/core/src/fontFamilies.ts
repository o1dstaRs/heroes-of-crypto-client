/** One game-wide face for both letters and digits in React and Pixi text. */
export const HOC_GAME_FONT_FAMILY = '"HoC Forge", Georgia, "Times New Roman", serif';

// Compatibility aliases keep existing call sites stable while ensuring that every former numeric-only
// stack now resolves to the same complete face instead of mixing old letters with new digits.
export const HOC_NUMERIC_FONT_FAMILY = HOC_GAME_FONT_FAMILY;
export const HOC_NUMERIC_ARIAL_FONT_FAMILY = HOC_GAME_FONT_FAMILY;
export const HOC_NUMERIC_GEORGIA_FONT_FAMILY = HOC_GAME_FONT_FAMILY;
export const HOC_NUMERIC_DIGITAL_FONT_FAMILY = HOC_GAME_FONT_FAMILY;
