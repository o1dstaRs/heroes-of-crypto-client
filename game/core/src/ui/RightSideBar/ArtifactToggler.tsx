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
}

const ArtifactRow: React.FC<ArtifactRowProps> = ({ title, artifacts, selectedId, onSelect }) => (
    <Box sx={{ width: "100%" }}>
        <Typography level="body-xs" sx={{ mb: 0.5 }}>
            {title}
        </Typography>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
            {artifacts.map((artifact) => {
                const src = imageFor(artifact.imageKey);
                const isSelected = selectedId === artifact.id;
                return (
                    <Tooltip
                        key={artifact.id}
                        // formatArtifactDescription fills the {}/[] placeholders in artifact.description with
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

export const ArtifactToggler: React.FC<{ teamType: TeamType }> = ({ teamType }) => {
    const manager = usePixiManager();
    const [tier1Selected, setTier1Selected] = useState<number>(Artifact.Tier1Artifact.NO_ARTIFACT);
    const [tier2Selected, setTier2Selected] = useState<number>(Artifact.Tier2Artifact.NO_ARTIFACT);

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
        <Box sx={{ width: "100%", display: "flex", flexDirection: "column", gap: 1, mt: 1 }}>
            <Divider />
            <Typography level="title-sm">Artifacts</Typography>
            <ArtifactRow
                title="Tier 1"
                tier={Artifact.ArtifactTier.TIER_1}
                artifacts={Artifact.TIER1_ARTIFACT_LIST}
                selectedId={tier1Selected}
                onSelect={selectTier1}
            />
            <ArtifactRow
                title="Tier 2"
                tier={Artifact.ArtifactTier.TIER_2}
                artifacts={Artifact.TIER2_ARTIFACT_LIST}
                selectedId={tier2Selected}
                onSelect={selectTier2}
            />
        </Box>
    );
};

export default ArtifactToggler;
