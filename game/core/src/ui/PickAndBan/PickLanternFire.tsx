import { Box } from "@mui/joy";
import React, { useEffect, useRef, useState } from "react";

import { images as rawImages } from "../../generated/image_imports";
import { startVisibleInterval } from "../visibleInterval";
import {
    PICK_LANTERN_FIRE_CHANGE_EVENT,
    readPickLanternFireTuning,
    type PickLanternFireChangeDetail,
    type PickLanternFireSlot,
    type PickLanternFireTuning,
} from "./pickLanternFireTuning";

const images = rawImages as Record<string, string>;
const NATURAL_ATLAS = images.ambient_fire_video_torch_left_natural_v4_64_atlas;
const CANDLE_VIDEO = "/video/pick_lantern_candle_single_v1.webm";
const ATLAS_COLUMNS = 8;
const ATLAS_ROWS = 8;
const ATLAS_FRAMES = 64;
const ATLAS_CLEANUP_FILTER_ID = "pick-lantern-fire-dark-cleanup";

const framePosition = (frame: number): string => {
    const column = frame % ATLAS_COLUMNS;
    const row = Math.floor(frame / ATLAS_COLUMNS);
    return `${(column / (ATLAS_COLUMNS - 1)) * 100}% ${(row / (ATLAS_ROWS - 1)) * 100}%`;
};
const FRAME_POSITIONS = Array.from({ length: ATLAS_FRAMES }, (_, frame) => framePosition(frame));

