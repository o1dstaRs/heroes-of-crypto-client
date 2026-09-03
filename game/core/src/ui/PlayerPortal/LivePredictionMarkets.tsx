import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import { Box, Button, Input, Sheet, Stack, Typography } from "@mui/joy";
import React, { useCallback, useEffect, useMemo, useState } from "react";

import {
    eligiblePredictionMarkets,
    fetchMyPredictionBets,
    fetchPredictionMarkets,
    placePredictionBet,
    predictionReturn,
    socialErrorMessage,
    type PredictionBet,
    type PredictionMarket,
} from "../../api/social_client";
import { t, tf, useTranslation } from "../../i18n/i18n";
import { hocColors, hocInputSx, hocPanelSx, hocPrimaryButtonSx } from "../hocTheme";
import { useRankedSeason } from "../useRankedSeason";
import { isMockPortalEnabled } from "./mockPortal";

export interface LivePredictionMarketsProps {
    viewerUsername: string;
    viewerGameId?: string;
    gold: number;
    onBetPlaced?: () => void | Promise<void>;
    onVisibilityChange?: (visible: boolean) => void;
}

const mockMarkets = (): PredictionMarket[] => [
    {
        gameId: "mock-live-draft",
        pickEndTime: Date.now() + 4 * 60_000,
        totalPool: 125,
        totalBets: 7,
        seats: [
            { playerId: "mock-iron-warden", username: "IronWarden", pool: 80, bets: 4 },
            { playerId: "mock-frost-queen", username: "FrostQueen", pool: 45, bets: 3 },
        ],
    },
];

const draftClock = (pickEndTime: number, now: number): string => {
    if (pickEndTime <= 0) return t("LIVE");
    const remaining = Math.max(0, Math.ceil((pickEndTime - now) / 1000));
    const minutes = Math.floor(remaining / 60);
    return `${minutes}:${String(remaining % 60).padStart(2, "0")}`;
};

