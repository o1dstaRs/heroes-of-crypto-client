import React from "react";
import Box from "@mui/joy/Box";
import Typography from "@mui/joy/Typography";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";

import * as packageJson from "../../../package.json";

export const VersionDisplay = () => (
    <Box sx={{ display: "flex", gap: 1, alignItems: "center", justifyContent: "flex-end", height: 32 }}>
        <a
            href="https://heroesofcrypto.io/patches"
            target="_blank"
            rel="noopener noreferrer"
            style={{
                display: "flex",
                alignItems: "center",
                textDecoration: "none",
                color: "inherit",
                transition: "transform 0.3s ease",
            }}
            onMouseOver={(e) => (e.currentTarget.style.transform = "scale(1.1)")}
            onMouseOut={(e) => (e.currentTarget.style.transform = "scale(1)")}
        >
            <Typography level="title-md">v{packageJson.version}</Typography>
            <OpenInNewRoundedIcon
                sx={{
                    color: "white",
                    fontSize: 16,
                    ml: 0.5,
                }}
            />
        </a>
    </Box>
);
