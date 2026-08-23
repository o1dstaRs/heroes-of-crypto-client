import { Box, Button, Input, Sheet, Stack, Typography } from "@mui/joy";
import React, { useCallback, useEffect, useState } from "react";

import { isInsufficientSeasonCurrencyError, type RankedSeasonCurrency } from "../api/ranked_season_client";
import { fetchWagerIntent, setWagerIntent } from "../api/social_client";
import { t, tf } from "../i18n/i18n";
import { playCallSound } from "./audio/chipSounds";
import { CurrencyIcon } from "./GoldCurrencyIcon";
import {
    hocActionPrimaryButtonSx,
    hocActionSoftButtonSx,
    hocColors,
    hocDisplayFontFamily,
    hocInputSx,
} from "./hocTheme";

/**
 * The arena's "gold on the line" box. Arms a stake for the NEXT ranked match: the gold escrows the
 * moment it is set (so it cannot be double-spent elsewhere) and rides the queue until an opponent
 * who also staked appears — then the poker moment happens in the draft (see WagerNegotiator).
 *
 * A player with nothing to stake gets a friendly pointer instead of a dead input: gold is EARNED by
 * winning ranked games, and the box says exactly that.
 */

export const WagerStakeBox: React.FC<{ currency: Readonly<RankedSeasonCurrency> }> = ({ currency }) => {
    const [gold, setGold] = useState<number | null>(null);
    const [armed, setArmed] = useState(0);
    const [draft, setDraft] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const reload = useCallback(async (): Promise<void> => {
        try {
            const intent = await fetchWagerIntent();
            setGold(intent.gold);
            setArmed(intent.amount);
        } catch {
            setGold(null); // endpoint unavailable — render nothing rather than a broken box
        }
    }, []);

    useEffect(() => {
        void reload();
    }, [reload]);

    if (gold === null) {
        return null;
    }

    const stake = Math.max(0, Math.floor(Number(draft) || 0));
    const total = gold + armed; // what the player COULD stake in full
    // Exactly what the "Stake it" button is allowed to do, so Enter in the field cannot commit gold the
    // button itself would have refused — an empty box, a zero, or more than the purse holds.
    const canStake = !busy && stake >= 1 && stake <= total;

    const apply = async (amount: number): Promise<void> => {
        if (busy) {
            return;
        }
        setBusy(true);
        setError("");
        try {
            playCallSound();
            const result = await setWagerIntent(amount);
            setArmed(result.amount);
            setGold(result.gold);
            setDraft("");
        } catch (err) {
            setError(
                isInsufficientSeasonCurrencyError(err)
                    ? tf("Not enough {currency}", { currency: t(currency.name) })
                    : (err as Error).message || t("Could not set the stake"),
            );
        } finally {
            setBusy(false);
        }
    };

    /* Nothing to stake and nothing armed: point at where gold comes from instead of a dead form. */
    if (total <= 0) {
        return (
            <Sheet
                variant="plain"
                sx={{
                    p: { xs: 1.25, sm: 1.5 },
                    alignSelf: "stretch",
                    textAlign: "center",
                    color: hocColors.parchment,
                    border: "none",
                    borderTop: "1px solid rgba(112,75,42,0.46)",
                    borderRadius: 0,
                    background: "radial-gradient(circle at 7% 50%, rgba(220,177,88,0.1), transparent 38%)",
                    boxShadow: "none",
                }}
            >
                <Stack direction="row" spacing={1} alignItems="center" justifyContent="center">
                    <CurrencyIcon iconSvg={currency.iconSvg} prominent size={34} />
                    <Typography level="body-sm" sx={{ color: hocColors.muted, textAlign: "left" }}>
                        {tf("Win ranked games to earn {currency} — then stake it on your matches, winner takes all.", {
                            currency: t(currency.name),
                        })}
                    </Typography>
                </Stack>
            </Sheet>
        );
    }

    return (
        <Sheet
            variant="plain"
            sx={{
                p: { xs: 1.25, sm: 1.5 },
                alignSelf: "stretch",
                color: hocColors.parchment,
                border: "none",
                borderTop: "1px solid rgba(112,75,42,0.46)",
                borderRadius: 0,
                background: "radial-gradient(circle at 7% 48%, rgba(220,177,88,0.1), transparent 38%)",
                boxShadow: "none",
            }}
        >
            {armed > 0 ? (
                <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={{ xs: 1, sm: 2 }}
                    alignItems={{ xs: "stretch", sm: "center" }}
                    justifyContent="space-between"
                >
                    <Stack direction="row" spacing={1.2} alignItems="center" sx={{ minWidth: 0, flex: 1 }}>
                        <CurrencyIcon iconSvg={currency.iconSvg} prominent size={48} />
                        <Box sx={{ minWidth: 0, textAlign: "left" }}>
                            <Typography
                                level="body-xs"
                                sx={{
                                    color: hocColors.gold,
                                    fontFamily: hocDisplayFontFamily,
                                    fontWeight: 700,
                                    letterSpacing: "0.12em",
                                    textTransform: "uppercase",
                                }}
                            >
                                {tf("{currency} on the line", { currency: t(currency.name) })}
                            </Typography>
                            <Stack direction="row" spacing={0.45} alignItems="baseline">
                                <Typography
                                    level="h2"
                                    sx={{ color: hocColors.parchment, fontFamily: hocDisplayFontFamily, lineHeight: 1 }}
                                >
                                    {armed.toLocaleString()}
                                </Typography>
                                <Typography level="title-sm" sx={{ color: hocColors.gold, fontWeight: 800 }}>
                                    {currency.symbol}
                                </Typography>
                            </Stack>
                            <Typography level="body-xs" sx={{ mt: 0.35, color: hocColors.muted, lineHeight: 1.4 }}>
                                {tf(
                                    "{currency} rides your next match. If your opponent stakes too — winner takes the pot, a tie burns it.",
                                    { currency: t(currency.name) },
                                )}
                            </Typography>
                        </Box>
                    </Stack>
                    <Stack
                        direction={{ xs: "row", sm: "column" }}
                        spacing={0.65}
                        alignItems={{ xs: "center", sm: "flex-end" }}
                        justifyContent={{ xs: "space-between", sm: "center" }}
                        sx={{ flexShrink: 0 }}
                    >
                        <Box sx={{ textAlign: { xs: "left", sm: "right" } }}>
                            <Typography
                                level="body-xs"
                                sx={{ color: hocColors.muted, letterSpacing: "0.08em", textTransform: "uppercase" }}
                            >
                                {t("Purse")}
                            </Typography>
                            <Stack
                                direction="row"
                                spacing={0.45}
                                alignItems="center"
                                justifyContent={{ xs: "flex-start", sm: "flex-end" }}
                            >
                                <CurrencyIcon iconSvg={currency.iconSvg} prominent size={26} />
                                <Typography level="title-lg" sx={{ color: hocColors.parchment, fontWeight: 700 }}>
                                    {gold.toLocaleString()}
                                </Typography>
                                <Typography level="body-xs" sx={{ color: hocColors.gold, fontWeight: 800 }}>
                                    {currency.symbol}
                                </Typography>
                            </Stack>
                        </Box>
                        <Button
                            size="sm"
                            variant="outlined"
                            sx={{
                                ...hocActionSoftButtonSx,
                                minHeight: 36,
                                fontFamily: hocDisplayFontFamily,
                            }}
                            disabled={busy}
                            onClick={() => void apply(0)}
                        >
                            {t("Take it back")}
                        </Button>
                    </Stack>
                </Stack>
            ) : (
                <>
                    <Stack
                        direction={{ xs: "column", sm: "row" }}
                        spacing={{ xs: 0.75, sm: 1 }}
                        justifyContent="space-between"
                        alignItems={{ xs: "stretch", sm: "center" }}
                        sx={{ mb: 0.75 }}
                    >
                        <Stack direction="row" spacing={0.8} alignItems="center">
                            <CurrencyIcon iconSvg={currency.iconSvg} prominent size={34} />
                            <Typography
                                level="title-sm"
                                sx={{
                                    color: hocColors.gold,
                                    fontFamily: hocDisplayFontFamily,
                                    fontWeight: 400,
                                    letterSpacing: "0.06em",
                                }}
                            >
                                {tf("{currency} on the line", { currency: t(currency.name) })}
                            </Typography>
                        </Stack>
                        <Stack direction="row" spacing={0.45} alignItems="center">
                            <Typography level="body-xs" sx={{ color: hocColors.muted }}>
                                {t("Purse")}
                            </Typography>
                            <CurrencyIcon iconSvg={currency.iconSvg} prominent size={26} />
                            <Typography level="title-lg" sx={{ color: hocColors.parchment, fontWeight: 700 }}>
                                {gold.toLocaleString()}
                            </Typography>
                            <Typography level="body-xs" sx={{ color: hocColors.gold, fontWeight: 800 }}>
                                {currency.symbol}
                            </Typography>
                        </Stack>
                    </Stack>
                    <Typography level="body-xs" sx={{ color: hocColors.muted, mb: 0.75 }}>
                        {tf(
                            "Stake {currency} on your next match. Matched stakes play as-is; if yours is lower you can call or raise when the match is found.",
                            { currency: t(currency.name) },
                        )}
                    </Typography>
                    <Box
                        sx={{
                            display: "grid",
                            gridTemplateColumns: {
                                xs: "repeat(3, minmax(0, 1fr))",
                                sm: "minmax(190px, 1fr) repeat(3, minmax(58px, auto)) minmax(96px, auto)",
                            },
                            gap: 0.75,
                            alignItems: "stretch",
                        }}
                    >
                        <Input
                            size="sm"
                            type="number"
                            placeholder={tf("{currency} to stake", { currency: t(currency.name) })}
                            value={draft}
                            slotProps={{ input: { min: 1, max: total, step: 1 } }}
                            onChange={(event) => setDraft(event.target.value)}
                            onKeyDown={(event) => {
                                // Typing an amount and hitting Enter stakes it, same as pressing the button.
                                if (event.key === "Enter" && canStake) {
                                    event.preventDefault();
                                    void apply(stake);
                                }
                            }}
                            sx={{
                                ...hocInputSx,
                                gridColumn: { xs: "1 / -1", sm: "auto" },
                                minHeight: 42,
                                borderRadius: "2px",
                            }}
                        />
                        {[0.25, 0.5, 1].map((share) => (
                            <Button
                                key={share}
                                size="sm"
                                variant="outlined"
                                sx={{
                                    ...hocActionSoftButtonSx,
                                    minHeight: 42,
                                    px: 1,
                                    fontFamily: hocDisplayFontFamily,
                                }}
                                disabled={busy}
                                onClick={() => setDraft(String(Math.max(1, Math.floor(total * share))))}
                            >
                                {share === 1 ? t("All-in") : `${share * 100}%`}
                            </Button>
                        ))}
                        <Button
                            size="sm"
                            variant="solid"
                            sx={{
                                ...hocActionPrimaryButtonSx,
                                gridColumn: { xs: "1 / -1", sm: "auto" },
                                minHeight: 42,
                                fontFamily: hocDisplayFontFamily,
                            }}
                            disabled={!canStake}
                            onClick={() => void apply(stake)}
                        >
                            {t("Stake it")}
                        </Button>
                    </Box>
                </>
            )}
            {error && (
                <Typography level="body-xs" sx={{ color: hocColors.danger, mt: 0.5 }}>
                    {error}
                </Typography>
            )}
        </Sheet>
    );
};
