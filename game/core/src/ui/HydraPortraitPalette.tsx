import React, { useId } from "react";

import {
    HYDRA_PORTRAIT_NON_EMISSIVE_MASK,
    HYDRA_PORTRAIT_SCALE_MATRIX,
    HYDRA_PORTRAIT_WARM_MASK,
} from "./creaturePortraitPalette";

const alphaMatrix = (row: readonly number[]) => `${Array(15).fill(0).join(" ")} ${row.join(" ")}`;

/** Wrap the still AND the animation, so the first-frame handoff cannot flash the old cyan palette. */
export function HydraPortraitPalette({ children }: { children: React.ReactNode }) {
    const filterId = `hydra-portrait-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
    return (
        <>
            <svg width="0" height="0" aria-hidden="true" style={{ position: "absolute", pointerEvents: "none" }}>
                <defs>
                    <filter id={filterId} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
                        <feColorMatrix
                            in="SourceGraphic"
                            type="matrix"
                            values={HYDRA_PORTRAIT_SCALE_MATRIX.join(" ")}
                            result="olive"
                        />
                        <feColorMatrix
                            in="SourceGraphic"
                            type="matrix"
                            values={alphaMatrix([...HYDRA_PORTRAIT_WARM_MASK, 0, 0])}
                            result="warm"
                        />
                        <feColorMatrix in="warm" type="matrix" values={alphaMatrix([0, 0, 0, -1, 1])} result="cool" />
                        <feColorMatrix
                            in="SourceGraphic"
                            type="matrix"
                            values={alphaMatrix(HYDRA_PORTRAIT_NON_EMISSIVE_MASK)}
                            result="nonEmissive"
                        />
                        <feComposite in="cool" in2="nonEmissive" operator="in" result="scales" />
                        <feComposite in="olive" in2="scales" operator="in" result="gradedScales" />
                        <feComposite in="SourceGraphic" in2="scales" operator="out" result="retainedArt" />
                        <feComposite in="retainedArt" in2="gradedScales" operator="arithmetic" k2="1" k3="1" />
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
