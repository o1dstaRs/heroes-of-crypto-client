/** How long a prize list stays provisional, in days. Mirrors the server's config.integrity.prizeReviewMs. */
export const PRIZE_REVIEW_DAYS = 3;

export const prizeRulesPath = (language: "en" | "ru"): string => `${language === "ru" ? "/ru" : ""}/rules/prizes/`;
