import { Box, Typography } from "@mui/joy";
import React from "react";

import type { PremiumSetupComparison as Comparison } from "../../api/premium_client";
import { t, tf } from "../../i18n/i18n";

export const PremiumSetupComparison: React.FC<{ comparison?: Comparison }> = ({ comparison }) => {
    if (!comparison) return null;
    return (
        <Box component="details" sx={{ mt: 1, color: "#e4c9ad", fontSize: 12 }}>
            <summary style={{ cursor: "pointer", color: "#f0b47b" }}>{t("Compare with your build")}</summary>
            <Typography level="body-xs" sx={{ color: "#f0d7bd", my: 0.75 }}>
                {tf("Your build: {selected}/{budget} points · Recommended: {recommended}/{budget}", {
                    selected: comparison.selected.spent,
                    recommended: comparison.recommended.spent,
                    budget: comparison.budget,
                })}
            </Typography>
            {comparison.changes.length === 0 && (
                <Typography level="body-xs">{t("Your augment levels match the recommendation.")}</Typography>
            )}
            {comparison.changes.map((change) => (
                <Box key={change.kind} sx={{ borderTop: "1px solid #674a34", py: 0.75 }}>
                    <Typography level="body-xs" sx={{ color: "#ffd3a0" }}>
                        {t(change.kind)} {change.selectedLevel} → {change.recommendedLevel} ·{" "}
                        {tf("{count} points", { count: `${change.pointChange > 0 ? "+" : ""}${change.pointChange}` })}
                    </Typography>
                    <Typography level="body-xs">
                        {tf("Current: {effect}", { effect: t(change.selectedEffect) })}
                    </Typography>
                    <Typography level="body-xs">
                        {tf("Proposed: {effect}", { effect: t(change.recommendedEffect) })}
                    </Typography>
                    <Typography level="body-xs">
                        {tf("Beneficiaries: {units}", {
                            units: change.beneficiaries.map(t).join(", ") || t("none in this army"),
                        })}
                    </Typography>
                </Box>
            ))}
            {comparison.publicOpponentArtifacts.length > 0 && (
                <Box sx={{ borderTop: "1px solid #674a34", pt: 0.75 }}>
                    <Typography level="body-xs" sx={{ color: "#ffd3a0" }}>
                        {t("Revealed enemy artifacts")}
                    </Typography>
                    {comparison.publicOpponentArtifacts.map((artifact) => (
                        <Typography key={`${artifact.tier}:${artifact.id}`} level="body-xs" sx={{ my: 0.5 }}>
                            <strong>{t(artifact.name)}:</strong> {t(artifact.effect)}
                        </Typography>
                    ))}
                </Box>
            )}
            <Typography level="body-xs" sx={{ mt: 0.75, color: "#bda58f" }}>
                {t(comparison.caveat)}
            </Typography>
        </Box>
    );
};
