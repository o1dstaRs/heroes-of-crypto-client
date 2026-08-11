import { Box, Stack, Tooltip, Typography } from "@mui/joy";
import React from "react";

import { t } from "../../i18n/i18n";
import { hocColors } from "../hocTheme";
import type { RankedStanding } from "../../api/social_client";

/**
 * Where the player stands on the ranked ladder, in one block used by BOTH in-game surfaces (the
 * matchmaking lobby sidebar and the full portal page).
 *
 * While calibrating it shows the only number that matters — games played out of the required set —
 * as a row of pips, with the running W/D/L underneath and a plain sentence about what placement
 * will do. The provisional MMR is deliberately absent: it is hidden server-side too, and showing a
 * rating that is still swinging on a high K-factor invites people to read it as their real one.
 * Once placed, the same block becomes the league + MMR readout.
 */

export interface CalibrationProgressProps {
    standing: RankedStanding;
    /** Compact spacing for the lobby sidebar; the portal page uses the roomier default. */
    dense?: boolean;
}

const pipColor = (index: number, played: number): string => {
    if (index < played) {
        return hocColors.gold;
    }
    return "rgba(220,177,88,0.06)";
};

export const CalibrationProgress: React.FC<CalibrationProgressProps> = ({ standing, dense = false }) => {
    const { calibration, state } = standing;
    const placed = state === "placed";
    const required = Math.max(1, calibration.required);
    const played = Math.min(calibration.gamesPlayed, required);

    if (placed) {
        return (
            <Stack spacing={dense ? 0.4 : 0.75}>
                <Typography level="body-xs" sx={{ color: hocColors.gold, letterSpacing: "0.12em" }}>
                    {t("RANKED STANDING")}
                </Typography>
                <Stack direction="row" spacing={1} alignItems="baseline" flexWrap="wrap">
                    <Typography level={dense ? "title-md" : "title-lg"} sx={{ color: hocColors.parchment }}>
                        {standing.leagueName}
                    </Typography>
                    <Typography level="body-sm" sx={{ color: hocColors.muted }}>
                        {standing.mmr} {t("MMR")}
                    </Typography>
                    {standing.leaderboardRank > 0 && (
                        <Typography level="body-sm" sx={{ color: hocColors.muted }}>
                            · #{standing.leaderboardRank}
                        </Typography>
                    )}
                </Stack>
            </Stack>
        );
    }

    const recalibrating = state === "recalibration";
    const headline = recalibrating ? t("RETURNING TO THE LADDER") : t("CALIBRATION MATCHES");
    const explainer = recalibrating
        ? t("Finish these to return to the ladder. Your previous league is remembered.")
        : t("Finish these to be placed into a league. Your rating stays hidden until then.");

    return (
        <Stack spacing={dense ? 0.5 : 0.85}>
            <Stack direction="row" alignItems="baseline" justifyContent="space-between" spacing={1}>
                <Typography level="body-xs" sx={{ color: hocColors.gold, letterSpacing: "0.12em" }}>
                    {headline}
                </Typography>
                <Typography level="body-sm" sx={{ color: hocColors.parchment, fontWeight: 800 }}>
                    {played} / {required}
                </Typography>
            </Stack>

            {/* Pips read at a glance ("two more to go"). They ARE the progress bar — a second
                LinearProgress underneath said the same thing twice and refused the theme tokens. */}
            <Stack
                direction="row"
                spacing={0.5}
                role="img"
                aria-label={`${t("Calibration matches")}: ${played} / ${required}`}
            >
                {Array.from({ length: required }, (_, index) => (
                    <Box
                        key={index}
                        sx={{
                            flex: 1,
                            height: dense ? 6 : 8,
                            borderRadius: 999,
                            bgcolor: pipColor(index, played),
                            border: `1px solid ${index < played ? hocColors.gold : "rgba(220,177,88,0.55)"}`,
                            transition: "background-color 200ms ease",
                        }}
                    />
                ))}
            </Stack>
            <Stack direction="row" spacing={1.25} alignItems="center" flexWrap="wrap">
                <Tooltip title={t("Wins · draws · losses in calibration")} size="sm" variant="soft">
                    <Typography level="body-xs" sx={{ color: hocColors.muted }}>
                        <Box component="span" sx={{ color: hocColors.green, fontWeight: 800 }}>
                            {calibration.wins}
                        </Box>
                        {" W · "}
                        {calibration.draws}
                        {" D · "}
                        <Box component="span" sx={{ color: hocColors.danger, fontWeight: 800 }}>
                            {calibration.losses}
                        </Box>
                        {" L"}
                    </Typography>
                </Tooltip>
                {calibration.remaining > 0 && (
                    <Typography level="body-xs" sx={{ color: hocColors.muted }}>
                        {calibration.remaining === 1
                            ? t("1 calibration match left")
                            : `${calibration.remaining} ${t("calibration matches left")}`}
                    </Typography>
                )}
            </Stack>

            {!dense && (
                <Typography level="body-xs" sx={{ color: hocColors.muted, opacity: 0.85 }}>
                    {explainer}
                </Typography>
            )}
            {recalibrating && standing.previous && (
                <Typography level="body-xs" sx={{ color: hocColors.muted }}>
                    {t("Previously")}: {standing.previous.leagueName} · {standing.previous.mmr} {t("MMR")}
                </Typography>
            )}
        </Stack>
    );
};
