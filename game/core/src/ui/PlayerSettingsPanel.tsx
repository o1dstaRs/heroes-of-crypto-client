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

import { Box, Divider, Modal, ModalClose, ModalDialog, Stack, Typography } from "@mui/joy";
import React, { useCallback, useState } from "react";

import { t, useTranslation } from "../i18n/i18n";
import { hocColors, hocPanelSx } from "./hocTheme";
import { TEAM_COLOR_GREEN, TEAM_COLOR_RED } from "../scenes/teamColors";
import {
    ARMY_COLOR_PRESETS,
    TEAM_DEFAULT_ARMY_COLOR_ID,
    armyColorPresetById,
    readPlayerArmyColorId,
    writePlayerArmyColorId,
} from "../settings/playerArmyColor";

const hex = (color: number): string => `#${color.toString(16).padStart(6, "0")}`;

const SWATCH_SIDE = 38;

/**
 * Player settings, opened from the arena's nav row.
 *
 * The arena is where these belong: a player sets them up before queuing and the match then just uses
 * them. Everything here is local to this browser — nothing reaches the server, nothing reaches the
 * opponent.
 *
 * Sectioned so later settings have somewhere to land. Only Appearance has one today; the others say so
 * rather than showing controls that do nothing.
 */
const SectionHeading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <Typography
        level="body-xs"
        sx={{
            color: hocColors.gold,
            fontWeight: 800,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            opacity: 0.9,
        }}
    >
        {children}
    </Typography>
);

const EmptySection: React.FC<{ title: string }> = ({ title }) => (
    <Box>
        <SectionHeading>{title}</SectionHeading>
        <Typography level="body-xs" sx={{ color: "rgba(239,228,204,0.42)", mt: 0.5, fontStyle: "italic" }}>
            {t("Nothing to configure here yet.")}
        </Typography>
    </Box>
);

/** One selectable tile. `background` carries the swatch's fill — a flat colour or the team split. */
const ColorTile: React.FC<{
    label: string;
    background: string;
    selected: boolean;
    onSelect: () => void;
}> = ({ label, background, selected, onSelect }) => (
    <Box
        component="button"
        type="button"
        title={label}
        aria-label={label}
        aria-pressed={selected}
        onClick={onSelect}
        sx={{
            position: "relative",
            width: SWATCH_SIDE,
            height: SWATCH_SIDE,
            p: 0,
            borderRadius: "10px",
            cursor: "pointer",
            background,
            border: selected ? `2px solid ${hocColors.gold}` : "1px solid rgba(255,255,255,0.2)",
            boxShadow: selected ? `0 0 0 3px rgba(255,143,0,0.22)` : "none",
            transition: "transform 120ms ease, box-shadow 120ms ease",
            "&:hover": { transform: "translateY(-1px)", boxShadow: "0 0 0 3px rgba(255,143,0,0.14)" },
        }}
    >
        {selected && (
            // The ring alone is hard to read on the paler presets, so the choice is also stated with a
            // mark. Both layers are drawn dark-on-light and light-on-dark by the same text shadow.
            <Box
                component="span"
                aria-hidden
                sx={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "1rem",
                    fontWeight: 900,
                    color: "#fff",
                    textShadow: "0 0 3px rgba(0,0,0,0.85)",
                }}
            >
                ✓
            </Box>
        )}
    </Box>
);

const ArmyColorSetting: React.FC = () => {
    const [selected, setSelected] = useState<string>(() => readPlayerArmyColorId());

    const choose = useCallback((presetId: string) => {
        writePlayerArmyColorId(presetId);
        setSelected(presetId);
    }, []);

    const selectedPreset = armyColorPresetById(selected);
    const selectedLabel = selectedPreset ? t(selectedPreset.label) : t("Team colours");

    return (
        <Box>
            <SectionHeading>{t("Appearance")}</SectionHeading>
            <Typography level="body-sm" sx={{ color: hocColors.parchment, fontWeight: 750, mt: 0.7 }}>
                {t("Your army colour")}
            </Typography>
            <Typography level="body-xs" sx={{ color: "rgba(239,228,204,0.58)", mt: 0.2, lineHeight: 1.45 }}>
                {t("Only you see this. Your opponent's army keeps its colour, and replays keep both.")}
            </Typography>
            {/* Fixed six-column grid: the ten presets and the team default land as two even rows rather
                than an eleven-item wrap that orphans a tile at the dialog's width. */}
            <Box
                sx={{
                    display: "grid",
                    gridTemplateColumns: `repeat(6, ${SWATCH_SIDE}px)`,
                    gap: 1,
                    mt: 1.3,
                    justifyContent: "space-between",
                }}
            >
                {ARMY_COLOR_PRESETS.map((preset) => (
                    <ColorTile
                        key={preset.id}
                        label={t(preset.label)}
                        background={hex(preset.color)}
                        selected={selected === preset.id}
                        onSelect={() => choose(preset.id)}
                    />
                ))}
                {/* The default reads as an eleventh swatch rather than a separate button: it is the same
                    kind of choice. Split green/red so it shows what it restores. */}
                <ColorTile
                    label={t("Team colours")}
                    background={`linear-gradient(135deg, ${hex(TEAM_COLOR_GREEN)} 0 50%, ${hex(TEAM_COLOR_RED)} 50% 100%)`}
                    selected={selected === TEAM_DEFAULT_ARMY_COLOR_ID}
                    onSelect={() => choose(TEAM_DEFAULT_ARMY_COLOR_ID)}
                />
            </Box>
            <Typography level="body-xs" sx={{ color: hocColors.parchment, mt: 1, fontWeight: 700 }}>
                {selectedLabel}
            </Typography>
        </Box>
    );
};

export const PlayerSettingsPanel: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
    useTranslation();

    return (
        <Modal open={open} onClose={onClose}>
            <ModalDialog sx={{ ...hocPanelSx, minWidth: 360, maxWidth: 420, gap: 0 }}>
                <ModalClose sx={{ color: hocColors.parchment }} />
                <Typography level="h4" sx={{ color: hocColors.parchment }}>
                    {t("Player settings")}
                </Typography>
                <Typography level="body-xs" sx={{ color: "rgba(239,228,204,0.55)", mt: 0.2, mb: 1.6 }}>
                    {t("Saved on this device only.")}
                </Typography>
                <Stack spacing={1.8} divider={<Divider sx={{ bgcolor: "rgba(220,177,88,0.18)" }} />} sx={{ pb: 0.5 }}>
                    <ArmyColorSetting />
                    <EmptySection title={t("Audio")} />
                    <EmptySection title={t("Gameplay")} />
                </Stack>
            </ModalDialog>
        </Modal>
    );
};

export default PlayerSettingsPanel;
