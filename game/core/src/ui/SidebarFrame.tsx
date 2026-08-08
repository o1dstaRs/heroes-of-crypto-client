import React from "react";
import { images } from "../generated/image_imports";

const FRAME_BY_SIDE = {
    left: {
        src: images.ui_outer_frame_3_9slice,
        slice: 58,
    },
    right: {
        src: images.ui_outer_frame_3_9slice,
        slice: 58,
    },
} as const;

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

/**
 * Decorative viewport frame shared by the command decks.
 *
 * Each side has its own transparent generated source. CSS border-image treats it as a 9-slice: corners
 * retain their authored shape while only the long, clean rail segments stretch with the responsive panel.
 */
export const SidebarFrame: React.FC<{
    side: "left" | "right";
    width: number;
    height: number;
}> = ({ side, width, height }) => {
    if (width <= 0 || height <= 0) return null;

    const frame = FRAME_BY_SIDE[side];
    // A wider border region preserves the generated corner caps. Most of that region is transparent; the
    // visible rail inside it remains as narrow as the source artwork.
    const frameRegion = clamp(Math.round(width * 0.045), 14, 20);
    const fixedSide = side === "left" ? ({ left: 0 } as const) : ({ right: 0 } as const);

    return (
        <div
            aria-hidden="true"
            data-sidebar-frame={side}
            style={{
                position: "fixed",
                top: 0,
                width,
                height: "100dvh",
                pointerEvents: "none",
                // The frame is a HUD overlay: portraits, cards and controls may create their own stacking
                // contexts, but none of them should ever paint over the outer metal rails.
                zIndex: 9000,
                boxSizing: "border-box",
                borderTopWidth: `${frameRegion}px`,
                // The left deck's board-facing rail duplicated the board trim and showed up as a stray
                // orange line. Keep its outer/top/bottom frame, but leave the board-facing edge clean.
                borderRightWidth: side === "left" ? 0 : `${frameRegion}px`,
                borderBottomWidth: `${frameRegion}px`,
                borderLeftWidth: `${frameRegion}px`,
                borderStyle: "solid",
                borderColor: "transparent",
                borderImageSource: `url(${frame.src})`,
                borderImageSlice: `${frame.slice}`,
                borderImageWidth: `${frameRegion}px`,
                borderImageRepeat: "stretch",
                ...fixedSide,
            }}
        />
    );
};
