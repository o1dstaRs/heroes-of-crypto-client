import { Box } from "@mui/joy";
import React from "react";

import { getDoctrineIconImage } from "./doctrineCopy";

export const DoctrineIcon: React.FC<{
    doctrineId: number;
    size?: number | string;
    sx?: React.ComponentProps<typeof Box>["sx"];
}> = ({ doctrineId, size = "100%", sx }) => {
    const src = getDoctrineIconImage(doctrineId);

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
