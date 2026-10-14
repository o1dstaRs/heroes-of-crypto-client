import Box from "@mui/joy/Box";
import Chip from "@mui/joy/Chip";
import Sheet from "@mui/joy/Sheet";
import Stack from "@mui/joy/Stack";
import Typography from "@mui/joy/Typography";
import React from "react";

import { reputationBandLabel, reputationBarPct, reputationLimitsText } from "./reputationModel";
import { DEFAULT_REPUTATION_RULES, fetchReputation, type Reputation } from "../../api/reputation_client";
import { t, useTranslation } from "../../i18n/i18n";
import { hocColors } from "../hocTheme";
import { isMockPortalEnabled } from "../PlayerPortal/mockPortal";
import { createPlayerResource } from "../PlayerPortal/playerResource";
import { usePlayerResource } from "../PlayerPortal/usePlayerResource";
import { PlayerPortalReputationSkeleton } from "../PlayerPortal/PlayerPortalLoading";

const previewReputation: Reputation = {
    score: 86,
    band: "honorable",
    isNew: false,
    restricted: false,
    rules: DEFAULT_REPUTATION_RULES,
};

const reputationResource = createPlayerResource(
    () => (isMockPortalEnabled() ? Promise.resolve(previewReputation) : fetchReputation()),
    () => t("Couldn't load your Reputation."),
);

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
export const ReputationCard: React.FC<{ reloadKey?: number }> = ({ reloadKey = 0 }) => {
    // Subscribed for the language itself: every label below comes from t() and has to re-render when it changes.
    useTranslation();
    const { data: reputation, error } = usePlayerResource(reputationResource, reloadKey);

    if (error && !reputation) {
        return (
            <Sheet variant="plain" sx={{ p: 1, bgcolor: "transparent", border: "none", minHeight: 0 }}>
                <Typography level="body-sm" textColor={hocColors.muted}>
                    {t("Couldn't load your Reputation.")}
                </Typography>
            </Sheet>
        );
    }
    if (!reputation) {
        return <PlayerPortalReputationSkeleton />;
    }

    const { rules } = reputation;
    const limits = reputationLimitsText(reputation, rules);
    const bandColor = BAND_COLORS[reputation.band];

    return (
        <Sheet
            variant="plain"
            sx={{ px: { xs: 1, sm: 3.5 }, py: 2, bgcolor: "transparent", border: "none", minHeight: 0 }}
            data-testid="reputation-card"
        >
            <Box
                sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", sm: "1fr minmax(200px, 360px)" },
                    columnGap: 4,
                    rowGap: 1,
                    alignItems: "center",
                }}
            >
                <Box>
                    <Stack direction="row" spacing={1.25} alignItems="baseline" sx={{ flexWrap: "wrap" }}>
                        <Typography level="title-md" sx={{ color: hocColors.parchment }}>
                            {t("Reputation")}
                        </Typography>
                        <Typography
                            level="h2"
                            sx={{
                                color: bandColor,
                                fontVariantNumeric: "tabular-nums",
                                lineHeight: 1,
                                fontSize: 24,
                                fontWeight: 400,
                            }}
                            aria-label={`${t("Reputation")}: ${reputation.score}`}
                        >
                            {reputation.score}
                        </Typography>
                        <Chip size="sm" variant="plain" sx={{ color: bandColor, bgcolor: "transparent", p: 0 }}>
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
                    <Typography level="body-xs" textColor={hocColors.muted} sx={{ mt: 0.75 }}>
                        {t("How reliably you play ranked. Everyone starts at 50.")}
                    </Typography>
                </Box>
                <Box sx={{ pt: 1 }}>
                    <Box
                        role="img"
                        aria-label={`${reputation.score} / 100`}
                        sx={{
                            position: "relative",
                            display: "grid",
                            gridTemplateColumns: `${rules.bands.probation}fr ${rules.bands.good - rules.bands.probation}fr ${
                                rules.bands.honorable - rules.bands.good
                            }fr ${101 - rules.bands.honorable}fr`,
                            height: 4,
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
                                top: -3,
                                bottom: -3,
                                width: 3,
                                left: `calc(${reputationBarPct(reputation.score)}% - 1px)`,
                                bgcolor: hocColors.parchment,
                                borderRadius: "1px",
                                boxShadow: "none",
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
            </Box>
        </Sheet>
    );
};
