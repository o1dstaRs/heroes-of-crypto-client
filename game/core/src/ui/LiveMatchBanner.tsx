import Box from "@mui/joy/Box";
import Button from "@mui/joy/Button";
import Stack from "@mui/joy/Stack";
import Typography from "@mui/joy/Typography";
import React from "react";
import { useLocation, useNavigate } from "react-router";

import { t } from "../i18n/i18n";
import { hocColors, hocPanelSx, hocPrimaryButtonSx } from "./hocTheme";
import { liveMatchBannerModel } from "./liveMatchBannerModel";
import { useSocial } from "./social/SocialProvider";

/**
 * "You have a game in progress" — one click back into a live ranked/lobby game from any screen. Fed by
 * the presence ping (the server reports the viewer's live game and its stage), so a reload, a stray
 * navigation or a second tab always shows the way back; hidden on the game's own routes.
 */
export const LiveMatchBanner: React.FC = () => {
    const { liveGame } = useSocial();
    const location = useLocation();
    const navigate = useNavigate();
    const model = liveMatchBannerModel(liveGame ?? undefined, location.pathname);
    if (!model) {
        return null;
    }
    return (
        <Box
            role="status"
            sx={{
                position: "fixed",
                bottom: 18,
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 1350,
                ...hocPanelSx,
                px: 1.5,
                py: 0.75,
                maxWidth: "min(92vw, 520px)",
                boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
            }}
        >
            <Stack direction="row" spacing={1.25} alignItems="center">
                <Typography level="body-sm" sx={{ color: hocColors.gold, whiteSpace: "nowrap" }}>
                    {t(model.message)}
                </Typography>
                <Button size="sm" sx={hocPrimaryButtonSx} onClick={() => navigate(model.target)}>
                    {t(model.action)}
                </Button>
            </Stack>
        </Box>
    );
};

export default LiveMatchBanner;
