import { DecodedPortraitLayers } from "./DecodedPortraitLayers";
import Box, { type BoxProps } from "@mui/joy/Box";
import React from "react";
import { PORTRAIT_CARD_STYLE } from "./portraitCardStyle";
import { PortraitContourPreview } from "./PortraitContourPreview";

import {
    CREATURE_PORTRAIT_BACKGROUND_MOTION_KEYFRAMES,
    resolveCreaturePortraitBackgroundMotion,
} from "./creaturePortraitBackgroundMotion";
import { resolveCreaturePortraitArtPlacement, resolveCreaturePortraitVisual } from "./creaturePortraitVisual";
import { UNIT_ID_TO_NAME } from "./unit_ui_constants";

export interface CreaturePortraitImageProps extends Omit<BoxProps, "children"> {
    creatureId: number;
    /** Sidebar animations use their dedicated cutouts; roster cards use the approved static portraits. */
    portraitSurface?: "card" | "sidebar";
    alt?: string;
    imageStyle?: React.CSSProperties;
    /** Multiplies only the creature art. The faction background keeps its approved framing. */
    artScale?: number;
    /** Optional horizontal-only multiplier for surfaces that need a slightly narrower portrait. */
    artScaleX?: number;
    /** Controls only the faction background. Defaults to crop-to-cover on compact portrait surfaces. */
    backgroundFit?: React.CSSProperties["objectFit"];
    /** Animate the luminous forms already painted into the faction background. */
    animateBackground?: boolean;
    /** Extra offsets applied only to the creature art. The faction background never moves with them. */
    artOffsetX?: number;
    artOffsetY?: number;
    /** Optional left-sidebar-only source/framing overrides; the approved faction background stays intact. */
    artSource?: string;
    /** Keep checkpoint crop/scale/offsets when artSource is a higher-resolution copy of the same artwork. */
    artSourceUsesFraming?: boolean;
    artFit?: React.CSSProperties["objectFit"];
    artBaseScale?: number;
    /** Layout at the final CSS size instead of enlarging a smaller compositor layer. */
    highQualityArt?: boolean;
    /** Optional animation owns its still handoff inside the same decoded portrait composition. */
    renderArt?: (art: React.ReactElement<React.ImgHTMLAttributes<HTMLImageElement>>) => React.ReactNode;
    animatedArtSource?: string;
}

/**
 * The single renderer for creature portraits outside the battlefield. Every portrait surface uses the
 * approved per-creature source, crop, scale and offsets from the framing editor.
 *
 * The outer box takes a ref: a portrait is what tooltips wrap (the portal's roster strips, the draft
 * rail), and MUI anchors a tooltip through the child's ref — a plain function component swallowed it,
 * so those tooltips never opened.
 */
