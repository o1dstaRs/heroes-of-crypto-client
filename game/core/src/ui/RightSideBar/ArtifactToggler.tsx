import { Artifact, TeamType } from "@heroesofcrypto/common";
import React, { useState } from "react";
import { Box, Divider, IconButton, Tooltip, Typography } from "@mui/joy";

import { images } from "../../generated/image_imports";
import { usePixiManager } from "../../pixi/PixiGameManager";

const imageFor = (imageKey: string): string | undefined => (images as Record<string, string>)[imageKey];

interface ArtifactRowProps {
    title: string;
    tier: number;
    artifacts: Artifact.ArtifactProperties[];
    selectedId: number;
    onSelect: (artifactId: number) => void;
    isOpen: boolean;
    onToggle: () => void;
}

const ArtifactRow: React.FC<ArtifactRowProps> = ({ title, artifacts, selectedId, onSelect, isOpen, onToggle }) => (
    <Box sx={{ width: "100%" }}>
        {/* Same affordance as the Reds/Greens sections above: a title that opens its own drawer. The
            sandbox bar starts both drawers open (it scrolls); the ranked sheet starts them closed. */}
        <Box
            component="button"
            type="button"
            onClick={onToggle}
            sx={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 1,
                mb: isOpen ? 0.5 : 0,
                px: 0.5,
                py: 0.5,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: isOpen ? "#FF8F00" : "inherit",
                "&:hover": { backgroundColor: "rgba(255,255,255,0.05)" },
            }}
        >
            <Typography level="body-xs" sx={{ color: "inherit", fontWeight: isOpen ? "xl" : "md" }}>
                {title}
            </Typography>
            <Box
                component="img"
                src={images.tr_up}
                alt=""
                sx={{
                    width: "12px",
                    transform: isOpen ? "none" : "rotate(180deg)",
                    transition: "transform 0.2s",
                    filter: isOpen
                        ? "brightness(0) saturate(100%) invert(58%) sepia(91%) saturate(3089%) hue-rotate(2deg) brightness(103%) contrast(104%)"
                        : "none",
                }}
            />
        </Box>
        <Box sx={{ display: isOpen ? "flex" : "none", flexWrap: "wrap", gap: 0.5 }}>
            {artifacts.map((artifact) => {
                const src = imageFor(artifact.imageKey);
                const isSelected = selectedId === artifact.id;
                return (
                    <Tooltip
                        key={artifact.id}
                        // formatArtifactDescription fills the {}/[]/<> placeholders in artifact.description with
                        // the real power values — the raw description would show literal "{}" otherwise.
                        title={
                            <Box sx={{ maxWidth: 240, py: 0.25 }}>
                                <Typography level="title-sm">{artifact.name}</Typography>
                                <Typography level="body-xs">{Artifact.formatArtifactDescription(artifact)}</Typography>
                            </Box>
                        }
                        variant="soft"
                        placement="top"
                        arrow
                    >
                        <IconButton
                            size="sm"
                            variant={isSelected ? "solid" : "outlined"}
                            color={isSelected ? "primary" : "neutral"}
                            // Clicking the selected artifact again clears the slot.
                            onClick={() => onSelect(isSelected ? Artifact.Tier1Artifact.NO_ARTIFACT : artifact.id)}
                            sx={{ p: 0.25, borderRadius: "8px" }}
                        >
                            {src ? (
                                <img
                                    src={src}
                                    alt={artifact.name}
                                    style={{ width: 48, height: 48, objectFit: "contain" }}
                                />
                            ) : (
                                <Typography level="body-xs">{artifact.name}</Typography>
                            )}
                        </IconButton>
                    </Tooltip>
                );
            })}
        </Box>
    </Box>
);

export const ArtifactToggler: React.FC<{
    teamType: TeamType;
    // Owned by SandboxToggleContainer: the sandbox bar keeps BOTH tiers expanded by default (that bar
    // scrolls, so height is not a constraint there), with each tier collapsible on its own. Left optional
    // so the component still stands alone.
    openTiers?: ReadonlySet<number>;
    onToggleTier?: (tier: number) => void;
}> = ({ teamType, openTiers: openTiersProp, onToggleTier }) => {
    const manager = usePixiManager();
    const [tier1Selected, setTier1Selected] = useState<number>(Artifact.Tier1Artifact.NO_ARTIFACT);
    const [tier2Selected, setTier2Selected] = useState<number>(Artifact.Tier2Artifact.NO_ARTIFACT);
    // Standalone (the sandbox army drawer — ranked hides this picker and shows RankedArtifactsPanel
    // instead): BOTH tiers start open, per owner call (2026-08-01), and each collapses independently.
    // The drawer scrolls, so two full grids are fine here.
    const [closedTiersLocal, setClosedTiersLocal] = useState<ReadonlySet<number>>(() => new Set());
    const isTierOpen = (tier: number) => (openTiersProp ? openTiersProp.has(tier) : !closedTiersLocal.has(tier));
    const toggleTier = (tier: number) =>
        onToggleTier
            ? onToggleTier(tier)
            : setClosedTiersLocal((current) => {
                  const next = new Set(current);
                  if (next.has(tier)) {
                      next.delete(tier);
                  } else {
                      next.add(tier);
                  }
                  return next;
              });

    const selectTier1 = (artifactId: number) => {
        if (manager.PropagateArtifact(teamType, Artifact.ArtifactTier.TIER_1, artifactId)) {
            setTier1Selected(artifactId);
        }
    };
    const selectTier2 = (artifactId: number) => {
        if (manager.PropagateArtifact(teamType, Artifact.ArtifactTier.TIER_2, artifactId)) {
            setTier2Selected(artifactId);
        }
    };

    return (
        <Box sx={{ width: "100%", display: "flex", flexDirection: "column", gap: 0.5, mt: 0 }}>
            <Divider />
            <Typography level="title-sm">Artifacts</Typography>
            <ArtifactRow
                title="Tier 1"
                tier={Artifact.ArtifactTier.TIER_1}
                artifacts={Artifact.TIER1_ARTIFACT_LIST}
                selectedId={tier1Selected}
                onSelect={selectTier1}
                isOpen={isTierOpen(Artifact.ArtifactTier.TIER_1)}
                onToggle={() => toggleTier(Artifact.ArtifactTier.TIER_1)}
            />
            <ArtifactRow
                title="Tier 2"
                tier={Artifact.ArtifactTier.TIER_2}
                artifacts={Artifact.TIER2_ARTIFACT_LIST}
                selectedId={tier2Selected}
                onSelect={selectTier2}
                isOpen={isTierOpen(Artifact.ArtifactTier.TIER_2)}
                onToggle={() => toggleTier(Artifact.ArtifactTier.TIER_2)}
            />
            {/* Closes the artifacts block off from whatever follows it — with the tiers collapsed, Tier 2's
                row ran straight into the next team's flag header with nothing between them. Dimmer and
                thinner than the divider that opens the section, so it reads as an end mark, not a new one. */}
            <Divider sx={{ mt: 0.5, opacity: 0.45 }} />
        </Box>
    );
};

export default ArtifactToggler;
