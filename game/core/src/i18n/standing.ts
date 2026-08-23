import { t } from "./i18n";

/** The richest third of a league — its name is a noun, so it trails the league name. */
export const TOP_WEALTH = 3;

/**
 * A ranked standing as one label: the player's gold third joined to their league. The two lower
 * tiers are adjectives and lead ("Ragged Aspirant", "Stacked Marshal"); the top tier is a noun and
 * trails ("Demigod Whale") — the natural order in Russian too ("Маршал Кит").
 *
 * Both halves arrive from the server already rendered in English (its LEAGUE_NAMES / WEALTH_NAMES
 * tables), so each is localized on its own through the dictionary; an unknown value passes through
 * as-is. Players still in calibration have no league cohort: they carry tier 0 and read as the bare
 * league name ("Unranked"), never as a wealth standing.
 */
export const standingLabel = (wealth: number, wealthName: string, leagueName: string): string => {
    const league = leagueName ? t(leagueName) : "";
    const tier = wealthName ? t(wealthName) : "";
    if (!league) {
        return tier;
    }
    if (!tier) {
        return league;
    }
    return wealth === TOP_WEALTH ? `${league} ${tier}` : `${tier} ${league}`;
};
