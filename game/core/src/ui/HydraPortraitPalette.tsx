import React, { useId } from "react";

// A single sRGB material grade for every portrait frame: cyan scales become
// olive green, silver highlights become warm gold, and red mouths stay warm.
// Alpha and geometry are unchanged. Apply only to the creature, before it is
// composited over the separate lava background.
export const HYDRA_PORTRAIT_COLOR_MATRIX = "0.96 0.11 -0.20 0 0  0.10 0.75 0.08 0 0  0.08 0.12 0.40 0 0  0 0 0 1 0";

export function HydraPortraitPalette({ children }: { children: React.ReactNode }) {
    const filterId = `hydra-portrait-${useId().replaceAll(":", "")}`;
    return (
        <>
            <svg width="0" height="0" aria-hidden="true" style={{ position: "absolute", pointerEvents: "none" }}>
                <defs>
                    <filter id={filterId} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
                        <feColorMatrix
                            in="SourceGraphic"
                            type="matrix"
                            values={HYDRA_PORTRAIT_COLOR_MATRIX}
                            result="graded"
                        />
                        {/* The source has cyan rim light on the moving crowns. Select blue excess,
                            not a fixed head-shaped mask, so the cleanup follows every authored pose. */}
                        <feColorMatrix
                            in="SourceGraphic"
                            type="matrix"
                            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -16 0 16 0 0"
                            result="coolRim"
                        />
                        {/* Preserve the bright emissive blue eye; the unwanted rim is much dimmer. */}
                        <feColorMatrix
                            in="SourceGraphic"
                            type="matrix"
                            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 -4 0 2.5"
                            result="nonEmissive"
                        />
                        <feComposite in="coolRim" in2="nonEmissive" operator="in" result="rimMask" />
                        {/* Match the olive material while retaining each pixel's luminance and alpha. */}
                        <feColorMatrix
                            in="graded"
                            type="matrix"
                            values="0.211 0.710 0.072 0 0  0.234 0.789 0.080 0 0  0.129 0.434 0.044 0 0  0 0 0 1 0"
                            result="oliveRim"
                        />
                        <feComposite in="oliveRim" in2="rimMask" operator="in" result="cleanRim" />
                        <feComposite in="graded" in2="rimMask" operator="out" result="retainedArt" />
                        <feComposite in="retainedArt" in2="cleanRim" operator="arithmetic" k2="1" k3="1" />
                    </filter>
                </defs>
            </svg>
            <div
                data-hydra-portrait-palette
                style={{ position: "absolute", inset: 0, zIndex: 3, filter: `url(#${filterId})` }}
            >
                {children}
            </div>
        </>
    );
}
