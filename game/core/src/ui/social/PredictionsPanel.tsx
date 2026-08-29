import { Button, Divider, Input, Sheet, Stack, Tab, TabList, TabPanel, Tabs, Typography } from "@mui/joy";
import React, { useCallback, useEffect, useState } from "react";

import {
    fetchMyPredictionBets,
    fetchPredictionMarkets,
    placePredictionBet,
    predictionReturn,
    socialErrorMessage,
    settledPredictionBetsForSeason,
    type PredictionBet,
    type PredictionMarket,
} from "../../api/social_client";
import { fetchRankedStanding } from "../../api/social_client";
import { t, tf } from "../../i18n/i18n";
import { CurrencyIcon } from "../GoldCurrencyIcon";
import { hocColors, hocInputSx, hocPanelSx, hocPrimaryButtonSx, hocSoftButtonSx } from "../hocTheme";
import { useRankedSeason } from "../useRankedSeason";
import { DockPanelCloseButton, DockPanelShell } from "./DockPanelShell";

/**
 * In-game prediction tray: the markets you can still bet on, and everything you have bet already.
 *
 * Only DRAFTING games are offered — once a game leaves its pick phase the market is closed, which is
 * why this reads the live markets feed rather than the general games list. Parimutuel with no
 * commission: a stake returns itself plus a pro-rata share of the losing side, so the preview line
 * is the actual payout at the pools as they stand.
 */

export interface PredictionsPanelProps {
    open: boolean;
    onClose: () => void;
}

const statusLabel = (status: PredictionBet["status"]): string =>
    ({
        open: t("In play"),
        won: t("Won"),
        lost: t("Lost"),
        burned: t("Burned"),
        refunded: t("Refunded"),
    })[status];

const statusColor = (status: PredictionBet["status"]): string => {
    if (status === "won") return hocColors.green;
    if (status === "open") return hocColors.gold;
    if (status === "refunded") return hocColors.muted;
    return hocColors.danger;
};

