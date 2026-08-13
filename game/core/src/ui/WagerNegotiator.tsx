import { Button, Sheet, Slider, Stack, Typography } from "@mui/joy";
import React, { useCallback, useEffect, useRef, useState } from "react";

import { callWager, fetchWager, raiseWager, type WagerState } from "../api/social_client";
import { t } from "../i18n/i18n";
import { playCallSound, playLockSound, playRaiseSound } from "./audio/chipSounds";
import { hocColors, hocPanelSx, hocPrimaryButtonSx, hocSoftButtonSx } from "./hocTheme";

/**
 * The poker moment of a wagered match. Mounted over the draft; polls the wager (it forms a few
 * seconds into pick) and walks the one-street negotiation:
 *
 *   your stakes matched   -> a banner: locked, winner takes the pot;
 *   you bid LESS          -> the decision panel: CALL to play your bid, or RAISE the pot toward
 *                            the opponent's bid (they already committed it — they cannot decline);
 *   you bid MORE          -> "opponent is deciding…", then their raise arrives as a single CALL
 *                            button on your side;
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

export const WagerNegotiator: React.FC<WagerNegotiatorProps> = ({ gameId, active }) => {
    const [wager, setWager] = useState<WagerState | null>(null);
    const [raiseTo, setRaiseTo] = useState(0);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [nowTick, setNowTick] = useState(Date.now());
    const [dismissed, setDismissed] = useState(false);
    const lastStatusRef = useRef<string>("");

    const reload = useCallback(async (): Promise<void> => {
        try {
            const next = await fetchWager(gameId);
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

    // Default the raise slider to a middle-of-the-band suggestion whenever negotiation opens.
    useEffect(() => {
        if (wager?.status === "negotiating" && wager.myTurn) {
            const floor = wager.amount;
            const ceiling = wager.opponentStake;
            setRaiseTo(Math.min(ceiling, Math.max(floor + 1, Math.round((floor + ceiling) / 2))));
        }
    }, [wager?.status, wager?.myTurn, wager?.amount, wager?.opponentStake]);

    if (!wager || dismissed) {
        return null;
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
            await raiseWager(gameId, raiseTo);
            await reload();
        } catch (err) {
            setError((err as Error).message || t("Could not raise"));
        } finally {
            setBusy(false);
        }
    };

    /* ---------- settled/locked banners (compact, dismissible) ---------- */

    if (wager.status === "locked" || wager.status === "settled" || wager.status === "burned") {
        const text =
            wager.status === "locked"
                ? `${t("Wager locked")}: ${wager.amount} ${t("gold each — winner takes")} ${pot}`
                : wager.status === "settled"
                  ? `${t("Wager settled")}: ${wager.payout} ${t("gold to the winner")}`
                  : `${t("Draw — the pot of")} ${pot} ${t("gold burns")}`;
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
                    💰 {text}
                </Typography>
                <Button
                    size="sm"
                    variant="plain"
                    sx={{ color: hocColors.muted, minHeight: 0, py: 0.25 }}
                    onClick={() => setDismissed(true)}
                >
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
            <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                <Typography level="title-md" sx={{ color: hocColors.gold, fontWeight: 800 }}>
                    {t("Gold on the line")}
                </Typography>
                {secondsLeft > 0 && (
                    <Typography
                        level="body-sm"
                        sx={{ color: secondsLeft <= 10 ? hocColors.danger : hocColors.muted, fontWeight: 700 }}
                    >
                        {secondsLeft}s
                    </Typography>
                )}
            </Stack>

            <Stack direction="row" spacing={2} sx={{ mt: 0.75, mb: 1 }}>
                <Typography level="body-sm" sx={{ color: hocColors.parchment }}>
                    {t("Your stake")}: <b>{wager.myStake}</b>
                </Typography>
                <Typography level="body-sm" sx={{ color: hocColors.parchment }}>
                    {t("Opponent")}: <b>{wager.opponentStake}</b>
                </Typography>
            </Stack>

            {isRaised ? (
                myTurn ? (
                    <>
                        <Typography level="body-sm" sx={{ color: hocColors.parchment, mb: 1 }}>
                            {t("Opponent raised the wager to")}{" "}
                            <b style={{ color: hocColors.gold }}>{wager.raisedTo}</b>{" "}
                            {t("gold each — you already committed it.")}
                        </Typography>
                        <Button
                            fullWidth
                            variant="solid"
                            sx={hocPrimaryButtonSx}
                            disabled={busy}
                            onClick={() => void doCall()}
                        >
                            {t("CALL")} — {t("play for")} {wager.raisedTo * 2}
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
                        {t("Your opponent staked more. Play your")} <b>{wager.amount}</b>
                        {t(", or raise toward their")} <b>{wager.opponentStake}</b>.
                    </Typography>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                        <Slider
                            size="sm"
                            min={wager.amount + 1}
                            max={wager.opponentStake}
                            value={Math.min(Math.max(raiseTo, wager.amount + 1), wager.opponentStake)}
                            onChange={(_event, value) => setRaiseTo(value as number)}
                            sx={{ flex: 1, "--Slider-trackBackground": hocColors.gold }}
                        />
                        <Typography
                            level="body-sm"
                            sx={{ color: hocColors.gold, minWidth: 52, textAlign: "right", fontWeight: 700 }}
                        >
                            {Math.min(Math.max(raiseTo, wager.amount + 1), wager.opponentStake)}
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
                            {t("CALL")} — {t("play for")} {pot}
                        </Button>
                        <Button
                            fullWidth
                            variant="solid"
                            sx={hocPrimaryButtonSx}
                            disabled={busy || raiseTo <= wager.amount}
                            onClick={() => void doRaise()}
                        >
                            {t("RAISE to")} {Math.min(Math.max(raiseTo, wager.amount + 1), wager.opponentStake)}
                        </Button>
                    </Stack>
                    <Typography level="body-xs" sx={{ color: hocColors.muted, mt: 0.75 }}>
                        {t("Do nothing and the match plays for")} {pot} {t("gold total.")}
                    </Typography>
                </>
            ) : (
                <Typography level="body-sm" sx={{ color: hocColors.muted }}>
                    {t("You staked more — your opponent is deciding: play their")} {wager.opponentStake}{" "}
                    {t("or raise toward your")} {wager.myStake}…
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
