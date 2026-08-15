import { Button, Input, Sheet, Stack, Typography } from "@mui/joy";
import React, { useCallback, useEffect, useState } from "react";

import { isInsufficientSeasonCurrencyError, type RankedSeasonCurrency } from "../api/ranked_season_client";
import { fetchWagerIntent, setWagerIntent } from "../api/social_client";
import { t, tf } from "../i18n/i18n";
import { playCallSound } from "./audio/chipSounds";
import { CurrencyIcon } from "./GoldCurrencyIcon";
import { hocColors, hocInputSx, hocPanelSx, hocPrimaryButtonSx, hocSoftButtonSx } from "./hocTheme";

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
            <Sheet variant="outlined" sx={{ ...hocPanelSx, p: 1.5, width: "100%", textAlign: "center" }}>
                <Typography level="body-sm" sx={{ color: hocColors.muted }}>
                    ⚔️{" "}
                    {tf("Win ranked games to earn {currency} — then stake it on your matches, winner takes all.", {
                        currency: t(currency.name),
                    })}
                </Typography>
            </Sheet>
        );
    }

    return (
        <Sheet variant="outlined" sx={{ ...hocPanelSx, p: 1.5, width: "100%" }}>
            <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 0.75 }}>
                <Typography
                    level="title-sm"
                    sx={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 0.5,
                        color: hocColors.gold,
                        fontWeight: 800,
                    }}
                >
                    <CurrencyIcon iconSvg={currency.iconSvg} size={16} />
                    {tf("{currency} on the line", { currency: t(currency.name) })}
                </Typography>
                <Typography level="body-xs" sx={{ color: hocColors.muted }}>
                    {t("Purse")}: {gold} {currency.symbol}
                </Typography>
            </Stack>

            {armed > 0 ? (
                <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                    <Typography level="body-sm" sx={{ color: hocColors.parchment }}>
                        <b style={{ color: hocColors.gold }}>{armed}</b>{" "}
                        {tf(
                            "{currency} rides your next match. If your opponent stakes too — winner takes the pot, a tie burns it.",
                            { currency: t(currency.name) },
                        )}
                    </Typography>
                    <Button
                        size="sm"
                        variant="outlined"
                        sx={{ ...hocSoftButtonSx, flexShrink: 0 }}
                        disabled={busy}
                        onClick={() => void apply(0)}
                    >
                        {t("Take it back")}
                    </Button>
                </Stack>
            ) : (
                <>
                    <Typography level="body-xs" sx={{ color: hocColors.muted, mb: 0.75 }}>
                        {tf(
                            "Stake {currency} on your next match. Matched stakes play as-is; if yours is lower you can call or raise when the match is found.",
                            { currency: t(currency.name) },
                        )}
                    </Typography>
                    <Stack direction="row" spacing={0.75} alignItems="center">
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
                            sx={{ ...hocInputSx, flex: 1 }}
                        />
                        {[0.25, 0.5, 1].map((share) => (
                            <Button
                                key={share}
                                size="sm"
                                variant="outlined"
                                sx={hocSoftButtonSx}
                                disabled={busy}
                                onClick={() => setDraft(String(Math.max(1, Math.floor(total * share))))}
                            >
                                {share === 1 ? t("All-in") : `${share * 100}%`}
                            </Button>
                        ))}
                        <Button
                            size="sm"
                            variant="solid"
                            sx={hocPrimaryButtonSx}
                            disabled={!canStake}
                            onClick={() => void apply(stake)}
                        >
                            {t("Stake it")}
                        </Button>
                    </Stack>
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
