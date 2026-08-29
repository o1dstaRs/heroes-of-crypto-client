import { Box, Button, Input, Sheet, Stack, Typography } from "@mui/joy";
import React, { useCallback, useEffect, useRef, useState } from "react";

import { isInsufficientSeasonCurrencyError } from "../api/ranked_season_client";
import {
    callWager,
    fetchWager,
    fetchWagerIntent,
    raiseWager,
    setWagerIntent,
    type WagerIntentState,
    type WagerState,
} from "../api/social_client";
import { t, tf } from "../i18n/i18n";
import { playCallSound, playLockSound, playRaiseSound } from "./audio/chipSounds";
import { CurrencyIcon } from "./GoldCurrencyIcon";
import { hocColors, hocInputSx, hocPanelSx, hocPrimaryButtonSx, hocSoftButtonSx } from "./hocTheme";
import { useRankedSeason } from "./useRankedSeason";

/**
 * The poker moment of a wagered match. Mounted over the draft; polls the wager (it forms a few
 * seconds into pick) and walks the one-street negotiation. While NO wager exists yet the panel is
 * a late-arm surface instead of thin air: your already-armed stake shows as "on the table", and an
 * unarmed player can still stake DURING the draft — the server forms the wager on its next tick the
 * moment both seats hold intents (a real player sat through a whole match wondering why he
 * "couldn't call or raise" when his stake had simply never been armed — nothing ever told him).
 *
 * The negotiation itself:
 *
 *   your stakes matched   -> a banner: locked, winner takes the pot;
 *   you bid LESS          -> do nothing to play the smaller bid, CALL up to the larger bid, or
 *                            RAISE to at least twice the larger bid;
 *   you bid MORE          -> "opponent is deciding…", then fund a CALL if they raise;
 *   nobody acts           -> the countdown runs out and the wager locks DOWN at the smaller bid.
 *
 * Chip sounds fire on the transitions (raise/call/lock), riding the game's volume settings.
 */

export interface WagerNegotiatorProps {
    gameId: string;
    /** Poll while true (the draft); the component also lingers to show the lock result. */
    active: boolean;
}

const POLL_MS = 2000;
const MAX_WAGER = 1_000_000;

/** The ✕ glyph, shared by every dismissible wager surface. */
const dismissButtonSx = { color: hocColors.muted, minHeight: 0, py: 0.25 } as const;

