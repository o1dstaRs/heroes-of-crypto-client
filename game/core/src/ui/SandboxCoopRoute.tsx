import type { TeamType } from "@heroesofcrypto/common";
import Box from "@mui/joy/Box";
import Button from "@mui/joy/Button";
import CircularProgress from "@mui/joy/CircularProgress";
import Stack from "@mui/joy/Stack";
import Typography from "@mui/joy/Typography";
import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";

import { joinSandboxCoop, sandboxCoopErrorMessage, type SandboxCoopSession } from "../api/sandbox_coop_client";
import type { IWindowSize } from "../scenes/VisibleState";
import { t } from "../i18n/i18n";
import { hocColors, hocPrimaryButtonSx, hocSpinnerSx } from "./hocTheme";
import { RankedGameView } from "./RankedGameView";

/**
 * /sandbox/:gameId — the direct link a sandbox invite carries, and where the host lands after inviting.
 * Resolves this player's seat with the server (host = green, invited friend = red; anyone else, or a
 * player who is meanwhile in a ranked/lobby game, is refused) and then runs the ordinary authoritative
 * board in co-op sandbox mode.
 */
export const SandboxCoopRoute: React.FC<{ windowSize: IWindowSize }> = ({ windowSize }) => {
    const { gameId } = useParams<{ gameId: string }>();
    const navigate = useNavigate();
    const [session, setSession] = useState<SandboxCoopSession | null>(null);
    const [error, setError] = useState("");

    useEffect(() => {
        setSession(null);
        setError("");
        if (!gameId) {
            setError(t("This sandbox is no longer open"));
            return undefined;
        }
        let cancelled = false;
        joinSandboxCoop(gameId)
            .then((joined) => {
                if (!cancelled) {
                    setSession(joined);
                }
            })
            .catch((err: unknown) => {
                if (!cancelled) {
                    setError(sandboxCoopErrorMessage(err, t("Unable to join this sandbox")));
                }
            });
        return () => {
            cancelled = true;
        };
    }, [gameId]);

    if (error) {
        return (
            <Box sx={{ height: "100dvh", display: "grid", placeItems: "center", bgcolor: "#07090d" }}>
                <Stack spacing={2} alignItems="center" sx={{ maxWidth: 420, textAlign: "center", px: 2 }}>
                    <Typography level="title-lg" sx={{ color: hocColors.gold }}>
                        {t("Co-op sandbox")}
                    </Typography>
                    <Typography sx={{ color: hocColors.parchment }}>{error}</Typography>
                    <Button sx={hocPrimaryButtonSx} onClick={() => navigate("/")}>
                        {t("Back to sandbox")}
                    </Button>
                </Stack>
            </Box>
        );
    }
    if (!session || !gameId) {
        return (
            <Box sx={{ height: "100dvh", display: "grid", placeItems: "center", bgcolor: "#07090d" }}>
                <Stack spacing={2} alignItems="center">
                    <CircularProgress sx={hocSpinnerSx} />
                    <Typography sx={{ color: hocColors.parchment }}>{t("Joining the sandbox…")}</Typography>
                </Stack>
            </Box>
        );
    }
    return (
        <RankedGameView
            windowSize={windowSize}
            gameId={gameId}
            userTeam={session.team as TeamType}
            sandboxCoop={session}
        />
    );
};

export default SandboxCoopRoute;
