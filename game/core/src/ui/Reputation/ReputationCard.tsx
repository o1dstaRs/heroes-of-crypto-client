import Box from "@mui/joy/Box";
import Chip from "@mui/joy/Chip";
import Sheet from "@mui/joy/Sheet";
import Stack from "@mui/joy/Stack";
import Typography from "@mui/joy/Typography";
import React, { useEffect, useState } from "react";

import { reputationBandLabel, reputationBarPct, reputationLimitsText } from "./reputationModel";
import { fetchReputation, type Reputation } from "../../api/reputation_client";
import { t, useTranslation } from "../../i18n/i18n";
import { hocColors, hocPanelSx } from "../hocTheme";

const BAND_COLORS = {
    restricted: "#ff8a7a",
    probation: "#e7c27a",
    good: "#8fdca4",
    honorable: "#f0c890",
} as const;

/**
 * The player's own Reputation in the portal (integrity phase 4): the final number, its band, and where it sits on the
 * scale. Other players never see this; they only see an Honorable badge on a public profile.
 *
 * The score is shown WITHOUT its itemization — no ledger of changes, no account bonuses (owner, 20 Sep). The server
 * does not send either any more, so there is nothing here to hide: what a match, an abandon or a linked wallet is
 * worth stays on the server, where knowing it cannot help anyone farm it.
 */
export const ReputationCard: React.FC = () => {
    // Subscribed for the language itself: every label below comes from t() and has to re-render when it changes.
    useTranslation();
    const [reputation, setReputation] = useState<Reputation | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let cancelled = false;
        fetchReputation()
            .then((next) => {
                if (!cancelled) {
                    setReputation(next);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setFailed(true);
                }
            });
        return () => {
            cancelled = true;
        };
    }, []);

    if (failed) {
        return (
            <Sheet variant="outlined" sx={{ ...hocPanelSx, p: 2 }}>
                <Typography level="body-sm" textColor={hocColors.muted}>
                    {t("Couldn't load your Reputation.")}
                </Typography>
            </Sheet>
        );
    }
    if (!reputation) {
        return null;
    }

    const { rules } = reputation;
    const limits = reputationLimitsText(reputation, rules);
    const bandColor = BAND_COLORS[reputation.band];

    return (
        <Sheet variant="outlined" sx={{ ...hocPanelSx, p: 2 }} data-testid="reputation-card">
            <Stack spacing={1.5}>
                <Stack direction="row" spacing={1.25} alignItems="baseline" sx={{ flexWrap: "wrap" }}>
                    <Typography level="title-lg" sx={{ color: hocColors.parchment }}>
                        {t("Reputation")}
                    </Typography>
                    <Typography
                        level="h2"
                        sx={{ color: bandColor, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}
                        aria-label={`${t("Reputation")}: ${reputation.score}`}
                    >
                        {reputation.score}
                    </Typography>
                    <Chip size="sm" variant="soft" sx={{ color: bandColor, bgcolor: "rgba(255,255,255,0.06)" }}>
                        {reputationBandLabel(reputation.band)}
                    </Chip>
                    {reputation.isNew && (
                        <Chip
                            size="sm"
                            variant="outlined"
                            sx={{
                                color: hocColors.mutedStrong,
                                bgcolor: "transparent",
                                borderColor: "rgba(255,255,255,0.22)",
                            }}
                        >
                            {t("New account")}
                        </Chip>
                    )}
                </Stack>
                <Typography level="body-sm" textColor={hocColors.muted}>
                    {t("How reliably you play ranked. Everyone starts at 50.")}
                </Typography>

                <Box>
                    <Box
                        role="img"
                        aria-label={`${reputation.score} / 100`}
                        sx={{
                            position: "relative",
                            display: "grid",
                            gridTemplateColumns: `${rules.bands.probation}fr ${rules.bands.good - rules.bands.probation}fr ${
                                rules.bands.honorable - rules.bands.good
                            }fr ${101 - rules.bands.honorable}fr`,
                            height: 10,
                            borderRadius: "3px",
                            overflow: "visible",
                        }}
                    >
                        <Box sx={{ bgcolor: "rgba(255,90,63,0.35)", borderRadius: "3px 0 0 3px" }} />
                        <Box sx={{ bgcolor: "rgba(220,177,88,0.3)" }} />
                        <Box sx={{ bgcolor: "rgba(70,209,96,0.3)" }} />
                        <Box sx={{ bgcolor: "rgba(220,177,88,0.55)", borderRadius: "0 3px 3px 0" }} />
                        <Box
                            sx={{
                                position: "absolute",
                                top: -4,
                                bottom: -4,
                                width: 3,
                                left: `calc(${reputationBarPct(reputation.score)}% - 1px)`,
                                bgcolor: hocColors.parchment,
                                borderRadius: "1px",
                                boxShadow: "0 0 6px rgba(239,228,204,0.7)",
                            }}
                        />
                    </Box>
                    {/* Each label sits at its own value on the same 0–100 scale as the bands and the marker. */}
                    <Box sx={{ position: "relative", height: 18, mt: 0.5, fontVariantNumeric: "tabular-nums" }}>
                        {[0, rules.bands.probation, rules.bands.good, rules.bands.honorable, 100].map((tick) => (
                            <Typography
                                key={tick}
                                level="body-xs"
                                textColor={hocColors.muted}
                                sx={{
                                    position: "absolute",
                                    left: `${tick}%`,
                                    transform:
                                        tick === 0 ? "none" : tick === 100 ? "translateX(-100%)" : "translateX(-50%)",
                                }}
                            >
                                {tick}
                            </Typography>
                        ))}
                    </Box>
                </Box>

                {limits && (
                    <Typography level="body-sm" sx={{ color: hocColors.danger }}>
                        {limits}
                    </Typography>
                )}
            </Stack>
        </Sheet>
    );
};
