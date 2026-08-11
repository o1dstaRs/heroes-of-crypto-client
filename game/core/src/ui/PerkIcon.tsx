import { Box } from "@mui/joy";
import React from "react";

import { getPerkIconImage } from "./perkCopy";

export const PerkIcon: React.FC<{
    perkId: number;
    size?: number | string;
    sx?: React.ComponentProps<typeof Box>["sx"];
}> = ({ perkId, size = "100%", sx }) => {
    const src = getPerkIconImage(perkId);

    return src ? (
        <Box
            component="img"
            src={src}
            alt=""
            aria-hidden="true"
            sx={{
                display: "block",
                width: size,
                height: size,
                maxWidth: "100%",
                maxHeight: "100%",
                flex: "0 0 auto",
                borderRadius: "50%",
                objectFit: "cover",
                objectPosition: "center",
                ...sx,
            }}
        />
    ) : null;
};
