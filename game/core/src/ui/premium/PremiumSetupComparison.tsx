import { Box, Typography } from "@mui/joy";
import React from "react";

import type { PremiumSetupComparison as Comparison } from "../../api/premium_client";

export const PremiumSetupComparison: React.FC<{ comparison?: Comparison }> = ({ comparison }) => {
    if (!comparison) return null;
    return (
        <Box component="details" sx={{ mt: 1, color: "#e4c9ad", fontSize: 12 }}>
            <summary style={{ cursor: "pointer", color: "#f0b47b" }}>Compare with your build</summary>
            <Typography level="body-xs" sx={{ color: "#f0d7bd", my: 0.75 }}>
                Your build: {comparison.selected.spent}/{comparison.budget} points · Recommended:{" "}
                {comparison.recommended.spent}/{comparison.budget}
            </Typography>
            {comparison.changes.length === 0 && (
                <Typography level="body-xs">Your augment levels match the recommendation.</Typography>
            )}
            {comparison.changes.map((change) => (
                <Box key={change.kind} sx={{ borderTop: "1px solid #674a34", py: 0.75 }}>
                    <Typography level="body-xs" sx={{ color: "#ffd3a0" }}>
                        {change.kind} {change.selectedLevel} → {change.recommendedLevel} ·{" "}
                        {change.pointChange > 0 ? "+" : ""}
                        {change.pointChange} points
                    </Typography>
                    <Typography level="body-xs">Current: {change.selectedEffect}</Typography>
                    <Typography level="body-xs">Proposed: {change.recommendedEffect}</Typography>
                    <Typography level="body-xs">
                        Beneficiaries: {change.beneficiaries.join(", ") || "none in this army"}
                    </Typography>
                </Box>
            ))}
            {comparison.publicOpponentArtifacts.length > 0 && (
                <Box sx={{ borderTop: "1px solid #674a34", pt: 0.75 }}>
                    <Typography level="body-xs" sx={{ color: "#ffd3a0" }}>
                        Revealed enemy artifacts
                    </Typography>
                    {comparison.publicOpponentArtifacts.map((artifact) => (
                        <Typography key={`${artifact.tier}:${artifact.id}`} level="body-xs" sx={{ my: 0.5 }}>
                            <strong>{artifact.name}:</strong> {artifact.effect}
                        </Typography>
                    ))}
                </Box>
            )}
            <Typography level="body-xs" sx={{ mt: 0.75, color: "#bda58f" }}>
                {comparison.caveat}
            </Typography>
        </Box>
    );
};
