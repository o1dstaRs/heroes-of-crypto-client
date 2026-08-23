import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import { Box, Button, Stack, Typography } from "@mui/joy";
import React from "react";
import { useNavigate } from "react-router";

import { t, useTranslation } from "../i18n/i18n";
import { hocColors, hocSoftButtonSx } from "./hocTheme";
import { PublicLobbiesPanel } from "./PublicLobbiesPanel";

/**
 * The standalone open-lobbies screen. The list, the price quote and the create dialog all live in
 * PublicLobbiesPanel, which the Ranked Arena also renders inline — this route is just the full-page
 * frame around it, so the two surfaces can never drift into showing different things.
 */
export const LobbiesBrowse: React.FC = () => {
    const navigate = useNavigate();
    useTranslation();

    return (
        <Box sx={{ minHeight: "100vh", bgcolor: hocColors.black, p: 3, display: "flex", justifyContent: "center" }}>
            <Stack spacing={2} sx={{ width: "100%", maxWidth: 720 }}>
                {/* The arena is the only way IN here, and until this existed it was a one-way trip:
                    nothing on this screen led back, so short of the browser button a player was
                    stranded in the lobby list. */}
                <Stack direction="row" alignItems="center" spacing={1.5} sx={{ minWidth: 0 }}>
                    <Button
                        variant="soft"
                        sx={{ ...hocSoftButtonSx, flexShrink: 0 }}
                        startDecorator={<ArrowBackRoundedIcon />}
                        onClick={() => navigate("/play")}
                    >
                        {t("Ranked arena")}
                    </Button>
                    <Typography level="h2" noWrap sx={{ color: hocColors.parchment, minWidth: 0 }}>
                        {t("Open lobbies")}
                    </Typography>
                </Stack>

                <PublicLobbiesPanel />
            </Stack>
        </Box>
    );
};
