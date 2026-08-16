const LEAGUE_EMBLEM_FILENAMES = [
    "league_calibration_512.webp",
    "league_aspirant_512.webp",
    "league_vanguard_512.webp",
    "league_marshal_512.webp",
    "league_overlord_512.webp",
    "league_demigod_512.webp",
] as const;

/** League 0 (and invalid values) deliberately resolves to the question-mark calibration shield. */
export const leagueEmblemPath = (league: number): string => {
    const normalized = Math.trunc(Number(league));
    const filename = LEAGUE_EMBLEM_FILENAMES[normalized] ?? LEAGUE_EMBLEM_FILENAMES[0];
    return `/assets/images/leagues/${filename}`;
};
