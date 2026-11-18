import { Box } from "@mui/joy";
import React from "react";

import { images } from "../../generated/image_imports";

const FRAME_COUNT = 14;
const AXIS_DEGREES = -53.4;
const LENGTH_SCALE = 1.28;

/** One authored cut for full draft cards and the compact ban rail. */
export const DraftBanSlash: React.FC = () => (
    <Box
        aria-hidden
        data-testid="draft-ban-slash"
        sx={{
            position: "absolute",
            inset: 0,
            zIndex: 4,
            pointerEvents: "none",
            borderRadius: "inherit",
            backgroundImage: `url(${images.pick_ban_slash_variant2_atlas})`,
            backgroundRepeat: "no-repeat",
            backgroundSize: `${FRAME_COUNT * 100}% 100%`,
            backgroundPosition: "0% 0",
            animation: `hocBanSlashCut 580ms steps(${FRAME_COUNT - 1}, end) forwards`,
            transform: `rotate(${AXIS_DEGREES}deg) scaleX(${LENGTH_SCALE}) rotate(${-AXIS_DEGREES}deg)`,
            transformOrigin: "center",
            willChange: "background-position",
            "@keyframes hocBanSlashCut": {
                "0%": { backgroundPosition: "0% 0" },
                "100%": { backgroundPosition: "100% 0" },
            },
            "@media (prefers-reduced-motion: reduce)": {
                animation: "none",
                backgroundPosition: "100% 0",
            },
        }}
    />
);