/** Compact live-market surface mounted as its own card beneath the ranked player profile. */
export const LivePredictionMarkets: React.FC<LivePredictionMarketsProps> = ({
    viewerUsername,
    viewerGameId,
    gold,
    onBetPlaced,
    onVisibilityChange,
}) => {
    // Keep this independently mounted card in sync with the profile language picker.
    useTranslation();
    const { currency } = useRankedSeason();
    const mockPreview = isMockPortalEnabled();
    const [markets, setMarkets] = useState<PredictionMarket[]>(() =>
        mockPreview
            ? eligiblePredictionMarkets(mockMarkets(), {
                  gameId: viewerGameId,
                  username: viewerUsername,
              })
            : [],
    );
    const [bets, setBets] = useState<PredictionBet[]>([]);
    const [availableGold, setAvailableGold] = useState(gold);
    const [armedGameId, setArmedGameId] = useState("");
    const [armedSide, setArmedSide] = useState("");
    const [amount, setAmount] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => setAvailableGold(gold), [gold]);

    const reload = useCallback(async (): Promise<void> => {
        if (mockPreview) {
            setMarkets(
                eligiblePredictionMarkets(mockMarkets(), {
                    gameId: viewerGameId,
                    username: viewerUsername,
                }),
            );
            return;
        }
        const [fetchedMarkets, fetchedBets] = await Promise.all([
            fetchPredictionMarkets().catch(() => [] as PredictionMarket[]),
            fetchMyPredictionBets().catch(() => [] as PredictionBet[]),
        ]);
        setMarkets(
            eligiblePredictionMarkets(fetchedMarkets, {
                gameId: viewerGameId,
                username: viewerUsername,
            }),
        );
        setBets(fetchedBets);
    }, [mockPreview, viewerGameId, viewerUsername]);

    useEffect(() => {
        void reload();
        const timer = window.setInterval(() => void reload(), 10_000);
        return () => window.clearInterval(timer);
    }, [reload]);

    useEffect(() => {
        if (markets.length === 0) return undefined;
        const timer = window.setInterval(() => setNow(Date.now()), 1_000);
        return () => window.clearInterval(timer);
    }, [markets.length]);

    useEffect(() => {
        if (armedGameId && !markets.some((market) => market.gameId === armedGameId)) {
            setArmedGameId("");
            setArmedSide("");
            setAmount("");
        }
    }, [armedGameId, markets]);

    const betByGame = useMemo(() => new Map(bets.map((bet) => [bet.gameId, bet])), [bets]);
    const wagerableMarkets = useMemo(
        () => markets.filter((market) => !betByGame.has(market.gameId)),
        [betByGame, markets],
    );
    const stake = Math.max(0, Math.floor(Number(amount) || 0));
    const visible = availableGold > 0 && wagerableMarkets.length > 0;

    useEffect(() => {
        onVisibilityChange?.(visible);
        return () => onVisibilityChange?.(false);
    }, [onVisibilityChange, visible]);

    const submit = async (market: PredictionMarket): Promise<void> => {
        if (busy || armedGameId !== market.gameId || !armedSide || stake < 1 || stake > availableGold) return;
        setBusy(true);
        setError("");
        try {
            if (mockPreview) {
                setBets((current) => [
                    ...current,
                    {
                        gameId: market.gameId,
                        playerId: "mock-preview-player",
                        predictedPlayerId: armedSide,
                        amount: stake,
                        placedAt: Date.now(),
                        status: "open",
                        payout: 0,
                        settledAt: 0,
                    },
                ]);
                setAvailableGold((current) => Math.max(0, current - stake));
            } else {
                await placePredictionBet(market.gameId, armedSide, stake);
                await Promise.all([reload(), onBetPlaced?.()]);
            }
            setArmedGameId("");
            setArmedSide("");
            setAmount("");
        } catch (err) {
            setError(socialErrorMessage(err, t("Could not place the prediction")));
        } finally {
            setBusy(false);
        }
    };

    if (!visible) return null;

    return (
        <Sheet
            component="section"
            aria-label={t("Live prediction markets")}
            variant="outlined"
            sx={{
                ...hocPanelSx,
                p: 1.15,
                borderRadius: "14px",
                bgcolor: "rgba(10,7,5,0.72)",
                borderColor: "rgba(255,143,0,0.2)",
                boxShadow: "0 12px 32px rgba(0,0,0,0.28)",
                backdropFilter: "blur(12px)",
                background: "linear-gradient(135deg, rgba(255,143,0,0.055), transparent 58%), rgba(10,7,5,0.72)",
            }}
        >
            <Stack direction="row" alignItems="center" sx={{ mb: 0.55 }}>
                <Stack direction="row" spacing={0.65} alignItems="center">
                    <Box
                        component="span"
                        aria-hidden="true"
                        sx={{
                            width: 7,
                            height: 7,
                            borderRadius: "50%",
                            bgcolor: hocColors.danger,
                            boxShadow: "0 0 8px #ff5a5a",
                        }}
                    />
                    <Typography
                        level="body-xs"
                        sx={{ color: hocColors.gold, fontWeight: 850, letterSpacing: "0.12em" }}
                    >
                        {t(wagerableMarkets.length === 1 ? "LIVE DRAFT" : "LIVE DRAFTS")}
                    </Typography>
                </Stack>
            </Stack>

            <Stack spacing={0.7} sx={{ maxHeight: 310, overflowY: "auto", pr: wagerableMarkets.length > 1 ? 0.25 : 0 }}>
                {wagerableMarkets.map((market) => {
                    const armed = armedGameId === market.gameId;
                    const chosen = market.seats.find((seat) => seat.playerId === armedSide);
                    const against = market.seats.find((seat) => seat.playerId !== armedSide);
                    const predictedReturn =
                        chosen && stake > 0 ? predictionReturn(stake, chosen.pool, against?.pool ?? 0) : 0;
                    return (
                        <Box
                            key={market.gameId}
                            component="article"
                            aria-label={tf("Live draft: {players}", {
                                players: market.seats.map((seat) => seat.username).join(t(" versus ")),
                            })}
                            sx={{
                                minWidth: 0,
                                pt: 0.3,
                            }}
                        >
                            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.45 }}>
                                <Typography level="body-xs" sx={{ color: hocColors.muted }}>
                                    {tf("{amount} {symbol} pool", {
                                        amount: market.totalPool,
                                        symbol: currency.symbol,
                                    })}
                                </Typography>
                                <Stack direction="row" spacing={0.4} alignItems="center">
                                    <Typography
                                        component="time"
                                        level="body-xs"
                                        sx={{
                                            color: hocColors.gold,
                                            fontWeight: 800,
                                            fontVariantNumeric: "tabular-nums",
                                        }}
                                    >
                                        {draftClock(market.pickEndTime, now)}
                                    </Typography>
                                    <Button
                                        component="a"
                                        href={
                                            mockPreview
                                                ? "/preview/picks/spectator"
                                                : `/game/${encodeURIComponent(market.gameId)}`
                                        }
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        size="sm"
                                        variant="plain"
                                        aria-label={tf("Spectate {players} in a new tab", {
                                            players: market.seats.map((seat) => seat.username).join(t(" versus ")),
                                        })}
                                        startDecorator={<VisibilityRoundedIcon sx={{ fontSize: 15 }} />}
                                        sx={{
                                            minHeight: 24,
                                            px: 0.55,
                                            color: hocColors.mutedStrong,
                                            fontSize: "0.7rem",
                                            "&:hover": { color: hocColors.gold, bgcolor: "rgba(255,143,0,0.08)" },
                                        }}
                                    >
                                        {t("Spectate")}
                                    </Button>
                                </Stack>
                            </Stack>

                            <Stack direction="row" spacing={0.65}>
                                {market.seats.map((seat) => {
                                    const selected = armed && armedSide === seat.playerId;
                                    const share =
                                        market.totalPool > 0 ? Math.round((seat.pool / market.totalPool) * 100) : 50;
                                    return (
                                        <Button
                                            key={seat.playerId}
                                            size="sm"
                                            variant={selected ? "solid" : "plain"}
                                            disabled={busy}
                                            onClick={() => {
                                                setArmedGameId(market.gameId);
                                                setArmedSide(seat.playerId);
                                                setError("");
                                            }}
                                            sx={{
                                                ...(selected
                                                    ? hocPrimaryButtonSx
                                                    : {
                                                          color: hocColors.parchment,
                                                          bgcolor: "rgba(239,228,204,0.035)",
                                                          border: "1px solid rgba(239,228,204,0.07)",
                                                          "&:hover": {
                                                              bgcolor: "rgba(255,143,0,0.07)",
                                                              borderColor: "rgba(255,143,0,0.18)",
                                                          },
                                                      }),
                                                flex: 1,
                                                minWidth: 0,
                                                px: 0.75,
                                                py: 0.5,
                                                flexDirection: "column",
                                                alignItems: "flex-start",
                                            }}
                                        >
                                            <Typography
                                                level="body-sm"
                                                noWrap
                                                sx={{
                                                    width: "100%",
                                                    color: "inherit",
                                                    fontWeight: 750,
                                                    textAlign: "left",
                                                }}
                                            >
                                                {seat.username}
                                            </Typography>
                                            <Typography
                                                level="body-xs"
                                                sx={{
                                                    color: selected ? "inherit" : hocColors.muted,
                                                    opacity: selected ? 0.78 : 1,
                                                }}
                                            >
                                                {seat.pool} {currency.symbol} · {share}%
                                            </Typography>
                                        </Button>
                                    );
                                })}
                            </Stack>

                            <Stack spacing={0.55} sx={{ mt: 0.65 }}>
                                <Stack direction="row" spacing={0.55}>
                                    <Input
                                        size="sm"
                                        type="number"
                                        slotProps={{ input: { min: 1, step: 1 } }}
                                        placeholder={tf("{currency} to bet", { currency: t(currency.name) })}
                                        value={amount}
                                        onChange={(event) => setAmount(event.target.value)}
                                        onKeyDown={(event) => {
                                            if (event.key === "Enter") void submit(market);
                                        }}
                                        sx={{ ...hocInputSx, flex: 1, minWidth: 0 }}
                                    />
                                    <Button
                                        size="sm"
                                        variant="solid"
                                        disabled={!armed || busy || stake < 1 || stake > availableGold}
                                        onClick={() => void submit(market)}
                                        sx={{ ...hocPrimaryButtonSx, minWidth: 88, px: 1.2 }}
                                    >
                                        {busy ? t("Placing…") : armed ? t("Bet") : t("Choose side")}
                                    </Button>
                                </Stack>
                                {stake > 0 && chosen && (
                                    <Typography
                                        level="body-xs"
                                        sx={{
                                            color: stake > availableGold ? hocColors.danger : hocColors.gold,
                                        }}
                                    >
                                        {stake > availableGold
                                            ? tf("Not enough {currency}", { currency: t(currency.name) })
                                            : tf("Returns {return} {symbol} (+{profit})", {
                                                  return: predictedReturn,
                                                  symbol: currency.symbol,
                                                  profit: predictedReturn - stake,
                                              })}
                                    </Typography>
                                )}
                            </Stack>
                        </Box>
                    );
                })}
            </Stack>

            {error && (
                <Typography level="body-xs" sx={{ color: hocColors.danger, mt: 0.65 }}>
                    {error}
                </Typography>
            )}
        </Sheet>
    );
};
