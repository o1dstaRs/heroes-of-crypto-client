/**
 * Which match modes may show a player's MMR movement.
 *
 * Calibration games do NOT move a player's MMR. The server keeps them off `mmr` entirely and scores them
 * into `provisionalMmr` instead; for a FIRST calibration even that is discarded, because the placement
 * seed comes from the win COUNT (`placementSeedByWins`) rather than from the provisional total. So a
 * per-game delta on a calibration row is movement in a number that never becomes the player's rating, and
 * printing it as "MMR" reads as a rating loss that never happened.
 *
 * The game client's portal has always drawn this line — matchHistoryModel gives CALIBRATION
 * `showsMmr: false` with `showsGold: true` — and the site now matches it, so the two surfaces cannot
 * disagree about whether a calibration game cost someone rating.
 *
 * Gold is deliberately NOT gated here: calibration rows still show it. The server mints none during
 * calibration, so the number is honest wherever it appears.
 */
export type MatchRatingMode = "calibration" | "lobby" | "ranked" | "unknown";

/** True only for modes whose result actually moves the player's MMR. */
export const matchShowsMmr = (mode: MatchRatingMode): boolean => mode === "ranked";

/** True for modes that carry ranked-style rewards at all (rating and/or gold). */
export const matchIsRated = (mode: MatchRatingMode): boolean => mode === "ranked" || mode === "calibration";
