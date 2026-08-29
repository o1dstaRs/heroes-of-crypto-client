const LEAGUE_EMBLEM_FILENAMES = [
    "league_calibration_black_512.webp",
    "league_aspirant_512.webp",
    "league_vanguard_512.webp",
    "league_marshal_512.webp",
    "league_overlord_512.webp",
    "league_demigod_512.webp",
] as const;

const WEALTH_EMBLEM_FILENAMES = {
    1: {
        1: "wealth_aspirant_ragged_512.webp",
        2: "wealth_aspirant_stacked_512.webp",
        3: "wealth_aspirant_whale_512.webp",
    },
    2: {
        1: "wealth_vanguard_ragged_512.webp",
        2: "wealth_vanguard_stacked_512.webp",
        3: "wealth_vanguard_whale_512.webp",
    },
    3: {
        1: "wealth_marshal_ragged_512.webp",
        2: "wealth_marshal_stacked_512.webp",
        3: "wealth_marshal_whale_512.webp",
    },
    4: {
        1: "wealth_overlord_ragged_512.webp",
        2: "wealth_overlord_stacked_512.webp",
        3: "wealth_overlord_whale_512.webp",
    },
    5: {
        1: "wealth_demigod_ragged_512.webp",
        2: "wealth_demigod_stacked_512.webp",
        3: "wealth_demigod_whale_512.webp",
    },
} as const;

type League = keyof typeof WEALTH_EMBLEM_FILENAMES;
type Wealth = 1 | 2 | 3;

/** Player standings use a wealth portrait; missing wealth keeps the generic league crest. */
export const leagueEmblemPath = (league: number, wealth = 0): string => {
    const normalized = Math.trunc(Number(league));
    const base = LEAGUE_EMBLEM_FILENAMES[normalized] ?? LEAGUE_EMBLEM_FILENAMES[0];
    const normalizedWealth = Math.trunc(Number(wealth));
    const filename = WEALTH_EMBLEM_FILENAMES[normalized as League]?.[normalizedWealth as Wealth] ?? base;
    return `/assets/images/leagues/${filename}`;
};