export const PickLanternFire: React.FC<{ slot: PickLanternFireSlot; active?: boolean }> = ({ slot, active = true }) => {
    const [tuning, setTuning] = useState<PickLanternFireTuning>(() => readPickLanternFireTuning(slot));
    const firstFrame = (slot * 29) % ATLAS_FRAMES;
    const flameRef = useRef<HTMLDivElement | null>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const cleanupFilterId = `${ATLAS_CLEANUP_FILTER_ID}-${slot}`;

    // The dev editor (/dev/pick-lantern-fire-editor) publishes live changes; production only reads once.
    useEffect(() => {
        const onChange = (event: Event) => {
            const detail = (event as CustomEvent<PickLanternFireChangeDetail>).detail;
            if (!detail || detail.slot === slot) setTuning(detail?.tuning ?? readPickLanternFireTuning(slot));
        };
        window.addEventListener(PICK_LANTERN_FIRE_CHANGE_EVENT, onChange);
        window.addEventListener("storage", onChange);
        return () => {
            window.removeEventListener(PICK_LANTERN_FIRE_CHANGE_EVENT, onChange);
            window.removeEventListener("storage", onChange);
        };
    }, [slot]);

    // Frames advance by mutating the atlas box directly (no React re-render per frame), and the interval
    // pauses while the tab is hidden.
    useEffect(() => {
        if (!active || !tuning.enabled || tuning.source !== "natural-atlas") return undefined;
        let frame = firstFrame;
        return startVisibleInterval(() => {
            if (flameRef.current) flameRef.current.style.backgroundPosition = FRAME_POSITIONS[frame];
            frame = (frame + 1) % ATLAS_FRAMES;
        }, 1000 / tuning.fps);
    }, [active, firstFrame, tuning.enabled, tuning.fps, tuning.source]);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        video.playbackRate = tuning.playbackRate;
        if (active && tuning.enabled && tuning.source === "candle-video") {
            void video.play().catch(() => undefined);
        } else {
            video.pause();
        }
    }, [active, tuning.enabled, tuning.playbackRate, tuning.source]);

    if (!active || !tuning.enabled) return null;

    const commonMediaSx = {
        position: "absolute",
        inset: `${tuning.maskInset}%`,
        width: `${100 - tuning.maskInset * 2}%`,
        height: `${100 - tuning.maskInset * 2}%`,
        opacity: tuning.opacity,
        filter: `brightness(${tuning.brightness}) contrast(${tuning.contrast}) saturate(${tuning.saturation}) hue-rotate(${tuning.hue}deg)`,
        transformOrigin: "50% 100%",
        pointerEvents: "none",
    } as const;

    return (
        <Box
            aria-hidden="true"
            data-testid={`pick-lantern-fire-${slot + 1}`}
            sx={{
                position: "absolute",
                zIndex: 0,
                left: `${tuning.anchorX}%`,
                top: `${tuning.anchorY}%`,
                width: `${tuning.width}%`,
                height: `${tuning.height}%`,
                transform: "translate(-50%, -100%)",
                pointerEvents: "none",
                overflow: "visible",
                isolation: "isolate",
            }}
        >
            <Box
                sx={{
                    position: "absolute",
                    left: "50%",
                    bottom: "0%",
                    width: `${100 * tuning.glowSize}%`,
                    height: `${88 * tuning.glowSize}%`,
                    transform: "translateX(-50%)",
                    borderRadius: "50%",
                    opacity: tuning.glowOpacity,
                    background:
                        "radial-gradient(ellipse at 50% 78%, rgba(255,202,98,.98) 0%, rgba(237,107,26,.55) 30%, rgba(119,35,4,.14) 62%, transparent 76%)",
                    filter: "blur(10px)",
                    mixBlendMode: "screen",
                }}
            />
            <svg aria-hidden="true" width="0" height="0" style={{ position: "absolute" }}>
                <defs>
                    <filter
                        id={cleanupFilterId}
                        x="-10%"
                        y="-10%"
                        width="120%"
                        height="120%"
                        colorInterpolationFilters="sRGB"
                    >
                        {/* Build a luminance mask, then cut away the dark opaque material embedded in the
                            atlas. SourceGraphic is composited back through it, so the original RGB colour
                            and alpha survive while black/brown knots become transparent. */}
                        <feColorMatrix
                            in="SourceGraphic"
                            result="luminance-mask"
                            type="matrix"
                            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0.2126 0.7152 0.0722 0 0"
                        />
                        <feComponentTransfer in="luminance-mask" result="threshold-mask">
                            {/* A narrow 5%-luminance transition removes the dark material completely instead
                                of leaving it as a smoky semi-transparent silhouette. */}
                            <feFuncA type="linear" slope="20" intercept={-20 * tuning.blackCutoff} />
                        </feComponentTransfer>
                        {/* Expand nearby bright fragments into one continuous flame body. The warm fill
                            replaces the black material inside that body; original pixels are screened back
                            over it to retain the photographic white/yellow highlights. */}
                        <feMorphology
                            in="threshold-mask"
                            result="dense-mask"
                            operator="dilate"
                            radius={tuning.density}
                        />
                        <feGaussianBlur in="dense-mask" result="soft-dense-mask" stdDeviation="0.35" />
                        <feFlood result="warm-fill" floodColor="#f47b20" floodOpacity="0.82" />
                        <feComposite in="warm-fill" in2="soft-dense-mask" result="warm-body" operator="in" />
                        <feBlend in="SourceGraphic" in2="warm-body" result="lit-body" mode="screen" />
                        <feComposite in="lit-body" in2="soft-dense-mask" operator="in" />
                    </filter>
                </defs>
            </svg>
            {tuning.source === "natural-atlas" ? (
                <Box
                    ref={flameRef}
                    sx={{
                        ...commonMediaSx,
                        backgroundImage: `url(${NATURAL_ATLAS})`,
                        backgroundRepeat: "no-repeat",
                        backgroundSize: `${ATLAS_COLUMNS * 100}% ${ATLAS_ROWS * 100}%`,
                        backgroundPosition: FRAME_POSITIONS[firstFrame],
                        filter: `url(#${cleanupFilterId}) brightness(${tuning.brightness}) contrast(${tuning.contrast}) saturate(${tuning.saturation}) hue-rotate(${tuning.hue}deg)`,
                        // After the luminance-derived cleanup above, normal compositing preserves the warm
                        // core without reintroducing black or washing it out with additive blending.
                        mixBlendMode: "normal",
                    }}
                />
            ) : (
                <Box
                    component="video"
                    ref={videoRef}
                    src={CANDLE_VIDEO}
                    muted
                    loop
                    playsInline
                    preload="auto"
                    onLoadedMetadata={(event) => {
                        if (slot === 1 && event.currentTarget.duration > 3) event.currentTarget.currentTime = 2.7;
                    }}
                    // The user-supplied candle video has an opaque black plate, so only this source needs
                    // additive screen blending to remove black without changing the flame's warm colour.
                    sx={{ ...commonMediaSx, objectFit: "fill", mixBlendMode: "screen" }}
                />
            )}
        </Box>
    );
};
