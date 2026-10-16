/**
 * Season prizes on the public site: where the rules page lives, and the one number it publishes.
 *
 * There is no live endpoint behind this page — the prize rules are fixed text (owner answers of 18 Sep):
 * places come from the GOLD table, the season's main result; a player needs finished calibration and exactly
 * one wallet no other account has ever held; the list is provisional for three days, and one named admin
 * approves it. A season's own prize standing travels with its results (see season-results-client.ts), and
 * the prizes themselves are held by the season's smart contract — the game never sends tokens.
 */

/** How long a prize list stays provisional, in days. Mirrors the server's config.integrity.prizeReviewMs. */
export const PRIZE_REVIEW_DAYS = 3;

export const prizeRulesPath = (language: "en" | "ru"): string => `${language === "ru" ? "/ru" : ""}/rules/prizes/`;