export const WagerNegotiator: React.FC<WagerNegotiatorProps> = ({ gameId, active }) => {
    const { currency } = useRankedSeason();
    const [wager, setWager] = useState<WagerState | null>(null);
    const [intent, setIntent] = useState<WagerIntentState | null>(null);
    const [stakeDraft, setStakeDraft] = useState("");
    const [raiseTo, setRaiseTo] = useState(0);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [nowTick, setNowTick] = useState(Date.now());
    const [dismissed, setDismissed] = useState(false);
    // Scoped to the late-arm surface only: hiding the offer to stake must never hide a wager
    // that actually opens later in the draft.
    const [armHidden, setArmHidden] = useState(false);
    const lastStatusRef = useRef<string>("");

    const reload = useCallback(async (): Promise<void> => {
        try {
            const next = await fetchWager(gameId);
            if (!next) {
                // No wager yet — surface the caller's OWN standing stake so the panel can either
                // show it riding this match or offer to arm one right here mid-draft.
                try {
                    setIntent(await fetchWagerIntent());
                } catch {
                    setIntent(null);
                }
            }
            setWager((previous) => {
                const from = lastStatusRef.current;
                const to = next?.status ?? "";
                if (from !== to) {
                    lastStatusRef.current = to;
                    // Sound the transitions BOTH seats should hear.
                    if (to === "raised") {
                        playRaiseSound();
                    } else if (to === "locked" && (from === "negotiating" || from === "raised")) {
                        playLockSound();
                    }
                }
                if (next && previous?.status !== next.status) {
                    setError("");
                }
                return next;
            });
        } catch {
            // Transient — keep the last known state.
        }
    }, [gameId]);

    useEffect(() => {
        if (!active) {
            return undefined;
        }
        void reload();
        const poll = window.setInterval(() => void reload(), POLL_MS);
        const tick = window.setInterval(() => setNowTick(Date.now()), 500);
        return () => {
            window.clearInterval(poll);
            window.clearInterval(tick);
        };
    }, [active, reload]);

    useEffect(() => {
        if (wager?.status === "negotiating" && wager.myTurn) {
            setRaiseTo(Math.min(MAX_WAGER, Math.max(wager.myStake, wager.opponentStake) * 2));
        }
    }, [wager?.status, wager?.myTurn, wager?.myStake, wager?.opponentStake]);

    if (dismissed) {
        return null;
    }

    /* ---------- no wager yet: the late-arm surface (draft only) ---------- */

    if (!wager) {
        if (!active || intent === null) {
            return null;
        }
        const purse = intent.gold + intent.amount;
        const draftStake = Math.max(0, Math.floor(Number(stakeDraft) || 0));
        // Exactly what the PUT button is allowed to do, so Enter in the field cannot commit gold
        // the button itself would have refused.
        const canStakeHere = !busy && draftStake >= 1 && draftStake <= purse;
        const armHere = async (amount: number): Promise<void> => {
            if (busy) {
                return;
            }
            setBusy(true);
            setError("");
            try {
                playCallSound();
                const result = await setWagerIntent(amount);
                setIntent(result);
                setStakeDraft("");
            } catch (err) {
                setError(
                    isInsufficientSeasonCurrencyError(err)
                        ? tf("Not enough {currency}", { currency: t(currency.name) })
                        : (err as Error).message || t("Could not set the wager"),
                );
            } finally {
                setBusy(false);
            }
        };
        if (purse <= 0 || armHidden) {
            return null; // nothing to stake, nothing armed, or waved away — stay out of the draft's way
        }
        return (
            <Sheet
                variant="outlined"
                sx={{
                    ...hocPanelSx,
                    position: "fixed",
                    top: 14,
                    left: "50%",
                    transform: "translateX(-50%)",
                    zIndex: 60,
                    width: "min(420px, calc(100vw - 24px))",
                    px: 2,
                    py: 1.25,
                    borderColor: "rgba(255,182,76,0.45)",
                    boxShadow: "0 10px 34px rgba(0,0,0,0.5)",
                }}
            >
                {intent.amount > 0 ? (
                    <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                        <Stack direction="row" spacing={0.8} alignItems="center" sx={{ minWidth: 0 }}>
                            <CurrencyIcon iconSvg={currency.iconSvg} prominent size={34} />
                            <Box sx={{ minWidth: 0 }}>
                                <Stack direction="row" spacing={0.35} alignItems="baseline">
                                    <Typography level="title-lg" sx={{ color: hocColors.parchment, fontWeight: 800 }}>
                                        {intent.amount.toLocaleString()}
                                    </Typography>
                                    <Typography level="body-xs" sx={{ color: hocColors.gold, fontWeight: 800 }}>
                                        {currency.symbol}
                                    </Typography>
                                </Stack>
                                <Typography level="body-xs" sx={{ color: hocColors.muted }}>
                                    {t("on the table — if your opponent puts in too, the wager opens right here.")}
                                </Typography>
                            </Box>
                        </Stack>
                        <Stack direction="row" spacing={0.25} alignItems="center" sx={{ flexShrink: 0 }}>
                            <Button
                                size="sm"
                                variant="outlined"
                                sx={hocSoftButtonSx}
                                disabled={busy}
                                onClick={() => void armHere(0)}
                            >
                                {t("Take it back")}
                            </Button>
                            <Button size="sm" variant="plain" sx={dismissButtonSx} onClick={() => setArmHidden(true)}>
                                ✕
                            </Button>
                        </Stack>
                    </Stack>
                ) : (
                    <>
                        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.75 }}>
                            <CurrencyIcon iconSvg={currency.iconSvg} prominent size={30} />
                            <Typography level="body-sm" sx={{ color: hocColors.parchment }}>
                                {tf("Put {currency} on THIS match — winner takes the pot.", {
                                    currency: t(currency.name),
                                })}
                            </Typography>
                            <Button
                                size="sm"
                                variant="plain"
                                sx={{ ...dismissButtonSx, ml: "auto", flexShrink: 0 }}
                                onClick={() => setArmHidden(true)}
                            >
                                ✕
                            </Button>
                        </Stack>
                        <Stack direction="row" spacing={0.75} alignItems="center">
                            <Input
                                size="sm"
                                type="number"
                                placeholder={tf("{currency} to put", { currency: t(currency.name) })}
                                value={stakeDraft}
                                slotProps={{ input: { min: 1, max: purse, step: 1 } }}
                                onChange={(event) => setStakeDraft(event.target.value)}
                                onKeyDown={(event) => {
                                    // Typing an amount and hitting Enter puts it in, same as the button.
                                    if (event.key === "Enter" && canStakeHere) {
                                        event.preventDefault();
                                        void armHere(draftStake);
                                    }
                                }}
                                sx={{ ...hocInputSx, flex: 1 }}
                            />
                            <Button
                                size="sm"
                                variant="solid"
                                sx={hocPrimaryButtonSx}
                                disabled={!canStakeHere}
                                onClick={() => void armHere(draftStake)}
                            >
                                {t("Put")}
                            </Button>
                        </Stack>
                        <Typography level="body-xs" sx={{ color: hocColors.muted, mt: 0.5 }}>
                            {t("If the draft ends first, your wager rides your next match instead.")}
                        </Typography>
                    </>
                )}
                {error && (
                    <Typography level="body-xs" sx={{ color: hocColors.danger, mt: 0.5 }}>
                        {error}
                    </Typography>
                )}
            </Sheet>
        );
    }

    const secondsLeft = wager.deadlineAt > 0 ? Math.max(0, Math.ceil((wager.deadlineAt - nowTick) / 1000)) : 0;
    const pot = wager.amount * 2;

    const doCall = async (): Promise<void> => {
        if (busy) {
            return;
        }
        setBusy(true);
        setError("");
        try {
            playCallSound();
            await callWager(gameId);
            await reload();
        } catch (err) {
            setError((err as Error).message || t("Could not call"));
        } finally {
            setBusy(false);
        }
    };

    const doRaise = async (): Promise<void> => {
        if (busy) {
            return;
        }
        setBusy(true);
        setError("");
        try {
            playRaiseSound();
            await raiseWager(gameId, normalizedRaise);
            await reload();
        } catch (err) {
            setError(
                isInsufficientSeasonCurrencyError(err)
                    ? tf("Not enough {currency}", { currency: t(currency.name) })
                    : (err as Error).message || t("Could not raise"),
            );
        } finally {
            setBusy(false);
        }
    };

    /* ---------- settled/locked banners (compact, dismissible) ---------- */

    if (wager.status === "locked" || wager.status === "settled" || wager.status === "burned") {
        const text =
            wager.status === "locked"
                ? tf("Wager locked: {amount} {symbol} each — winner takes {pot} {symbol}", {
                      amount: wager.amount,
                      pot,
                      symbol: currency.symbol,
                  })
                : wager.status === "settled"
                  ? tf("Wager settled: {amount} {symbol} to the winner", {
                        amount: wager.payout,
                        symbol: currency.symbol,
                    })
                  : tf("Draw — the pot of {pot} {symbol} burns", { pot, symbol: currency.symbol });
        return (
            <Sheet
                variant="outlined"
                sx={{
                    ...hocPanelSx,
                    position: "fixed",
                    top: 14,
                    left: "50%",
                    transform: "translateX(-50%)",
                    zIndex: 60,
                    px: 2,
                    py: 0.9,
                    display: "flex",
                    alignItems: "center",
                    gap: 1.25,
                    borderColor: "rgba(255,182,76,0.55)",
                    boxShadow: "0 10px 34px rgba(0,0,0,0.5)",
                }}
            >
                <Typography level="body-sm" sx={{ color: hocColors.gold, fontWeight: 700 }}>
                    <Stack component="span" direction="row" spacing={0.7} alignItems="center">
                        <CurrencyIcon iconSvg={currency.iconSvg} prominent size={28} />
                        <span>{text}</span>
                    </Stack>
                </Typography>
                <Button size="sm" variant="plain" sx={dismissButtonSx} onClick={() => setDismissed(true)}>
                    ✕
                </Button>
            </Sheet>
        );
    }

    if (wager.status === "refunded") {
        return null;
    }

    /* ---------- the negotiation panel ---------- */

    const myTurn = wager.myTurn;
    const isRaised = wager.status === "raised";
    const callAmount = isRaised ? wager.raisedTo : Math.max(wager.myStake, wager.opponentStake);
    const minimumRaise = Math.max(wager.myStake, wager.opponentStake) * 2;
    const normalizedRaise = Math.floor(raiseTo);
    const canRaise =
        Number.isFinite(normalizedRaise) && normalizedRaise >= minimumRaise && normalizedRaise <= MAX_WAGER;

    return (
        <Sheet
            variant="outlined"
            sx={{
                ...hocPanelSx,
                position: "fixed",
                top: 14,
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 60,
                width: "min(460px, calc(100vw - 24px))",
                px: 2.25,
                py: 1.75,
                borderColor: "rgba(255,182,76,0.65)",
                boxShadow: "0 16px 50px rgba(0,0,0,0.6), 0 0 30px rgba(255,183,0,0.12)",
            }}
        >
            <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Stack direction="row" spacing={0.75} alignItems="center">
                    <CurrencyIcon iconSvg={currency.iconSvg} prominent size={34} />
                    <Typography level="title-md" sx={{ color: hocColors.gold, fontWeight: 800 }}>
                        {tf("{currency} on the line", { currency: t(currency.name) })}
                    </Typography>
                </Stack>
                {secondsLeft > 0 && (
                    <Typography
                        level="body-sm"
                        sx={{ color: secondsLeft <= 10 ? hocColors.danger : hocColors.muted, fontWeight: 700 }}
                    >
                        {secondsLeft}s
                    </Typography>
                )}
            </Stack>

            <Stack direction="row" spacing={0.75} sx={{ mt: 0.85, mb: 1 }}>
                {[
                    { label: t("Yours"), amount: wager.myStake },
                    { label: t("Opponent"), amount: wager.opponentStake },
                ].map(({ label, amount }) => (
                    <Sheet
                        key={label}
                        variant="soft"
                        sx={{
                            flex: 1,
                            minWidth: 0,
                            px: 1,
                            py: 0.65,
                            border: "1px solid rgba(220,177,88,0.22)",
                            borderRadius: "3px",
                            bgcolor: "rgba(220,177,88,0.06)",
                        }}
                    >
                        <Typography
                            level="body-xs"
                            sx={{ color: hocColors.muted, letterSpacing: "0.06em", textTransform: "uppercase" }}
                        >
                            {label}
                        </Typography>
                        <Stack direction="row" spacing={0.45} alignItems="center">
                            <CurrencyIcon iconSvg={currency.iconSvg} prominent size={21} />
                            <Typography level="title-md" sx={{ color: hocColors.parchment, fontWeight: 800 }}>
                                {amount.toLocaleString()}
                            </Typography>
                            <Typography level="body-xs" sx={{ color: hocColors.gold, fontWeight: 800 }}>
                                {currency.symbol}
                            </Typography>
                        </Stack>
                    </Sheet>
                ))}
            </Stack>

            {isRaised ? (
                myTurn ? (
                    <>
                        <Typography level="body-sm" sx={{ color: hocColors.parchment, mb: 1 }}>
                            {t("Opponent raised the wager to")}{" "}
                            <b style={{ color: hocColors.gold }}>{wager.raisedTo}</b>{" "}
                            {tf("{symbol} each. Call it, or let the match play for {amount} each.", {
                                symbol: currency.symbol,
                                amount: wager.amount,
                            })}
                        </Typography>
                        <Button
                            fullWidth
                            variant="solid"
                            sx={hocPrimaryButtonSx}
                            disabled={busy}
                            onClick={() => void doCall()}
                        >
                            {t("CALL to")} {wager.raisedTo} — {t("play for")} {wager.raisedTo * 2}
                        </Button>
                    </>
                ) : (
                    <Typography level="body-sm" sx={{ color: hocColors.muted }}>
                        {t("You raised to")} {wager.raisedTo} — {t("waiting for the call…")}
                    </Typography>
                )
            ) : myTurn ? (
                <>
                    <Typography level="body-sm" sx={{ color: hocColors.parchment, mb: 1 }}>
                        {t("Your opponent put in more. Do nothing to play")} <b>{wager.amount}</b> {t("each, call to")}{" "}
                        <b>{callAmount}</b> {t("or raise to at least")} <b>{minimumRaise}</b>.
                    </Typography>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                        <Input
                            size="sm"
                            type="number"
                            value={raiseTo}
                            slotProps={{ input: { min: minimumRaise, max: MAX_WAGER, step: 1 } }}
                            onChange={(event) => setRaiseTo(Math.floor(Number(event.target.value) || 0))}
                            sx={{ ...hocInputSx, flex: 1 }}
                        />
                        <Typography
                            level="body-sm"
                            sx={{ color: hocColors.gold, minWidth: 52, textAlign: "right", fontWeight: 700 }}
                        >
                            {normalizedRaise}
                        </Typography>
                    </Stack>
                    <Stack direction="row" spacing={1}>
                        <Button
                            fullWidth
                            variant="outlined"
                            sx={hocSoftButtonSx}
                            disabled={busy}
                            onClick={() => void doCall()}
                        >
                            {t("CALL to")} {callAmount} — {t("play for")} {callAmount * 2}
                        </Button>
                        <Button
                            fullWidth
                            variant="solid"
                            sx={hocPrimaryButtonSx}
                            disabled={busy || !canRaise}
                            onClick={() => void doRaise()}
                        >
                            {t("RAISE to")} {normalizedRaise}
                        </Button>
                    </Stack>
                    <Typography level="body-xs" sx={{ color: hocColors.muted, mt: 0.75 }}>
                        {tf("Do nothing and the match plays for {pot} {symbol} total.", {
                            pot,
                            symbol: currency.symbol,
                        })}
                    </Typography>
                </>
            ) : (
                <Typography level="body-sm" sx={{ color: hocColors.muted }}>
                    {t("You put in more — your opponent is deciding: do nothing to play")} {wager.amount}{" "}
                    {t("each, call to")} {callAmount} {t("or raise to at least")} {minimumRaise}…
                </Typography>
            )}
            {error && (
                <Typography level="body-xs" sx={{ color: hocColors.danger, mt: 0.75 }}>
                    {error}
                </Typography>
            )}
        </Sheet>
    );
};
