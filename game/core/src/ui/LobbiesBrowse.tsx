/*
 * -----------------------------------------------------------------------------
 * This file is part of the game core of the Heroes of Crypto.
 *
 * Heroes of Crypto and Heroes of Crypto AI are registered trademarks.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 * -----------------------------------------------------------------------------
 */

import { Box, Sheet, Stack, Typography } from "@mui/joy";
import React from "react";

import { t, useTranslation } from "../i18n/i18n";
import { ArenaNavBar } from "./ArenaNavBar";
import {
    ARENA_COLUMN_WIDTH,
    arenaCardBodySx,
    arenaCardHeaderSx,
    arenaCardSx,
    arenaEyebrowSx,
    arenaScreenSx,
    arenaTitleSx,
    arenaWashSx,
} from "./arenaBackdrop";
import { hocColors } from "./hocTheme";
import { PublicLobbiesPanel } from "./PublicLobbiesPanel";

/**
 * The standalone open-lobbies screen. The list, the price quote and the create dialog all live in
 * PublicLobbiesPanel, which the Ranked Arena also renders inline — this route is just the full-page
 * frame around it, so the two surfaces can never drift into showing different things.
 *
 * That frame is the ARENA's frame (see arenaBackdrop): the same obsidian plate, the same nav bar, the
 * same floating card. Before this it was a black page with a lone back button, which made the custom
 * games look like a scratch screen someone forgot to finish rather than the other half of the game.
 */
export const LobbiesBrowse: React.FC = () => {
    useTranslation();

    return (
        <Box sx={arenaScreenSx}>
            <Box aria-hidden="true" sx={arenaWashSx} />

            <ArenaNavBar current="lobbies" />

            <Box
                role="main"
                sx={{
                    position: "relative",
                    zIndex: 1,
                    width: ARENA_COLUMN_WIDTH,
                    mx: "auto",
                    py: { xs: 2, md: 3 },
                }}
            >
                <Sheet component="section" aria-labelledby="lobbies-heading" variant="outlined" sx={arenaCardSx}>
                    <Box sx={arenaCardHeaderSx}>
                        <Typography level="body-xs" sx={arenaEyebrowSx}>
                            {t("PLAY A FRIEND")}
                        </Typography>
                        <Typography id="lobbies-heading" level="h1" sx={arenaTitleSx}>
                            {t("Custom games")}
                        </Typography>
                        {/* Says what this screen is FOR. The list below can be empty for long stretches —
                            it usually is — and an empty page that never explains itself reads as broken. */}
                        <Typography
                            level="body-sm"
                            sx={{ color: hocColors.muted, maxWidth: 620, mt: 1.1, lineHeight: 1.5 }}
                        >
                            {t(
                                "Friends' rooms appear first. Join an open table, or create one and call for a challenger.",
                            )}
                        </Typography>
                    </Box>

                    <Box sx={arenaCardBodySx}>
                        <Stack spacing={2}>
                            <PublicLobbiesPanel />
                        </Stack>
                    </Box>
                </Sheet>
            </Box>
        </Box>
    );
};
