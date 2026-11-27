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

import { Box, Button, Stack } from "@mui/joy";
import React, { useState } from "react";
import { useNavigate } from "react-router";

import { t, useTranslation } from "../i18n/i18n";
import { hocColors, hocSoftButtonSx } from "./hocTheme";
import { PlayerSettingsPanel } from "./PlayerSettingsPanel";
import { LobbyNavIcon, ProfileNavIcon, RankedNavIcon, SandboxNavIcon, SettingsNavIcon } from "./svg/navigation";

/** Which of the four places the player is standing in — that one is marked, not linked. */
export type ArenaNavPlace = "ranked" | "lobbies" | "sandbox" | "portal";

export interface ArenaNavBarProps {
    current: ArenaNavPlace;
    /**
     * Queued for a ranked match: every destination is held shut, because walking away silently drops
     * the search. Settings is not a destination and stays open.
     */
    locked?: boolean;
    /** Width of the column the page centres below it, so the bar lines up with the card under it. */
    width?: string;
}

const navButtonSx = {
    flex: { xs: 1, sm: "0 0 auto" },
    flexDirection: { xs: "column", sm: "row" },
    gap: { xs: 0.3, sm: "var(--Button-gap)" },
    minWidth: 0,
    minHeight: { xs: 48, sm: 44 },
    px: { xs: 0.45, sm: 1.25 },
    fontSize: { xs: "0.66rem", sm: "0.8rem" },
    lineHeight: 1.15,
    touchAction: "manipulation",
    "& .MuiButton-startDecorator": { m: 0 },
    "& .MuiButton-startDecorator svg": { fontSize: { xs: 21, sm: 24 } },
    "@media (hover: hover) and (pointer: fine)": { "&:hover": { bgcolor: hocColors.orangeSoft } },
} as const;

const navLabelSx = {
    display: "block",
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
} as const;

/**
 * The bar that sits above every out-of-fight screen: Ranked, Lobby, Sandbox, Profile, Settings.
 *
 * One component rather than a copy per screen. It was the arena's alone, and the lobby browser next
 * door had a lone "back to the arena" button instead — which made the two read as different apps and
 * left the lobby list a dead end for everything except going back. Sharing it also means a screen
 * added later cannot quietly ship a nav row with a different set of places in it.
 */
export const ArenaNavBar: React.FC<ArenaNavBarProps> = ({
    current,
    locked = false,
    width = "min(1040px, calc(100% - 32px))",
}) => {
    const navigate = useNavigate();
    useTranslation();
    const [settingsOpen, setSettingsOpen] = useState(false);

    // Built here rather than at module scope so the labels are re-read in the chosen language, and so
    // the i18n scanner sees them as the literals they are.
    const places = [
        { id: "ranked", to: "/play", label: t("Ranked"), name: t("Ranked Arena"), Icon: RankedNavIcon },
        { id: "lobbies", to: "/lobbies", label: t("Lobby"), name: t("Lobby"), Icon: LobbyNavIcon },
        { id: "sandbox", to: "/", label: t("Sandbox"), name: t("Sandbox"), Icon: SandboxNavIcon },
        { id: "portal", to: "/portal", label: t("Profile"), name: t("Profile"), Icon: ProfileNavIcon },
    ] as const;

    return (
        <Box
            component="header"
            sx={{
                position: "relative",
                zIndex: 1,
                width,
                mx: "auto",
                pt: { xs: 1, sm: 1.5, lg: 2.5 },
            }}
        >
            <Stack
                direction="row"
                alignItems="center"
                justifyContent="flex-end"
                sx={{
                    px: { xs: 0.55, md: 1.75 },
                    py: { xs: 0.55, sm: 0.75 },
                    borderRadius: "16px",
                    bgcolor: "rgba(9,6,4,0.78)",
                    border: "1px solid rgba(239,228,204,0.1)",
                    boxShadow: "0 12px 34px rgba(0,0,0,0.34)",
                    backdropFilter: "blur(16px)",
                }}
            >
                <Stack
                    component="nav"
                    aria-label={t("Game navigation")}
                    direction="row"
                    spacing={0.5}
                    sx={{ width: { xs: "100%", sm: "auto" } }}
                >
                    {places.map(({ id, to, label, name, Icon }) => {
                        const here = id === current;
                        return (
                            <Button
                                key={id}
                                aria-label={name}
                                size="sm"
                                variant={here ? "soft" : "plain"}
                                aria-current={here ? "page" : undefined}
                                disabled={here ? false : locked}
                                onClick={here ? undefined : () => navigate(to)}
                                title={!here && locked ? t("Leave matchmaking before navigating away") : undefined}
                                startDecorator={<Icon />}
                                sx={{
                                    ...(here ? hocSoftButtonSx : {}),
                                    ...navButtonSx,
                                    color: here ? hocColors.gold : hocColors.mutedStrong,
                                }}
                            >
                                <Box component="span" sx={navLabelSx}>
                                    {label}
                                </Box>
                            </Button>
                        );
                    })}
                    {/* Settings opens a popup rather than navigating, so it is not disabled while queued
                        the way the destinations are, and it carries a sliders mark instead of a place
                        pictogram. */}
                    <Button
                        aria-label={t("Player settings")}
                        aria-haspopup="dialog"
                        aria-expanded={settingsOpen}
                        size="sm"
                        variant="plain"
                        onClick={() => setSettingsOpen(true)}
                        startDecorator={<SettingsNavIcon />}
                        sx={{
                            ...navButtonSx,
                            color: settingsOpen ? hocColors.gold : hocColors.mutedStrong,
                        }}
                    >
                        <Box component="span" sx={navLabelSx}>
                            {t("Settings")}
                        </Box>
                    </Button>
                </Stack>
            </Stack>
            <PlayerSettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
        </Box>
    );
};
