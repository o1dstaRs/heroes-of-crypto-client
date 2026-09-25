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

import VolumeOffRoundedIcon from "@mui/icons-material/VolumeOffRounded";
import VolumeUpRoundedIcon from "@mui/icons-material/VolumeUpRounded";
import {
    Box,
    Divider,
    IconButton,
    Modal,
    ModalClose,
    ModalDialog,
    Option,
    Select,
    Slider,
    Stack,
    Typography,
} from "@mui/joy";
import React, { useCallback, useState, useSyncExternalStore } from "react";

import { SUPPORTED_LANGUAGES, setLanguage, t, useTranslation } from "../i18n/i18n";
import { hocColors, hocPanelSx, hocSplitterSliderSx } from "./hocTheme";
import { TEAM_COLOR_GREEN, TEAM_COLOR_RED } from "../scenes/teamColors";
import { playCallSound } from "./audio/chipSounds";
import { LanguageNavIcon } from "./svg/navigation";
import {
    getAudioLevels,
    getAudioLevelsServerSnapshot,
    setEffectsMuted,
    setEffectsVolume,
    setMusicMuted,
    setMusicVolume,
    subscribeAudioLevels,
} from "../settings/audioLevels";
import {
    ARMY_COLOR_PRESETS,
    TEAM_DEFAULT_ARMY_COLOR_ID,
    armyColorPresetById,
    readPlayerArmyColorId,
    writePlayerArmyColorId,
} from "../settings/playerArmyColor";
import {
    type BoardSidePreference,
    readBoardSidePreference,
    writeBoardSidePreference,
} from "../settings/playerBoardSide";

const hex = (color: number): string => `#${color.toString(16).padStart(6, "0")}`;

const SWATCH_SIDE = 38;

/**
 * Player settings, opened from the arena's nav row.
 *
 * The arena is where these belong: a player sets them up before queuing and the match then just uses
 * them. Everything here is local to this browser — nothing reaches the server, nothing reaches the
 * opponent.
 *
 * Sectioned so later settings have somewhere to land and every out-of-fight screen can expose the same
 * preferences without growing its own controls.
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

/** Locale is a player preference, so it lives with the other device-local settings on every arena page. */
const LanguageSetting: React.FC = () => {
    const { language } = useTranslation();

    return (
        <Box>
            <SectionHeading>{t("Language")}</SectionHeading>
            <Select
                value={language}
                onChange={(_event, code) => {
                    if (code) {
                        setLanguage(code);
                    }
                }}
                variant="soft"
                startDecorator={<LanguageNavIcon sx={{ fontSize: 22 }} />}
                aria-label={t("Language")}
                sx={{ mt: 0.8, width: "100%" }}
            >
                {SUPPORTED_LANGUAGES.map(({ code, label }) => (
                    <Option key={code} value={code}>
                        {label}
                    </Option>
                ))}
            </Select>
        </Box>
    );
};

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
                {t("Only you see this. Your opponent's army turns red, and replays keep the true colours.")}
            </Typography>
            {/* Fixed six-column grid: the eleven presets and the team default fill two rows exactly. */}
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
                {/* The default reads as one more swatch rather than a separate button: it is the same kind
                    of choice. Split green/red so it shows what it restores — the side colours, drawn by
                    team, which is what every screen shows until a colour is picked here. */}
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

/**
 * A small battlefield: the player's army is the gold column, standing where this choice puts it. "Random"
 * shows both columns half-lit with the swap between them, because the match decides.
 */
const BoardSideGlyph: React.FC<{ side: BoardSidePreference }> = ({ side }) => {
    const own = hocColors.gold;
    const other = "rgba(239,228,204,0.16)";
    const left = side === "right" ? other : own;
    const right = side === "left" ? other : own;
    const random = side === "seat";
    return (
        <svg width="56" height="34" viewBox="0 0 56 34" aria-hidden="true">
            <rect
                x="1"
                y="1"
                width="54"
                height="32"
                rx="4"
                fill="rgba(255,255,255,0.04)"
                stroke="rgba(220,177,88,0.38)"
            />
            <line x1="28" y1="5" x2="28" y2="29" stroke="rgba(220,177,88,0.22)" strokeDasharray="2 2" />
            <rect x="5" y="6" width="11" height="22" rx="2" fill={left} opacity={random ? 0.55 : 1} />
            <rect x="40" y="6" width="11" height="22" rx="2" fill={right} opacity={random ? 0.55 : 1} />
            {random && (
                <path
                    d="M21 17 H35 M24 14 L21 17 L24 20 M32 14 L35 17 L32 20"
                    fill="none"
                    stroke={own}
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            )}
        </svg>
    );
};

