import { Box, Button, Stack, Typography } from "@mui/joy";
import { motion, useReducedMotion } from "framer-motion";
import React, { useEffect, useMemo, useRef, useState } from "react";

import { fetchRankedStanding, type RankedStanding } from "../api/social_client";
import { HOC_GAME_FONT_FAMILY } from "../fontFamilies";
import { t, tf, useTranslation } from "../i18n/i18n";
import { standingLabel } from "../i18n/standing";
import { hocColors, hocPrimaryButtonSx } from "./hocTheme";
import { LeagueEmblem, leagueEmblemGlow } from "./PlayerPortal/LeagueEmblem";

export type LeagueTransitionKind = "calibration" | "demotion" | "promotion";

export interface LeagueTransition {
    current: RankedStanding;
    kind: LeagueTransitionKind;
    previous: RankedStanding;
}

export const leagueTransitionBetween = (previous: RankedStanding, current: RankedStanding): LeagueTransition | null => {
    if (current.state !== "placed" || current.league <= 0) {
        return null;
    }
    if (previous.state !== "placed" || previous.league <= 0) {
        return { current, kind: "calibration", previous };
    }
    if (current.league === previous.league) {
        return null;
    }
    return { current, kind: current.league > previous.league ? "promotion" : "demotion", previous };
};

const standingResultChanged = (previous: RankedStanding, current: RankedStanding): boolean =>
    current.totalGames !== previous.totalGames ||
    current.mmr !== previous.mmr ||
    current.state !== previous.state ||
    current.calibration.gamesPlayed !== previous.calibration.gamesPlayed;

const pause = (milliseconds: number): Promise<void> =>
    new Promise((resolve) => window.setTimeout(resolve, milliseconds));

const revealHeadline = (kind: LeagueTransitionKind): string => {
    if (kind === "calibration") return t("CALIBRATION COMPLETE");
    if (kind === "promotion") return t("PROMOTED");
    return t("NEW LEAGUE");
};

const previewTransitionFromUrl = (): LeagueTransition | null => {
    if (!import.meta.env.DEV) return null;
    const params = new URLSearchParams(window.location.search);
    const league = Math.max(1, Math.min(5, Math.trunc(Number(params.get("leagueRevealPreview")))));
    if (!params.has("leagueRevealPreview") || !league) return null;
    const names = ["", "Aspirant", "Vanguard", "Marshal", "Overlord", "Demigod"];
    const kindParam = params.get("leagueRevealKind");
    const kind: LeagueTransitionKind =
        kindParam === "promotion" || kindParam === "demotion" ? kindParam : "calibration";
    const makeStanding = (state: RankedStanding["state"], value: number): RankedStanding => ({
        calibration: { draws: 1, gamesPlayed: 5, losses: 1, remaining: 0, required: 5, wins: 3 },
        draws: 2,
        gold: 820,
        leaderboardRank: value ? 17 : 0,
        league: value,
        leagueName: names[value] ?? "",
        lossStreak: 0,
        losses: 11,
        mmr: value ? value * 650 + 420 : 0,
        peakMmr: value ? value * 650 + 470 : 0,
        previous: null,
        standingTitle: value ? names[value] : "Calibration",
        state,
        totalGames: 34,
        wealth: value ? 2 : 0,
        wealthName: value ? "Stacked" : "",
        wins: 21,
        winStreak: 2,
    });
    const previousLeague =
        kind === "calibration" ? 0 : kind === "promotion" ? Math.max(1, league - 1) : Math.min(5, league + 1);
    return {
        current: makeStanding("placed", league),
        kind,
        previous: makeStanding(previousLeague ? "placed" : "calibration", previousLeague),
    };
};

export interface LeagueTransitionRevealProps {
    active: boolean;
    enabled: boolean;
    gameId: string;
}

/**
 * Watches the player's standing across one live ranked match. Once the result reaches the social
 * profile, calibration completion and cross-league moves receive a one-time cinematic reveal.
 */
