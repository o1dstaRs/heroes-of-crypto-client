import { Artifact, TeamType } from "@heroesofcrypto/common";
import React, { useState } from "react";
import { Box, Divider, Tooltip, Typography } from "@mui/joy";

import { images } from "../../generated/image_imports";
import { usePixiManager } from "../../pixi/PixiGameManager";
import { hocColors, hocDisplayFontFamily } from "../hocTheme";

const imageFor = (imageKey: string): string | undefined => (images as Record<string, string>)[imageKey];

interface ArtifactRowProps {
    title: string;
    tier: number;
    artifacts: Artifact.ArtifactProperties[];
    selectedId: number;
    onSelect: (artifactId: number) => void;
    isOpen: boolean;
}

const ArtifactRow: React.FC<ArtifactRowProps> = ({ title, artifacts, selectedId, onSelect, isOpen }) => (
    <Box sx={{ width: "100%" }}>
        {/* Just a label now — the whole block opens from the Artifacts header above. */}
        <Typography
            level="body-xs"
            sx={{
                height: isOpen ? "22px" : 0,
                mb: 0,
                px: 0.5,
                display: isOpen ? "flex" : "none",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                fontSize: "0.825rem",
                lineHeight: 1,
                color: hocColors.sidebarTitle,
            }}
        >
            {title}
        </Typography>
        <Box
            sx={{
                display: isOpen ? "grid" : "none",
                gridTemplateColumns: "repeat(4, 52px)",
                justifyContent: "center",
                gap: 0.5,
                "@media (max-height: 800px)": {
                    gridTemplateColumns: "repeat(4, 35px)",
                    gap: 0.25,
                },
            }}
        >
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
                        <Box
                            component="button"
                            type="button"
                            aria-pressed={isSelected}
                            // Clicking the selected artifact again clears the slot.
                            onClick={() => onSelect(isSelected ? Artifact.Tier1Artifact.NO_ARTIFACT : artifact.id)}
                            sx={{
                                appearance: "none",
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                // Keep the old IconButton footprint so removing its painted frame does not
                                // pull the artifact grid inward or change the row/column spacing.
                                width: 52,
                                height: 52,
                                flex: "0 0 52px",
                                boxSizing: "border-box",
                                position: "relative",
                                isolation: "isolate",
                                p: 0.25,
                                m: 0,
                                lineHeight: 0,
                                borderRadius: 0,
                                border: "none !important",
                                backgroundColor: "transparent !important",
                                boxShadow: "none !important",
                                outline: "none !important",
                                cursor: "default !important",
                                overflow: "visible",
                                // The border itself is deliberately absent: several legacy Joy styles force
                                // plain buttons transparent. An overlay keeps the selected gold frame above
                                // the artwork and, unlike a real border, never changes the tile's grid size.
                                "&::after": {
                                    content: '""',
                                    position: "absolute",
                                    inset: 1,
                                    zIndex: 1,
                                    pointerEvents: "none",
                                    boxSizing: "border-box",
                                    borderRadius: "4px",
                                    border: isSelected ? "2px solid #dcb158" : "2px solid transparent",
                                    boxShadow: isSelected
                                        ? "inset 0 0 3px rgba(255, 235, 173, 0.7), 0 0 6px rgba(220, 177, 88, 0.7)"
                                        : "none",
                                    transition: "border-color 0.16s ease, box-shadow 0.16s ease",
                                },
                                "& img": {
                                    display: "block",
                                    transition: "transform 0.16s ease, filter 0.16s ease",
                                    transformOrigin: "center",
                                },
                                "&:hover img": {
                                    transform: "scale(1.05)",
                                    filter: "drop-shadow(0 0 5px rgba(224, 176, 83, 0.72))",
                                },
                                "&:hover, &:active, &:focus, &:focus-visible": {
                                    backgroundColor: "transparent !important",
                                    border: "none !important",
                                    boxShadow: "none !important",
                                    outline: "none !important",
                                },
                                "@media (max-height: 800px)": {
                                    width: 35,
                                    height: 35,
                                    flexBasis: "35px",
                                    p: "1px",
                                },
                            }}
                        >
                            {src ? (
                                <Box
                                    component="img"
                                    src={src}
                                    alt={artifact.name}
                                    loading="lazy"
                                    decoding="async"
                                    sx={{
                                        width: 48,
                                        height: 48,
                                        objectFit: "contain",
                                        "@media (max-height: 800px)": {
                                            width: 33,
                                            height: 33,
                                        },
                                    }}
                                />
                            ) : (
                                <Typography level="body-xs">{artifact.name}</Typography>
                            )}
                        </Box>
                    </Tooltip>
                );
            })}
        </Box>
    </Box>
);