const CreaturePortraitImageBase = ({
    creatureId,
    portraitSurface = "card",
    alt,
    imageStyle,
    artScale = 1,
    artScaleX = 1,
    backgroundFit = "cover",
    animateBackground = false,
    artOffsetX = 0,
    artOffsetY = 0,
    artSource,
    artSourceUsesFraming = false,
    artFit,
    artBaseScale,
    highQualityArt = false,
    renderArt,
    animatedArtSource,
    sx,
    forwardedRef,
    ...boxProps
}: CreaturePortraitImageProps & { forwardedRef?: React.Ref<HTMLDivElement> }) => {
    const visual = resolveCreaturePortraitVisual(creatureId, portraitSurface);
    if (!visual) return null;
    const { framing, background: portraitBackground, backgroundOpacity, source } = visual;
    const contourVariant = portraitSurface === "card" ? PORTRAIT_CARD_STYLE : undefined;
    const backgroundShadeAlpha = contourVariant?.backgroundShadeAlpha ?? visual.backgroundShadeAlpha;
    const backgroundMotion = animateBackground ? resolveCreaturePortraitBackgroundMotion(creatureId) : null;
    const creatureSource = artSource ?? source;
    const creatureFit = artFit ?? framing.fit;
    const artPlacement = resolveCreaturePortraitArtPlacement(framing, {
        independentSource: artSource !== undefined && !artSourceUsesFraming,
        baseScale: artBaseScale,
        scale: artScale,
        offsetX: artOffsetX,
        offsetY: artOffsetY,
    });
    const creatureScale = artPlacement.scale;
    const creatureScaleX = Math.abs(artScaleX);
    // A mirrored creature flips its crop offset with it, so the card shows the reviewed portrait exactly
    // as a mirror would — the faction background behind it is never mirrored. Same rule the sandbox
    // roster's chips apply (UnitChip's mirrorPortraitX).
    const mirrorSign = visual.mirrored ? -1 : 1;
    const creatureDirectionX = (artScaleX < 0 ? -1 : 1) * mirrorSign;
    const creatureOffsetX = artPlacement.offsetX * mirrorSign;

    const portraitKey = JSON.stringify([
        creatureId,
        creatureSource,
        portraitBackground,
        framing.background === "soft" ? source : undefined,
        backgroundMotion?.glowSrc,
        animatedArtSource,
        visual.backgroundShadeSource,
        contourVariant?.blur,
    ]);
    const art = (
        <img
            data-portrait-critical
            src={creatureSource}
            alt={alt ?? UNIT_ID_TO_NAME[creatureId] ?? `Creature ${creatureId}`}
            decoding={highQualityArt ? "sync" : undefined}
            fetchPriority={highQualityArt ? "high" : undefined}
            style={{
                position: "absolute",
                ...(highQualityArt
                    ? {
                          inset: "auto",
                          left: `calc(50% + ${creatureOffsetX}%)`,
                          top: `calc(50% + ${artPlacement.offsetY}%)`,
                          width: `${creatureScale * creatureScaleX * 100}%`,
                          height: `${creatureScale * 100}%`,
                          transform: `translate(-50%, -50%) scaleX(${creatureDirectionX}) translateZ(0)`,
                      }
                    : {
                          inset: 0,
                          width: "100%",
                          height: "100%",
                          transform: `translate(${creatureOffsetX}%, ${artPlacement.offsetY}%) scale(${creatureScale}) scaleX(${artScaleX * mirrorSign})`,
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
    );
    return (
        <Box
            ref={forwardedRef}
            {...boxProps}
            sx={{
                position: "relative",
                overflow: "hidden",
                bgcolor: "#090806",
                // Match the roster's quieter minification without softening labels or card borders.
                ...(portraitSurface === "card" ? { "& [data-portrait-layers]": { filter: "blur(0.4px)" } } : {}),
                ...(backgroundMotion ? CREATURE_PORTRAIT_BACKGROUND_MOTION_KEYFRAMES : {}),
                ...sx,
            }}
            data-creature-portrait={creatureId}
        >
            <DecodedPortraitLayers portraitKey={portraitKey}>
                {portraitBackground && (
                    <Box
                        component="img"
                        data-portrait-critical
                        decoding="async"
                        src={portraitBackground}
                        alt=""
                        aria-hidden
                        data-creature-portrait-background={creatureId}
                        sx={{
                            position: "absolute",
                            inset: 0,
                            zIndex: 0,
                            width: "100%",
                            height: "100%",
                            objectFit: backgroundFit,
                            opacity: backgroundOpacity,
                        }}
                    />
                )}
                {portraitBackground && backgroundMotion && (
                    <>
                        <Box
                            component="img"
                            data-portrait-critical
                            decoding="async"
                            src={backgroundMotion.glowSrc}
                            alt=""
                            aria-hidden
                            data-creature-portrait-background-motion={`${backgroundMotion.kind}-primary`}
                            sx={{
                                position: "absolute",
                                inset: 0,
                                zIndex: 0,
                                width: "100%",
                                height: "100%",
                                objectFit: backgroundFit,
                                opacity: 0,
                                mixBlendMode: "screen",
                                pointerEvents: "none",
                                animation: backgroundMotion.primaryAnimation,
                                filter: backgroundMotion.primaryFilter,
                                willChange: "opacity",
                                "@media (prefers-reduced-motion: reduce)": { animation: "none", opacity: 0 },
                            }}
                        />
                        <Box
                            component="img"
                            data-portrait-critical
                            decoding="async"
                            src={backgroundMotion.glowSrc}
                            alt=""
                            aria-hidden
                            data-creature-portrait-background-motion={`${backgroundMotion.kind}-secondary`}
                            sx={{
                                position: "absolute",
                                inset: 0,
                                zIndex: 0,
                                width: "100%",
                                height: "100%",
                                objectFit: backgroundFit,
                                opacity: 0,
                                mixBlendMode: "screen",
                                pointerEvents: "none",
                                animation: backgroundMotion.secondaryAnimation,
                                filter: backgroundMotion.secondaryFilter,
                                willChange: "opacity",
                                "@media (prefers-reduced-motion: reduce)": { animation: "none", opacity: 0 },
                            }}
                        />
                    </>
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
                        data-portrait-critical
                        decoding="async"
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
                {renderArt ? renderArt(art) : art}
                {visual.backgroundShadeSource && (
                    <img
                        data-portrait-critical
                        data-creature-portrait-composed-background-shade={creatureId}
                        src={visual.backgroundShadeSource}
                        alt=""
                        aria-hidden
                        style={{ ...art.props.style, zIndex: 4, opacity: backgroundShadeAlpha, pointerEvents: "none" }}
                    />
                )}
                {contourVariant && (
                    <PortraitContourPreview
                        source={visual.backgroundShadeSource ?? creatureSource}
                        inverse={!!visual.backgroundShadeSource}
                        style={art.props.style}
                        variant={contourVariant}
                    />
                )}
            </DecodedPortraitLayers>
        </Box>
    );
};

export const CreaturePortraitImage = React.forwardRef<HTMLDivElement, CreaturePortraitImageProps>(
    function CreaturePortraitImage(props, ref) {
        return <CreaturePortraitImageBase {...props} forwardedRef={ref} />;
    },
);