const BoardSideTile: React.FC<{
    side: BoardSidePreference;
    label: string;
    selected: boolean;
    onSelect: () => void;
}> = ({ side, label, selected, onSelect }) => (
    <Box
        component="button"
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 0.6,
            minWidth: 0,
            px: 0.5,
            py: 0.8,
            borderRadius: "10px",
            cursor: "pointer",
            background: selected ? "rgba(220,177,88,0.1)" : "rgba(255,255,255,0.03)",
            border: selected ? `2px solid ${hocColors.gold}` : "1px solid rgba(255,255,255,0.2)",
            boxShadow: selected ? `0 0 0 3px rgba(255,143,0,0.22)` : "none",
            color: selected ? hocColors.parchment : "rgba(239,228,204,0.72)",
            font: "inherit",
            transition: "transform 120ms ease, box-shadow 120ms ease",
            "&:hover": { transform: "translateY(-1px)", boxShadow: "0 0 0 3px rgba(255,143,0,0.14)" },
        }}
    >
        <BoardSideGlyph side={side} />
        <Typography level="body-xs" sx={{ color: "inherit", fontWeight: 750, lineHeight: 1.2 }}>
            {label}
        </Typography>
    </Box>
);

/**
 * Which side of the battlefield the player sees their own army on. Display only: the match still seats them
 * where it does, and the board is mirrored for them alone (settings/playerBoardSide, pixi/boardMirror).
 */
const BoardSideSetting: React.FC = () => {
    const [selected, setSelected] = useState<BoardSidePreference>(() => readBoardSidePreference());

    const choose = useCallback((side: BoardSidePreference) => {
        writeBoardSidePreference(side);
        setSelected(side);
    }, []);

    // Built here, not in a module constant, so every label is a literal t() key the i18n scan can see.
    const options: readonly { side: BoardSidePreference; label: string; hint: string }[] = [
        { side: "seat", label: t("Random"), hint: t("You play from whichever side the match seats you on.") },
        { side: "left", label: t("Left side"), hint: t("Your army always stands on the left.") },
        { side: "right", label: t("Right side"), hint: t("Your army always stands on the right.") },
    ];
    const hint = options.find((option) => option.side === selected)?.hint ?? "";

    return (
        <Box>
            <SectionHeading>{t("Gameplay")}</SectionHeading>
            <Typography level="body-sm" sx={{ color: hocColors.parchment, fontWeight: 750, mt: 0.7 }}>
                {t("Your side of the battlefield")}
            </Typography>
            <Typography level="body-xs" sx={{ color: "rgba(239,228,204,0.58)", mt: 0.2, lineHeight: 1.45 }}>
                {t(
                    "Only you see this. Your board is mirrored so your army stands where you like it; replays and spectators keep the true sides.",
                )}
            </Typography>
            <Box
                role="group"
                aria-label={t("Your side of the battlefield")}
                sx={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 1, mt: 1.3 }}
            >
                {options.map((option) => (
                    <BoardSideTile
                        key={option.side}
                        side={option.side}
                        label={option.label}
                        selected={selected === option.side}
                        onSelect={() => choose(option.side)}
                    />
                ))}
            </Box>
            <Typography level="body-xs" sx={{ color: hocColors.parchment, mt: 1, fontWeight: 700 }}>
                {hint}
            </Typography>
        </Box>
    );
};

/**
 * One level: a mute toggle, the name, the reading, and the slider under them.
 *
 * The mute is a real second piece of state rather than "drag it to zero", so a player can silence a
 * channel for one game and get their level back afterwards — and it is what the corner speaker has always
 * done for the music. Dragging up from silence unmutes: nobody drags a slider expecting nothing to happen.
 */
