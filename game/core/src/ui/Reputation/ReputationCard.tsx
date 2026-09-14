import Box from "@mui/joy/Box";
import Button from "@mui/joy/Button";
import Chip from "@mui/joy/Chip";
import Sheet from "@mui/joy/Sheet";
import Stack from "@mui/joy/Stack";
import Typography from "@mui/joy/Typography";
import React, { useEffect, useState } from "react";

import {
    reputationAccountLines,
    reputationBandLabel,
    reputationBarPct,
    reputationLimitsText,
    reputationLogText,
    reputationPoints,
} from "./reputationModel";
import { fetchReputation, type Reputation } from "../../api/reputation_client";
import { t, useTranslation } from "../../i18n/i18n";
import { hocColors, hocPanelSx, hocSoftButtonSx } from "../hocTheme";

const COLLAPSED_ROWS = 5;

const BAND_COLORS = {
    restricted: "#ff8a7a",
    probation: "#e7c27a",
    good: "#8fdca4",
    honorable: "#f0c890",
} as const;

/**
 * The player's own Reputation in the portal (integrity phase 4): the number, the band, where it sits on the scale,
 * every change with its reason, and the account bonuses. Other players never see this; they only see an Honorable
 * badge on a public profile.
 */
export const ReputationCard: React.FC = () => {
    const { language } = useTranslation();
    const [reputation, setReputation] = useState<Reputation | null>(null);
    const [failed, setFailed] = useState(false);
    const [expanded, setExpanded] = useState(false);

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
    const rows = expanded ? reputation.log : reputation.log.slice(0, COLLAPSED_ROWS);
    const dateFormat = new Intl.DateTimeFormat(language === "ru" ? "ru-RU" : "en-GB", {
        day: "numeric",
        month: "short",
    });
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
                        <Chip size="sm" variant="outlined" sx={{ color: hocColors.muted }}>
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
                    <Stack
                        direction="row"
                        justifyContent="space-between"
                        sx={{ mt: 0.5, fontVariantNumeric: "tabular-nums" }}
                    >
                        {[0, rules.bands.probation, rules.bands.good, rules.bands.honorable, 100].map((tick) => (
                            <Typography key={tick} level="body-xs" textColor={hocColors.muted}>
                                {tick}
                            </Typography>
                        ))}
                    </Stack>
                </Box>

                {limits && (
                    <Typography level="body-sm" sx={{ color: hocColors.danger }}>
                        {limits}
                    </Typography>
                )}

                <Box
                    sx={{
                        display: "grid",
                        gap: 2,
                        gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "minmax(0, 3fr) minmax(0, 2fr)" },
                    }}
                >
                    <Stack spacing={0.75}>
                        <Typography level="title-sm" sx={{ color: hocColors.parchment }}>
                            {t("Recent changes")}
                        </Typography>
                        {rows.length === 0 ? (
                            <Typography level="body-sm" textColor={hocColors.muted}>
                                {t("No changes yet. Finished ranked matches add points.")}
                            </Typography>
                        ) : (
                            rows.map((entry, index) => (
                                <Stack
                                    key={`${entry.at}-${entry.kind}-${index}`}
                                    direction="row"
                                    spacing={1}
                                    alignItems="baseline"
                                    sx={{
                                        borderTop: index ? "1px solid rgba(255,255,255,0.06)" : "none",
                                        pt: index ? 0.5 : 0,
                                    }}
                                >
                                    <Box sx={{ minWidth: 0, flex: 1 }}>
                                        <Typography level="body-sm" sx={{ color: hocColors.mutedStrong }}>
                                            {reputationLogText(entry)}
                                        </Typography>
                                        <Typography level="body-xs" textColor={hocColors.muted}>
                                            {dateFormat.format(new Date(entry.at))}
                                        </Typography>
                                    </Box>
                                    <Typography
                                        level="body-sm"
                                        sx={{
                                            fontWeight: 700,
                                            fontVariantNumeric: "tabular-nums",
                                            color:
                                                entry.points > 0
                                                    ? "#a8f0b6"
                                                    : entry.points < 0
                                                      ? "#ffb3a3"
                                                      : hocColors.muted,
                                        }}
                                    >
                                        {reputationPoints(entry.points)}
                                    </Typography>
                                </Stack>
                            ))
                        )}
                        {reputation.log.length > COLLAPSED_ROWS && (
                            <Button
                                size="sm"
                                variant="plain"
                                sx={{ ...hocSoftButtonSx, alignSelf: "flex-start", px: 0.5 }}
                                onClick={() => setExpanded((value) => !value)}
                            >
                                {expanded ? t("Show fewer") : t("Show all changes")}
                            </Button>
                        )}
                    </Stack>
                    <Stack spacing={0.75}>
                        <Typography level="title-sm" sx={{ color: hocColors.parchment }}>
                            {t("Account bonuses")}
                        </Typography>
                        {reputationAccountLines(reputation, rules).map((line) => (
                            <Stack key={line.label} direction="row" spacing={1} alignItems="baseline">
                                <Typography
                                    level="body-sm"
                                    sx={{ flex: 1, color: line.earned ? hocColors.mutedStrong : hocColors.muted }}
                                >
                                    {line.earned ? "✓ " : "○ "}
                                    {line.label}
                                </Typography>
                                <Typography
                                    level="body-sm"
                                    sx={{
                                        fontWeight: 700,
                                        fontVariantNumeric: "tabular-nums",
                                        color: line.earned ? "#a8f0b6" : hocColors.muted,
                                    }}
                                >
                                    {reputationPoints(line.points)}
                                </Typography>
                            </Stack>
                        ))}
                    </Stack>
                </Box>
            </Stack>
        </Sheet>
    );
};
