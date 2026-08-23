import Box, { type BoxProps } from "@mui/joy/Box";
import React from "react";

import { resolveCreaturePortraitArtPlacement, resolveCreaturePortraitVisual } from "./creaturePortraitVisual";
import { UNIT_ID_TO_NAME } from "./unit_ui_constants";

export interface CreaturePortraitImageProps extends Omit<BoxProps, "children"> {
    creatureId: number;
    alt?: string;
    imageStyle?: React.CSSProperties;
    /** Multiplies only the creature art. The faction background keeps its approved framing. */
    artScale?: number;
    /** Optional horizontal-only multiplier for surfaces that need a slightly narrower portrait. */
    artScaleX?: number;
    /** Extra offsets applied only to the creature art. The faction background never moves with them. */
    artOffsetX?: number;
    artOffsetY?: number;
    /** Optional left-sidebar-only source/framing overrides; the approved faction background stays intact. */
    artSource?: string;
    artFit?: React.CSSProperties["objectFit"];
    artBaseScale?: number;
    /** Layout at the final CSS size instead of enlarging a smaller compositor layer. */
    highQualityArt?: boolean;
}

/**
 * The single renderer for creature portraits outside the battlefield. Every portrait surface uses the
 * approved per-creature source, crop, scale and offsets from the framing editor.
 */
export const CreaturePortraitImage: React.FC<CreaturePortraitImageProps> = ({
    creatureId,
    alt,
    imageStyle,
    artScale = 1,
    artScaleX = 1,
    artOffsetX = 0,
    artOffsetY = 0,
    artSource,
    artFit,
    artBaseScale,
    highQualityArt = false,
    sx,
    ...boxProps
}) => {
    const visual = resolveCreaturePortraitVisual(creatureId);
    if (!visual) return null;
    const { framing, background: portraitBackground, backgroundOpacity, backgroundShadeAlpha, source } = visual;
    const creatureSource = artSource ?? source;
    const creatureFit = artFit ?? framing.fit;
    const artPlacement = resolveCreaturePortraitArtPlacement(framing, {
        independentSource: artSource !== undefined,
        baseScale: artBaseScale,
        scale: artScale,
        offsetX: artOffsetX,
        offsetY: artOffsetY,
    });
    const creatureScale = artPlacement.scale;
    const creatureScaleX = Math.abs(artScaleX);
    const creatureDirectionX = artScaleX < 0 ? -1 : 1;

    return (
        <Box
            {...boxProps}
            sx={{
                position: "relative",
                overflow: "hidden",
                bgcolor: "#090806",
                ...sx,
            }}
            data-creature-portrait={creatureId}
        >
            {portraitBackground && (
                <Box
                    component="img"
                    src={portraitBackground}
                    alt=""
                    aria-hidden
                    data-creature-portrait-background={creatureId}
                    sx={{
                        position: "absolute",
                        inset: 0,
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        opacity: backgroundOpacity,
                    }}
                />
            )}
            {portraitBackground && (
                <Box
                    aria-hidden
                    data-creature-portrait-background-shade={creatureId}
                    sx={{
                        position: "absolute",
                        inset: 0,
                        zIndex: 1,
                        bgcolor: `rgba(0,0,0,${backgroundShadeAlpha})`,
                        pointerEvents: "none",
                    }}
                />
            )}
            {framing.background === "soft" && (
                <Box
                    component="img"
                    src={source}
                    alt=""
                    aria-hidden
                    sx={{
                        position: "absolute",
                        inset: 0,
                        zIndex: 2,
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        transform: "scale(1.2)",
                        filter: "blur(14px) brightness(.42) saturate(.78)",
                    }}
                />
            )}
            <img
                src={creatureSource}
                alt={alt ?? UNIT_ID_TO_NAME[creatureId] ?? `Creature ${creatureId}`}
                decoding={highQualityArt ? "sync" : undefined}
                fetchPriority={highQualityArt ? "high" : undefined}
                style={{
                    position: "absolute",
                    ...(highQualityArt
                        ? {
                              inset: "auto",
                              left: `calc(50% + ${artPlacement.offsetX}%)`,
                              top: `calc(50% + ${artPlacement.offsetY}%)`,
                              width: `${creatureScale * creatureScaleX * 100}%`,
                              height: `${creatureScale * 100}%`,
                              transform: `translate(-50%, -50%) scaleX(${creatureDirectionX}) translateZ(0)`,
                          }
                        : {
                              inset: 0,
                              width: "100%",
                              height: "100%",
                              transform: `translate(${artPlacement.offsetX}%, ${artPlacement.offsetY}%) scale(${creatureScale}) scaleX(${artScaleX})`,
                          }),
                    zIndex: 3,
                    display: "block",
                    objectFit: creatureFit,
                    objectPosition: "center",
                    transformOrigin: "center",
                    backfaceVisibility: highQualityArt ? "hidden" : undefined,
                    ...imageStyle,
                }}
            />
        </Box>
    );
};