export const PredictionsPanel: React.FC<PredictionsPanelProps> = ({ open, onClose }) => {
    const { currency, snapshot: seasonSnapshot } = useRankedSeason();
    const [markets, setMarkets] = useState<PredictionMarket[]>([]);
    const [bets, setBets] = useState<PredictionBet[]>([]);
    const [gold, setGold] = useState(0);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [armedGameId, setArmedGameId] = useState("");
    const [armedSide, setArmedSide] = useState("");
    const [amount, setAmount] = useState("");

    const reload = useCallback(async (): Promise<void> => {
        const [nextMarkets, nextBets, standing] = await Promise.all([
            fetchPredictionMarkets().catch(() => [] as PredictionMarket[]),
            fetchMyPredictionBets().catch(() => [] as PredictionBet[]),
            fetchRankedStanding().catch(() => null),
        ]);
        setMarkets(nextMarkets);
        setBets(nextBets);
        setGold(standing?.gold ?? 0);
    }, []);

    useEffect(() => {
        if (!open) {
            return undefined;
        }
        void reload();
        // Drafts are short; keep the offered markets honest while the panel sits open.
        const timer = window.setInterval(() => void reload(), 10_000);
        return () => window.clearInterval(timer);
    }, [open, reload]);

    useEffect(() => {
        if (!open) {
            setArmedGameId("");
            setArmedSide("");
            setAmount("");
            setError("");
        }
    }, [open]);

    const betByGame = new Map(bets.map((bet) => [bet.gameId, bet]));
    const openBets = bets.filter((bet) => bet.status === "open");
    const currentSeasonSequence = seasonSnapshot?.current?.sequence;
    const pastBets = settledPredictionBetsForSeason(bets, currentSeasonSequence);
    const stake = Math.max(0, Math.floor(Number(amount) || 0));

    const submit = async (market: PredictionMarket): Promise<void> => {
        if (busy || !armedSide || stake < 1) {
            return;
        }
        setBusy(true);
        setError("");
        try {
            await placePredictionBet(market.gameId, armedSide, stake);
            setArmedGameId("");
            setArmedSide("");
            setAmount("");
            await reload();
        } catch (err) {
            setError(socialErrorMessage(err, t("Could not place the prediction")));
        } finally {
            setBusy(false);
        }
    };

    const renderMarket = (market: PredictionMarket): React.ReactNode => {
        const mine = betByGame.get(market.gameId);
        const armed = armedGameId === market.gameId;
        const chosen = market.seats.find((seat) => seat.playerId === armedSide);
        const against = market.seats.find((seat) => seat.playerId !== armedSide);
        const total = chosen && stake > 0 ? predictionReturn(stake, chosen.pool, against?.pool ?? 0) : 0;

        return (
            <Sheet key={market.gameId} variant="outlined" sx={{ ...hocPanelSx, p: 1.25, mb: 1 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 0.5 }}>
                    <Typography level="body-xs" sx={{ color: hocColors.muted }}>
                        {tf("{amount} {symbol} · {count} bets", {
                            amount: market.totalPool,
                            count: market.totalBets,
                            symbol: currency.symbol,
                        })}
                    </Typography>
                </Stack>
                <Stack direction="row" spacing={0.75}>
                    {market.seats.map((seat) => {
                        const share = market.totalPool > 0 ? Math.round((seat.pool / market.totalPool) * 100) : 50;
                        const backed = mine?.predictedPlayerId === seat.playerId;
                        return (
                            <Button
                                key={seat.playerId}
                                size="sm"
                                variant={armedSide === seat.playerId && armed ? "solid" : "outlined"}
                                disabled={!!mine || busy}
                                sx={{
                                    ...(armedSide === seat.playerId && armed ? hocPrimaryButtonSx : hocSoftButtonSx),
                                    flex: 1,
                                    flexDirection: "column",
                                    alignItems: "flex-start",
                                    ...(backed ? { borderColor: hocColors.gold } : {}),
                                }}
                                onClick={() => {
                                    setArmedGameId(market.gameId);
                                    setArmedSide(seat.playerId);
                                    setError("");
                                }}
                            >
                                <Typography level="body-sm" sx={{ color: "inherit", fontWeight: 700 }}>
                                    {seat.username}
                                </Typography>
                                <Typography level="body-xs" sx={{ color: hocColors.muted }}>
                                    {seat.pool} {currency.symbol} · {share}%
                                </Typography>
                            </Button>
                        );
                    })}
                </Stack>

                {mine ? (
                    <Typography level="body-xs" sx={{ color: hocColors.gold, mt: 0.75 }}>
                        {t("Your bet")}: {mine.amount} {currency.symbol}
                    </Typography>
                ) : armed ? (
                    <Stack spacing={0.75} sx={{ mt: 0.75 }}>
                        <Stack direction="row" spacing={0.75}>
                            <Input
                                size="sm"
                                type="number"
                                slotProps={{ input: { min: 1, step: 1 } }}
                                placeholder={tf("{currency} to stake", { currency: t(currency.name) })}
                                value={amount}
                                onChange={(event) => setAmount(event.target.value)}
                                sx={{ ...hocInputSx, flex: 1 }}
                            />
                            <Button
                                size="sm"
                                variant="solid"
                                sx={hocPrimaryButtonSx}
                                disabled={busy || stake < 1 || stake > gold}
                                onClick={() => void submit(market)}
                            >
                                {busy ? t("Placing…") : t("Place bet")}
                            </Button>
                        </Stack>
                        {stake > 0 && chosen && (
                            <Typography level="body-xs" sx={{ color: hocColors.gold }}>
                                {t("Returns")} {total} {currency.symbol} (+{total - stake})
                            </Typography>
                        )}
                        {stake > gold && (
                            <Typography level="body-xs" sx={{ color: hocColors.danger }}>
                                {tf("Not enough {currency}", { currency: t(currency.name) })}
                            </Typography>
                        )}
                    </Stack>
                ) : null}
            </Sheet>
        );
    };

    const renderBet = (bet: PredictionBet): React.ReactNode => {
        const profit = bet.payout - bet.amount;
        return (
            <Stack
                key={`${bet.gameId}:${bet.placedAt}`}
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                sx={{ py: 0.6, borderBottom: "1px solid rgba(255,143,0,0.12)" }}
            >
                <Typography level="body-xs" sx={{ color: statusColor(bet.status), fontWeight: 700, minWidth: 64 }}>
                    {statusLabel(bet.status)}
                </Typography>
                <Typography level="body-xs" sx={{ color: hocColors.parchment, flex: 1, mx: 1 }}>
                    {bet.amount} {currency.symbol}
                </Typography>
                <Typography level="body-xs" sx={{ color: bet.status === "won" ? hocColors.green : hocColors.muted }}>
                    {bet.status === "open" ? "—" : `${profit > 0 ? "+" : ""}${profit}`}
                </Typography>
            </Stack>
        );
    };

    return (
        <DockPanelShell open={open} onClose={onClose} width={520}>
            <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                <Typography level="title-lg" sx={{ color: hocColors.gold }}>
                    {t("Predictions")}
                </Typography>
                <Typography
                    level="body-sm"
                    sx={{ display: "inline-flex", alignItems: "center", gap: 0.4, color: hocColors.gold }}
                    title={`${t(currency.name)} (${currency.symbol})`}
                >
                    <CurrencyIcon iconSvg={currency.iconSvg} size={15} /> {gold} {currency.symbol}
                </Typography>
            </Stack>
            <Typography level="body-xs" sx={{ color: hocColors.muted }}>
                {t("Back a side while a game is still drafting. One bet per game, final once placed.")}
            </Typography>

            <Tabs defaultValue={0} sx={{ bgcolor: "transparent", mt: 0.5 }}>
                <TabList sx={{ bgcolor: "transparent" }}>
                    <Tab value={0}>{`${t("Open markets")} (${markets.length})`}</Tab>
                    <Tab value={1}>{`${t("Active")} (${openBets.length})`}</Tab>
                    <Tab value={2}>{`${t("History")} (${pastBets.length})`}</Tab>
                </TabList>

                <TabPanel value={0} sx={{ px: 0, maxHeight: "52vh", overflowY: "auto" }}>
                    {markets.length === 0 ? (
                        <Typography level="body-sm" sx={{ color: hocColors.muted }}>
                            {t("No games are drafting right now.")}
                        </Typography>
                    ) : (
                        markets.map(renderMarket)
                    )}
                    {error && (
                        <Typography level="body-xs" sx={{ color: hocColors.danger, mt: 0.5 }}>
                            {error}
                        </Typography>
                    )}
                </TabPanel>

                <TabPanel value={1} sx={{ px: 0, maxHeight: "52vh", overflowY: "auto" }}>
                    {openBets.length === 0 ? (
                        <Typography level="body-sm" sx={{ color: hocColors.muted }}>
                            {t("No bets in play.")}
                        </Typography>
                    ) : (
                        openBets.map(renderBet)
                    )}
                </TabPanel>

                <TabPanel value={2} sx={{ px: 0, maxHeight: "52vh", overflowY: "auto" }}>
                    {pastBets.length === 0 ? (
                        <Typography level="body-sm" sx={{ color: hocColors.muted }}>
                            {t("Nothing settled yet.")}
                        </Typography>
                    ) : (
                        pastBets.map(renderBet)
                    )}
                </TabPanel>
            </Tabs>

            <Divider sx={{ my: 0.5 }} />
            <DockPanelCloseButton onClose={onClose} />
        </DockPanelShell>
    );
};
