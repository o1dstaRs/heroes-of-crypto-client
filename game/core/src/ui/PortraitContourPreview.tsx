import React from "react";

import { PORTRAIT_CARD_STYLE } from "./portraitCardStyle";

type ContourVariant = typeof PORTRAIT_CARD_STYLE;

export const isPortraitContourPreview = (): boolean =>
    !!import.meta.env.DEV &&
    typeof window !== "undefined" &&
    window.location.pathname === "/preview/picks/level2" &&
    new URLSearchParams(window.location.search).get("portraitContours") === "1";

/** Recover the silhouette from the existing background mask, then paint only outside that silhouette. */
export const PortraitContourPreview = ({
    source,
    inverse,
    style,
    variant,
}: {
    source: string;
    inverse: boolean;
    style?: React.CSSProperties;
    variant: ContourVariant;
}) => {
    const filterId = `portrait-contour-${React.useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
    return (
        <>
            <svg width="0" height="0" aria-hidden style={{ position: "absolute" }}>
                <defs>
                    <filter
                        id={filterId}
                        x="0"
                        y="0"
                        width="100%"
                        height="100%"
                        primitiveUnits="objectBoundingBox"
                        colorInterpolationFilters="sRGB"
                    >
                        <feComponentTransfer in="SourceAlpha" result="silhouette">
                            <feFuncA type="table" tableValues={inverse ? "1 0" : "0 1"} />
                        </feComponentTransfer>
                        <feMorphology in="silhouette" operator="dilate" radius={variant.spread} result="spread" />
                        <feGaussianBlur in="spread" stdDeviation={variant.blur} result="soft" />
                        <feOffset in="soft" dx={0} dy={0} result="offset" />
                        <feComposite in="offset" in2="SourceAlpha" operator={inverse ? "in" : "out"} result="edge" />
                        <feFlood floodColor={variant.color ?? "#050508"} floodOpacity={variant.opacity} result="ink" />
                        <feComposite in="ink" in2="edge" operator="in" />
                    </filter>
                </defs>
            </svg>
            <img
                data-portrait-critical
                data-portrait-contour={"velvet"}
                src={source}
                alt=""
                aria-hidden
                style={{ ...style, zIndex: 5, opacity: 1, filter: `url(#${filterId})`, pointerEvents: "none" }}
            />
        </>
    );
};
