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

import { Box, Divider, Modal, ModalDialog, Stack, Typography } from "@mui/joy";
import React, { useCallback, useState } from "react";

import { t, useTranslation } from "../i18n/i18n";
import { hocColors, hocPanelSx } from "./hocTheme";
import {
    ARMY_COLOR_PRESETS,
    TEAM_DEFAULT_ARMY_COLOR_ID,
    readPlayerArmyColorId,
    writePlayerArmyColorId,
} from "../settings/playerArmyColor";

const hex = (color: number): string => `#${color.toString(16).padStart(6, "0")}`;

/**
 * Player settings, opened from the arena.
 *
 * The arena is where these belong: a player sets them up before queuing, and the match then simply uses
 * them. Everything here is local to this browser — nothing is sent to the server, and nothing affects the
 * opponent.
 *
 * Laid out in sections so the later ones have somewhere to land. Only Appearance has a setting today; the
 * rest say so plainly rather than showing controls that do nothing.
 */
const SectionHeading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <Typography
        level="body-xs"
        sx={{ color: hocColors.gold, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase" }}
    >
        {children}
    </Typography>
);

const EmptySection: React.FC<{ title: string }> = ({ title }) => (
    <Box>
        <SectionHeading>{title}</SectionHeading>
        <Typography level="body-xs" sx={{ color: "rgba(239,228,204,0.5)", mt: 0.4 }}>
            {t("Nothing to configure here yet.")}
        </Typography>
    </Box>
);

/** The army-colour picker: ten presets plus the team default. */
const ArmyColorSetting: React.FC = () => {
    const [selected, setSelected] = useState<string>(() => readPlayerArmyColorId());

    const choose = useCallback((presetId: string) => {
        writePlayerArmyColorId(presetId);
        setSelected(presetId);
    }, []);

    return (
        <Box>
            <SectionHeading>{t("Appearance")}</SectionHeading>
            <Typography level="body-sm" sx={{ color: hocColors.parchment, fontWeight: 700, mt: 0.6 }}>
                {t("Your army colour")}
            </Typography>
            <Typography level="body-xs" sx={{ color: "rgba(239,228,204,0.62)", mt: 0.2 }}>
                {t("Only you see this. Your opponent's army keeps its colour, and replays keep both.")}
            </Typography>
            {/* Fixed five-column grid rather than wrapping: ten presets then read as two even rows instead
                of a nine-and-one orphan at whatever width the dialog happens to be. */}
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 1, mt: 1.2 }}>
                {ARMY_COLOR_PRESETS.map((preset) => {
                    const isSelected = selected === preset.id;
                    return (
                        <Box
                            key={preset.id}
                            component="button"
                            type="button"
                            title={t(preset.label)}
                            aria-label={t(preset.label)}
                            aria-pressed={isSelected}
                            onClick={() => choose(preset.id)}
                            sx={{
                                width: "100%",
                                height: 34,
                                borderRadius: "9px",
                                p: 0,
                                cursor: "pointer",
                                bgcolor: hex(preset.color),
                                border: isSelected ? `2px solid ${hocColors.gold}` : "1px solid rgba(255,255,255,0.22)",
                                boxShadow: isSelected ? `0 0 10px ${hocColors.orangeBorder}` : "none",
                            }}
                        />
                    );
                })}
            </Box>
            <Box
                component="button"
                type="button"
                aria-pressed={selected === TEAM_DEFAULT_ARMY_COLOR_ID}
                onClick={() => choose(TEAM_DEFAULT_ARMY_COLOR_ID)}
                sx={{
                    mt: 1.2,
                    width: "100%",
                    py: 0.7,
                    borderRadius: "9px",
                    cursor: "pointer",
                    color: hocColors.parchment,
                    fontWeight: 750,
                    fontSize: "0.78rem",
                    bgcolor: selected === TEAM_DEFAULT_ARMY_COLOR_ID ? "rgba(255,143,0,0.16)" : "rgba(0,0,0,0.3)",
                    border:
                        selected === TEAM_DEFAULT_ARMY_COLOR_ID
                            ? `2px solid ${hocColors.gold}`
                            : "1px solid rgba(220,177,88,0.3)",
                }}
            >
                {t("Team colours")}
            </Box>
        </Box>
    );
};

export const PlayerSettingsPanel: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
    useTranslation();

    return (
        <Modal open={open} onClose={onClose}>
            <ModalDialog sx={{ ...hocPanelSx, minWidth: 340, maxWidth: 420 }}>
                <Typography level="h4" sx={{ color: hocColors.parchment }}>
                    {t("Player settings")}
                </Typography>
                <Typography level="body-xs" sx={{ color: "rgba(239,228,204,0.6)", mb: 0.5 }}>
                    {t("Saved on this device only.")}
                </Typography>
                <Stack spacing={1.6} divider={<Divider sx={{ bgcolor: "rgba(220,177,88,0.2)" }} />}>
                    <ArmyColorSetting />
                    <EmptySection title={t("Audio")} />
                    <EmptySection title={t("Gameplay")} />
                </Stack>
            </ModalDialog>
        </Modal>
    );
};

export default PlayerSettingsPanel;
