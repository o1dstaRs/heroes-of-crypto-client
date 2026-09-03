import { Box } from "@mui/joy";
import React, { useEffect, useRef } from "react";

import { images as rawImages } from "../../generated/image_imports";
import { readPickLanternFireTuning, type PickLanternFireSlot } from "./pickLanternFireTuning";

const images = rawImages as Record<string, string>;
const NATURAL_ATLAS = images.ambient_fire_video_torch_left_natural_v4_64_atlas;
const ATLAS_COLUMNS = 8;
const ATLAS_ROWS = 8;
const ATLAS_FRAMES = 64;

const framePosition = (frame: number): string => {
    const column = frame % ATLAS_COLUMNS;
    const row = Math.floor(frame / ATLAS_COLUMNS);
    return `${(column / (ATLAS_COLUMNS - 1)) * 100}% ${(row / (ATLAS_ROWS - 1)) * 100}%`;
};
const FRAME_POSITIONS = Array.from({ length: ATLAS_FRAMES }, (_, frame) => framePosition(frame));

export const PickLanternFire: React.FC<{ slot: PickLanternFireSlot; active?: boolean }> = ({ slot, active = true }) => {
    const tuning = readPickLanternFireTuning(slot);
    const firstFrame = (slot * 29) % ATLAS_FRAMES;
    const flameRef = useRef<HTMLDivElement | null>(null);
    const cleanupFilterId = `pick-lantern-fire-dark-cleanup-${slot}`;

    useEffect(() => {
        if (!active || !tuning.enabled) return undefined;
        let frame = firstFrame;
        const interval = window.setInterval(() => {
            frame = (frame + 1) % ATLAS_FRAMES;
            if (flameRef.current) flameRef.current.style.backgroundPosition = FRAME_POSITIONS[frame];
        }, 1000 / tuning.fps);
        return () => window.clearInterval(interval);
    }, [active, firstFrame, tuning.enabled, tuning.fps]);

    if (!active || !tuning.enabled) return null;

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
                ref={flameRef}
                sx={{
                    position: "absolute",
                    left: "50%",
                    bottom: 0,
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
                        <feColorMatrix
                            in="SourceGraphic"
                            result="luminance-mask"
                            type="matrix"
                            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0.2126 0.7152 0.0722 0 0"
                        />
                        <feComponentTransfer in="luminance-mask" result="threshold-mask">
                            <feFuncA type="linear" slope="20" intercept={-20 * tuning.blackCutoff} />
                        </feComponentTransfer>
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
            <Box
                sx={{
                    position: "absolute",
                    inset: `${tuning.maskInset}%`,
                    width: `${100 - tuning.maskInset * 2}%`,
                    height: `${100 - tuning.maskInset * 2}%`,
                    opacity: tuning.opacity,
                    backgroundImage: `url(${NATURAL_ATLAS})`,
                    backgroundRepeat: "no-repeat",
                    backgroundSize: `${ATLAS_COLUMNS * 100}% ${ATLAS_ROWS * 100}%`,
                    backgroundPosition: FRAME_POSITIONS[firstFrame],
                    filter: `url(#${cleanupFilterId}) brightness(${tuning.brightness}) contrast(${tuning.contrast}) saturate(${tuning.saturation}) hue-rotate(${tuning.hue}deg)`,
                    transformOrigin: "50% 100%",
                    pointerEvents: "none",
                }}
            />
        </Box>
    );
};
