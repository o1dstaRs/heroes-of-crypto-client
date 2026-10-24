import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import { Box, CircularProgress, Sheet, Stack, Typography } from "@mui/joy";
import React from "react";

import { tf, useTranslation } from "../../i18n/i18n";
import { FullscreenCorner } from "../GameSystemControls";
import { draftShellSx } from "./draftShell";

/** Appears on the accepting click; matchmaking keeps ownership until both seats are ready. */
export const DraftAcceptanceWindow: React.FC<{ secondsRemaining: number | null }> = ({ secondsRemaining }) => {
    const { t } = useTranslation();
    const countdown =
        secondsRemaining !== null && Number.isFinite(secondsRemaining) && secondsRemaining >= 0
            ? Math.ceil(secondsRemaining)
            : null;

    return (
        <Sheet data-testid="draft-acceptance-window" sx={{ ...draftShellSx, position: "fixed", inset: 0 }}>
            <Box
                sx={{
                    width: "min(720px, calc(100% - 40px))",
                    maxHeight: "calc(100dvh - 96px)",
                    overflowY: "auto",
                    px: { xs: 2.5, sm: 5 },
                    py: { xs: 3, sm: 5 },
                    border: "1px solid rgba(211,166,91,.45)",
                    borderRadius: "14px",
                    background: "linear-gradient(160deg, rgba(30,18,7,.95), rgba(9,6,2,.96))",
                    boxShadow: "0 24px 80px rgba(0,0,0,.65), inset 0 0 36px rgba(185,133,50,.06)",
                    textAlign: "center",
                    color: "#efe4cc",
                }}
            >
                <Typography sx={{ color: "#d3a65b", letterSpacing: ".16em", textTransform: "uppercase", mb: 2 }}>
                    {t("Draft")}
                </Typography>
                <Stack role="status" aria-live="polite" spacing={1.5} alignItems="center">
                    <Typography component="h1" sx={{ color: "inherit", fontSize: { xs: 26, sm: 36 }, lineHeight: 1.2 }}>
                        {t("Waiting for your opponent to accept")}
                    </Typography>
                    <Typography sx={{ color: "#c0b7a6", maxWidth: 480 }}>
                        {t("The draft will start as soon as your opponent accepts.")}
                    </Typography>
                </Stack>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ my: 3, justifyContent: "center" }}>
                    <Stack direction="row" spacing={1} alignItems="center" justifyContent="center">
                        <CheckCircleRoundedIcon sx={{ color: "#7cfc9b" }} />
                        <Typography sx={{ color: "#7cfc9b" }}>{t("You accepted")}</Typography>
                    </Stack>
                    <Stack direction="row" spacing={1} alignItems="center" justifyContent="center">
                        <CircularProgress size="sm" sx={{ color: "#d3a65b" }} />
                        <Typography sx={{ color: "#efe4cc" }}>{t("Opponent: waiting to accept")}</Typography>
                    </Stack>
                </Stack>
                {countdown !== null && (
                    <Typography aria-live="off" sx={{ color: "#c0b7a6", fontVariantNumeric: "tabular-nums" }}>
                        {countdown > 0
                            ? tf("Acceptance closes in {seconds}s", { seconds: countdown })
                            : t("Checking match acceptance…")}
                    </Typography>
                )}
            </Box>
            <FullscreenCorner />
        </Sheet>
    );
};
