import { TeamVals } from "@heroesofcrypto/common";
import Box from "@mui/joy/Box";
import Button from "@mui/joy/Button";
import Stack from "@mui/joy/Stack";
import Typography from "@mui/joy/Typography";
import React from "react";

import { PlayActionType, PlayPhase, type PlayAction, type PlaySnapshot } from "../api/play_protocol";
import type { SandboxCoopSession } from "../api/sandbox_coop_client";
import { t } from "../i18n/i18n";
import {
    hocColors,
    hocDisplayFontFamily,
    hocDisplayLetterSpacing,
    hocPrimaryButtonSx,
    hocSoftButtonSx,
} from "./hocTheme";

/** READY_PLACEMENT carrying this reason takes the seat back out of ready (mirrors the server constant). */
export const SANDBOX_UNREADY_REASON = "unready";

export interface SandboxCoopSeatStatus {
    username: string;
    team: number;
    isViewer: boolean;
    connected: boolean;
    ready: boolean;
}

/** The two seats as the live snapshot reports them, with the invite's usernames on top. */
export const sandboxCoopSeatStatuses = (
    session: SandboxCoopSession,
    snapshot: Pick<PlaySnapshot, "players" | "readyPlayerIds"> | null,
    viewerTeam: number | undefined,
): SandboxCoopSeatStatus[] =>
    [session.host, session.guest].map((seat) => {
        const live = snapshot?.players.find((player) => player.playerId === seat.playerId);
        return {
            username: seat.username,
            team: seat.team,
            isViewer: seat.team === viewerTeam,
            connected: live ? live.connected : seat.connected,
            ready: snapshot ? snapshot.readyPlayerIds.includes(seat.playerId) : seat.ready,
        };
    });

const teamLabel = (team: number): string => (team === TeamVals.LEFT ? t("Green") : t("Red"));
const teamColor = (team: number): string => (team === TeamVals.LEFT ? hocColors.green : hocColors.danger);

/** One line per seat: who, which colour, and whether they are here / ready. */
export const SandboxCoopBanner: React.FC<{
    seats: SandboxCoopSeatStatus[];
    phase: number;
    fightStarted: boolean;
    onLeave: () => void;
}> = ({ seats, phase, fightStarted, onLeave }) => {
    const other = seats.find((seat) => !seat.isViewer);
    const headline = fightStarted
        ? null
        : other && !other.connected
          ? t("Waiting for {name} to join…").replace("{name}", other.username)
          : seats.every((seat) => seat.ready)
            ? t("Both ready — press START")
            : t("Place your army, then press READY");
    // Once the fight runs the matchup strip already names both seats; the banner only covers placement.
    if (phase !== PlayPhase.PLACEMENT || fightStarted) {
        return null;
    }
    return (
        <Box
            sx={{
                position: "fixed",
                // The roster overlay owns the top of the board, so the strip sits just above the READY footer.
                bottom: 78,
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 1250,
                px: 1.5,
                py: 0.75,
                borderRadius: 10,
                border: `1px solid ${hocColors.orangeBorder}`,
                bgcolor: "rgba(12, 8, 6, 0.86)",
                boxShadow: "0 6px 18px rgba(0,0,0,0.55)",
            }}
        >
            <Stack direction="row" spacing={2} alignItems="center">
                <Typography
                    sx={{
                        color: hocColors.gold,
                        fontFamily: hocDisplayFontFamily,
                        letterSpacing: hocDisplayLetterSpacing,
                        fontWeight: 800,
                        fontSize: "0.8rem",
                        textTransform: "uppercase",
                    }}
                >
                    {t("Co-op sandbox")}
                </Typography>
                {seats.map((seat) => (
                    <Stack key={seat.team} direction="row" spacing={0.6} alignItems="center">
                        <Box
                            component="span"
                            sx={{
                                width: 9,
                                height: 9,
                                borderRadius: "50%",
                                bgcolor: teamColor(seat.team),
                                boxShadow: seat.connected ? `0 0 6px ${teamColor(seat.team)}` : "none",
                                opacity: seat.connected ? 1 : 0.35,
                            }}
                        />
                        <Typography level="body-sm" sx={{ color: hocColors.parchment, whiteSpace: "nowrap" }}>
                            {seat.username}
                            {seat.isViewer ? ` (${t("you")})` : ""} · {teamLabel(seat.team)}
                        </Typography>
                        {!fightStarted && (
                            <Typography
                                level="body-xs"
                                sx={{ color: seat.ready ? hocColors.green : hocColors.muted, whiteSpace: "nowrap" }}
                            >
                                {seat.ready ? t("Ready") : seat.connected ? t("Not ready") : t("Away")}
                            </Typography>
                        )}
                    </Stack>
                ))}
                {headline && (
                    <Typography level="body-sm" sx={{ color: hocColors.muted, whiteSpace: "nowrap" }}>
                        {headline}
                    </Typography>
                )}
                {!fightStarted && (
                    <Button size="sm" variant="outlined" sx={hocSoftButtonSx} onClick={onLeave}>
                        {t("Leave")}
                    </Button>
                )}
            </Stack>
        </Box>
    );
};

/**
 * The lobby handshake, in the right sidebar's footer: READY locks your placement (and lights the other
 * seat's START once both are in), CANCEL READY reopens it. START itself is the sidebar's usual button.
 */
export const SandboxCoopReadyButton: React.FC<{
    canSubmit: boolean;
    ready: boolean;
    hasPlacedUnits: boolean;
    submitProtocolAction: (action: Partial<PlayAction>) => Promise<void>;
}> = ({ canSubmit, ready, hasPlacedUnits, submitProtocolAction }) => (
    <Button
        variant="solid"
        disabled={!canSubmit || (!ready && !hasPlacedUnits)}
        title={!ready && !hasPlacedUnits ? t("Place at least one unit first") : undefined}
        onClick={() =>
            void submitProtocolAction({
                type: PlayActionType.READY_PLACEMENT,
                ...(ready ? { reason: SANDBOX_UNREADY_REASON } : {}),
            })
        }
        sx={{
            ...(ready ? hocSoftButtonSx : hocPrimaryButtonSx),
            width: "min(100%, 209px)",
            justifySelf: "center",
            fontFamily: hocDisplayFontFamily,
            letterSpacing: hocDisplayLetterSpacing,
            textTransform: "uppercase",
            fontWeight: 800,
        }}
    >
        {ready ? t("Cancel ready") : t("Ready")}
    </Button>
);