const AudioLevelRow: React.FC<{
    label: string;
    muteLabel: string;
    volume: number;
    muted: boolean;
    onVolume: (volume: number) => void;
    onMuted: (muted: boolean) => void;
    /** Fired when the player lets go of the slider, so a level they can hear can play itself back. */
    onPreview?: () => void;
}> = ({ label, muteLabel, volume, muted, onVolume, onMuted, onPreview }) => (
    <Box sx={{ mt: 1.3 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.8 }}>
            <IconButton
                size="sm"
                variant="plain"
                aria-label={muteLabel}
                aria-pressed={muted}
                onClick={() => {
                    onMuted(!muted);
                    if (muted) {
                        onPreview?.();
                    }
                }}
                sx={{
                    "--IconButton-size": "26px",
                    minHeight: 26,
                    minWidth: 26,
                    color: muted ? "rgba(239,228,204,0.42)" : hocColors.gold,
                    "&:hover": { bgcolor: hocColors.orangeSoft, color: hocColors.orange },
                }}
            >
                {muted ? <VolumeOffRoundedIcon fontSize="small" /> : <VolumeUpRoundedIcon fontSize="small" />}
            </IconButton>
            <Typography level="body-sm" sx={{ color: hocColors.parchment, fontWeight: 750 }}>
                {label}
            </Typography>
            <Box sx={{ flex: 1 }} />
            <Typography
                level="body-xs"
                sx={{ color: muted ? "rgba(239,228,204,0.42)" : hocColors.gold, fontWeight: 700 }}
            >
                {muted ? t("Muted") : `${Math.round(volume * 100)}%`}
            </Typography>
        </Box>
        <Slider
            size="sm"
            min={0}
            max={100}
            step={1}
            value={Math.round(volume * 100)}
            aria-label={label}
            onChange={(_event, value) => {
                const next = (Array.isArray(value) ? value[0] : value) / 100;
                onVolume(next);
                if (next > 0 && muted) {
                    onMuted(false);
                }
            }}
            onChangeCommitted={() => onPreview?.()}
            sx={{ ...hocSplitterSliderSx, mt: 0.4, opacity: muted ? 0.55 : 1 }}
        />
    </Box>
);

/**
 * The two audio levels. They used to be one: the sound effects read the music's volume and mute, so a
 * player who wanted a quiet theme lost the chips with it. Both live in settings/audioLevels now, which is
 * also what the corner speaker moves — so opening this panel always shows the level actually in force.
 */
const AudioSettings: React.FC = () => {
    const levels = useSyncExternalStore(subscribeAudioLevels, getAudioLevels, getAudioLevelsServerSnapshot);

    return (
        <Box>
            <SectionHeading>{t("Audio")}</SectionHeading>
            <AudioLevelRow
                label={t("Music")}
                muteLabel={levels.musicMuted ? t("Unmute music") : t("Mute music")}
                volume={levels.musicVolume}
                muted={levels.musicMuted}
                onVolume={setMusicVolume}
                onMuted={setMusicMuted}
            />
            <AudioLevelRow
                label={t("Sound effects")}
                muteLabel={levels.effectsMuted ? t("Unmute sound effects") : t("Mute sound effects")}
                volume={levels.effectsVolume}
                muted={levels.effectsMuted}
                onVolume={setEffectsVolume}
                onMuted={setEffectsMuted}
                // Setting a level you cannot hear is guesswork, and the chip clack is the shortest sound
                // the game owns. Releasing the slider is also the gesture that unblocks WebAudio.
                onPreview={playCallSound}
            />
            <Typography level="body-xs" sx={{ color: "rgba(239,228,204,0.5)", mt: 0.7, lineHeight: 1.45 }}>
                {t("Interface sounds, like the wager chips.")}
            </Typography>
        </Box>
    );
};

export const PlayerSettingsPanel: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
    useTranslation();

    return (
        <Modal open={open} onClose={onClose}>
            <ModalDialog
                sx={{
                    ...hocPanelSx,
                    width: "min(420px, calc(100vw - 32px))",
                    minWidth: 0,
                    maxHeight: "calc(100vh - 32px)",
                    overflowY: "auto",
                    gap: 0,
                }}
            >
                <ModalClose sx={{ color: hocColors.parchment }} />
                <Typography level="h4" sx={{ color: hocColors.parchment }}>
                    {t("Player settings")}
                </Typography>
                <Typography level="body-xs" sx={{ color: "rgba(239,228,204,0.55)", mt: 0.2, mb: 1.6 }}>
                    {t("Saved on this device only.")}
                </Typography>
                <Stack spacing={1.8} divider={<Divider sx={{ bgcolor: "rgba(220,177,88,0.18)" }} />} sx={{ pb: 0.5 }}>
                    <LanguageSetting />
                    <ArmyColorSetting />
                    <AudioSettings />
                    <BoardSideSetting />
                </Stack>
            </ModalDialog>
        </Modal>
    );
};

export default PlayerSettingsPanel;