export const LeagueTransitionReveal: React.FC<LeagueTransitionRevealProps> = ({ active, enabled, gameId }) => {
    useTranslation();
    const reduceMotion = useReducedMotion();
    const baselineRef = useRef<RankedStanding | null>(null);
    const pollStartedRef = useRef(false);
    const [baselineReady, setBaselineReady] = useState(false);
    const [reveal, setReveal] = useState<LeagueTransition | null>(null);
    const previewReveal = useMemo(previewTransitionFromUrl, [gameId]);

    useEffect(() => {
        let cancelled = false;
        baselineRef.current = null;
        pollStartedRef.current = false;
        setBaselineReady(false);
        setReveal(null);
        if (previewReveal) {
            setReveal(previewReveal);
            return () => undefined;
        }
        if (!enabled) return () => undefined;

        const captureBaseline = async (): Promise<void> => {
            for (let attempt = 0; attempt < 2 && !cancelled; attempt += 1) {
                try {
                    baselineRef.current = await fetchRankedStanding();
                    if (!cancelled) setBaselineReady(true);
                    return;
                } catch {
                    if (attempt === 0) await pause(2_000);
                }
            }
        };
        void captureBaseline();
        return () => {
            cancelled = true;
        };
    }, [enabled, gameId, previewReveal]);

    useEffect(() => {
        if (!active || !enabled || !baselineReady || !baselineRef.current || pollStartedRef.current) return;
        pollStartedRef.current = true;
        let cancelled = false;
        const previous = baselineRef.current;

        const pollResult = async (): Promise<void> => {
            for (let attempt = 0; attempt < 10 && !cancelled; attempt += 1) {
                await pause(attempt === 0 ? 650 : 850);
                if (cancelled) return;
                try {
                    const current = await fetchRankedStanding();
                    const transition = leagueTransitionBetween(previous, current);
                    if (transition) {
                        const marker = `hoc:league-reveal:${gameId}:${current.totalGames}:${current.league}`;
                        try {
                            if (window.sessionStorage.getItem(marker)) return;
                            window.sessionStorage.setItem(marker, "1");
                        } catch {
                            // Storage can be disabled; the in-memory poll guard still prevents repeats.
                        }
                        if (!cancelled) setReveal(transition);
                        return;
                    }
                    if (standingResultChanged(previous, current)) return;
                } catch {
                    // The result write is asynchronous; a transient fetch failure is worth retrying.
                }
            }
        };
        void pollResult();
        return () => {
            cancelled = true;
        };
    }, [active, baselineReady, enabled, gameId]);

    if (!reveal) return null;

    const leagueTitle = standingLabel(reveal.current.wealth, reveal.current.wealthName, reveal.current.leagueName);
    const glow = leagueEmblemGlow(reveal.current.league);
    const previousLeague = reveal.previous.leagueName ? t(reveal.previous.leagueName) : t("Calibration");

    return (
        <Box
            role="dialog"
            aria-modal="true"
            aria-labelledby="league-transition-title"
            sx={{
                position: "fixed",
                inset: 0,
                zIndex: 10020,
                display: "grid",
                placeItems: "center",
                overflow: "hidden",
                px: 2,
                py: 3,
                bgcolor: "rgba(3, 3, 4, 0.96)",
                backgroundImage: `radial-gradient(circle at 50% 43%, ${glow} 0, rgba(8,6,5,0.72) 31%, rgba(3,3,4,0.98) 68%)`,
            }}
        >
            <Box
                component={motion.div}
                initial={reduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.45 }}
                aria-hidden
                sx={{ position: "absolute", inset: 0, pointerEvents: "none" }}
            >
                {Array.from({ length: 18 }, (_, index) => {
                    const left = 8 + ((index * 37) % 84);
                    const top = 12 + ((index * 53) % 76);
                    return (
                        <motion.span
                            key={index}
                            style={{
                                position: "absolute",
                                left: `${left}%`,
                                top: `${top}%`,
                                width: index % 3 === 0 ? 4 : 2,
                                height: index % 3 === 0 ? 4 : 2,
                                borderRadius: "50%",
                                background: index % 2 === 0 ? hocColors.gold : "#fff4d0",
                                boxShadow: `0 0 10px ${glow}`,
                            }}
                            animate={
                                reduceMotion
                                    ? undefined
                                    : { opacity: [0.12, 0.9, 0.12], scale: [0.6, 1.5, 0.6], y: [5, -9, 5] }
                            }
                            transition={{ duration: 2.4 + (index % 5) * 0.35, repeat: Infinity, delay: index * 0.08 }}
                        />
                    );
                })}
            </Box>

            <Stack
                component={motion.div}
                initial={reduceMotion ? false : { opacity: 0, scale: 0.9, y: 30 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 170, damping: 19, delay: 0.12 }}
                spacing={1.2}
                alignItems="center"
                sx={{ position: "relative", zIndex: 1, width: "min(94vw, 620px)", textAlign: "center" }}
            >
                <Typography
                    sx={{
                        color: hocColors.gold,
                        fontFamily: HOC_GAME_FONT_FAMILY,
                        fontSize: { xs: "0.78rem", sm: "0.92rem" },
                        fontWeight: 800,
                        letterSpacing: "0.24em",
                        textShadow: `0 0 14px ${glow}`,
                    }}
                >
                    {revealHeadline(reveal.kind)}
                </Typography>

                <Box
                    component={motion.div}
                    initial={reduceMotion ? false : { opacity: 0, scale: 0.28, rotate: -10 }}
                    animate={{ opacity: 1, scale: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 145, damping: 15, delay: 0.24 }}
                    sx={{
                        position: "relative",
                        display: "grid",
                        placeItems: "center",
                        width: { xs: 210, sm: 270 },
                        height: { xs: 210, sm: 270 },
                        my: { xs: 0, sm: 0.8 },
                        "&::before, &::after": {
                            content: '""',
                            position: "absolute",
                            border: `1px solid ${glow}`,
                            borderRadius: "50%",
                            boxShadow: `0 0 34px ${glow}, inset 0 0 34px ${glow}`,
                        },
                        "&::before": { inset: 4, opacity: 0.55 },
                        "&::after": { inset: 28, opacity: 0.35 },
                    }}
                >
                    <LeagueEmblem
                        league={reveal.current.league}
                        label={t(reveal.current.leagueName)}
                        size={reduceMotion ? 202 : 224}
                    />
                </Box>

                <Typography
                    id="league-transition-title"
                    sx={{
                        color: hocColors.parchment,
                        fontFamily: HOC_GAME_FONT_FAMILY,
                        fontSize: { xs: "2rem", sm: "3rem" },
                        fontWeight: 900,
                        lineHeight: 1,
                        letterSpacing: "0.045em",
                        textShadow: `0 0 24px ${glow}, 0 3px 4px rgba(0,0,0,0.9)`,
                    }}
                >
                    {leagueTitle}
                </Typography>
                <Typography sx={{ color: hocColors.mutedStrong, fontSize: { xs: "0.85rem", sm: "0.98rem" } }}>
                    {reveal.kind === "calibration"
                        ? tf("Welcome to {league}", { league: t(reveal.current.leagueName) })
                        : `${previousLeague} → ${t(reveal.current.leagueName)}`}
                </Typography>
                <Typography sx={{ color: hocColors.gold, fontWeight: 800 }}>
                    {reveal.current.mmr} {t("MMR")}
                    {reveal.current.leaderboardRank > 0 ? ` · #${reveal.current.leaderboardRank}` : ""}
                </Typography>
                <Button
                    size="lg"
                    variant="solid"
                    onClick={() => setReveal(null)}
                    sx={{ ...hocPrimaryButtonSx, minWidth: 190, mt: "14px !important" }}
                >
                    {t("Continue")}
                </Button>
            </Stack>
        </Box>
    );
};