export const ArtifactToggler: React.FC<{
    teamType: TeamType;
    // Artifacts open and close as ONE block: the header below reveals both tiers together. Sandbox owns this
    // state independently from Augments; the optional props keep the component usable on its own.
    isOpen?: boolean;
    onToggle?: () => void;
}> = ({ teamType, isOpen: isOpenProp, onToggle }) => {
    const manager = usePixiManager();
    const [tier1Selected, setTier1Selected] = useState<number>(Artifact.Tier1Artifact.NO_ARTIFACT);
    const [tier2Selected, setTier2Selected] = useState<number>(Artifact.Tier2Artifact.NO_ARTIFACT);
    const [openLocal, setOpenLocal] = useState(false);
    const isOpen = isOpenProp !== undefined ? isOpenProp : openLocal;
    const toggle = () => (onToggle ? onToggle() : setOpenLocal((current) => !current));

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
        <Box
            sx={{
                width: "100%",
                display: "flex",
                flexDirection: "column",
                gap: 0,
                mt: 0,
                fontFamily: hocDisplayFontFamily,
                color: hocColors.sidebarTitle,
                fontWeight: 460,
                fontSynthesis: "weight",
                "& .MuiTypography-root": {
                    fontFamily: hocDisplayFontFamily,
                    fontWeight: 460,
                    fontSynthesis: "weight",
                },
            }}
        >
            <Divider sx={{ borderColor: "rgba(112, 75, 42, 0.55)" }} />
            {/* One header for the whole block: clicking it reveals both tiers at once. Per-tier toggles meant
                three things could be open at the same time and the bar grew past the fold; now it is two
                states in the bar - augments or artifacts. */}
            <Box
                component="button"
                type="button"
                onClick={toggle}
                aria-expanded={isOpen}
                sx={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 1,
                    px: 0.5,
                    py: 0.25,
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    color: isOpen ? "#FF8F00" : "inherit",
                    "&:hover": { backgroundColor: "rgba(255,255,255,0.05)" },
                }}
            >
                <Typography
                    level="title-sm"
                    sx={{ color: "inherit", fontSize: "1.1rem", letterSpacing: "0.06em", lineHeight: 1.25 }}
                >
                    Artifacts
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
            <ArtifactRow
                title="Tier 1"
                tier={Artifact.ArtifactTier.TIER_1}
                artifacts={Artifact.TIER1_ARTIFACT_LIST}
                selectedId={tier1Selected}
                onSelect={selectTier1}
                isOpen={isOpen}
            />
            <ArtifactRow
                title="Tier 2"
                tier={Artifact.ArtifactTier.TIER_2}
                artifacts={Artifact.TIER2_ARTIFACT_LIST}
                selectedId={tier2Selected}
                onSelect={selectTier2}
                isOpen={isOpen}
            />
            {/* Closes the artifacts block off from whatever follows it — with the tiers collapsed, Tier 2's
                row ran straight into the next team's flag header with nothing between them. Dimmer and
                thinner than the divider that opens the section, so it reads as an end mark, not a new one. */}
            <Divider sx={{ mt: 0, opacity: 0.45 }} />
        </Box>
    );
};

export default ArtifactToggler;
