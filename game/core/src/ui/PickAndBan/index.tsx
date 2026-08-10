import {
    AllAbilities,
    Artifact,
    CREATURES_JSON,
    CreatureVals,
    getCreatureLevel,
    getCreaturesByLevel,
    HoCConfig,
    HoCConstants,
    Perk,
    PickPhaseVals,
    SynergyKeysToPower,
    synergyVariantsForSeed,
    TeamVals,
    type TeamType,
} from "@heroesofcrypto/common";
import { Box, Button, Card, CardContent, Chip, CircularProgress, Divider, Sheet, Tooltip, Typography } from "@mui/joy";
import React, { useEffect, useState } from "react";

import { images as rawImages } from "../../generated/image_imports";
import { t, useTranslation } from "../../i18n/i18n";
import { isFullscreenActive, onFullscreenChange, toggleFullscreen } from "../fullscreen";
import { getPreGamePerk } from "../../utils/preGamePerk";
import { usePickBanEvents } from "../context/PickBanContext";
import { useAuthContext } from "../auth/context/auth_context";
import { hocDisplayFontFamily } from "../hocTheme";
import { SYNERGY_KEY_TO_IMAGE, SYNERGY_NAME_TO_DESCRIPTION } from "../LeftSideBar/SynergiesConstants";
import { UNIT_ID_TO_IMAGE, UNIT_ID_TO_NAME } from "../unit_ui_constants";
import { PERK_COPY } from "../perkCopy";
import { ArrowShieldIcon } from "../svg/arrow_shield";
import { BootIcon } from "../svg/boot";
import { FistIcon } from "../svg/fist";
import { HeartIcon } from "../svg/heart";
import { MagicShieldIcon } from "../svg/magic_shield";
import { QuiverIcon } from "../svg/quiver";
import { ShieldIcon } from "../svg/shield";
import { ShotRangeIcon } from "../svg/shot_range";
import { InitiativeIcon } from "../svg/initiative";
import { SwordIcon } from "../svg/sword";
import { MapBadge, MapRevealModal } from "./MapReveal";
import { Timer } from "./Timer";
import { isAugmentHandoffPhase, shouldShowOpponentDraftRail } from "./draftPhaseVisibility";

const images = rawImages as Record<string, string>;

const creatureName = (creatureId: number): string => UNIT_ID_TO_NAME[creatureId] ?? `Creature ${creatureId}`;
const creatureImage = (creatureId: number): string | undefined => UNIT_ID_TO_IMAGE[creatureId];

// ---- Creature stats + abilities lookup (shared creatures.json / abilities.json) ------------------

interface CreatureFullConfig {
    name: string;
    hp: number;
    attack: number;
    attack_damage_min: number;
    attack_damage_max: number;
    armor: number;
    initiative: number;
    steps: number;
    magic_resist: number;
    attack_type: string;
    range_shots: number;
    shot_distance: number;
    level: number;
    size: number;
    abilities?: string[];
}

// Index every creature by name once (creatures.json is faction -> { name -> config }, plus a version key).
const creatureConfigByName: Map<string, { faction: string; config: CreatureFullConfig }> = (() => {
    const map = new Map<string, { faction: string; config: CreatureFullConfig }>();
    for (const faction of Object.keys(CREATURES_JSON)) {
        const roster = (CREATURES_JSON as Record<string, unknown>)[faction];
        if (!roster || typeof roster !== "object") {
            continue; // skip the top-level "version" number
        }
        for (const [unitName, cfg] of Object.entries(roster as Record<string, CreatureFullConfig>)) {
            map.set(unitName, { faction, config: cfg });
        }
    }
    return map;
})();

const creatureFullConfig = (creatureId: number) => creatureConfigByName.get(creatureName(creatureId));

// Ability description with the {} power placeholder filled in (mirrors how the game renders it).
const abilityDescription = (abilityName: string): string => {
    try {
        const cfg = HoCConfig.getAbilityConfig(abilityName);
        const template = (cfg.desc ?? []).join(" ");
        if (abilityName === AllAbilities.CHAKRAM_ABILITY_NAME) {
            return AllAbilities.chakramDescription(template, HoCConstants.MAX_UNIT_STACK_POWER).trim();
        }
        return template.replace(/\{\}/g, String(cfg.power ?? "")).trim();
    } catch {
        return "";
    }
};

const StatChip: React.FC<{ icon: React.ReactNode; value: React.ReactNode; label: string }> = ({
    icon,
    value,
    label,
}) => (
    <Tooltip title={label} variant="soft" placement="top">
        <Box
            sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                px: 1,
                py: 0.5,
                borderRadius: "12px",
                bgcolor: "rgba(255,255,255,0.05)",
                minWidth: 0,
                "& svg": { width: 22, height: 22, flex: "0 0 auto" },
            }}
        >
            {icon}
            <Typography sx={{ fontSize: 19, fontWeight: 700, color: "#e9e6df", whiteSpace: "nowrap" }}>
                {value}
            </Typography>
        </Box>
    </Tooltip>
);

// Top readout showing the currently inspected (hovered) creature's stats + abilities, so players can read
// what a unit does before picking it. The header always reserves its space; revealing it must not shove the
// hovered portrait away from the cursor.
const CreatureDetailPanel: React.FC<{ creatureId: number; armyHp?: number }> = ({ creatureId, armyHp = 0 }) => {
    if (!creatureId) {
        return null;
    }
    const entry = creatureFullConfig(creatureId);
    if (!entry) {
        return null;
    }
    const c = entry.config;
    const isRanged = c.attack_type === "RANGE";
    const img = creatureImage(creatureId);
    const abilities = (c.abilities ?? []).filter(Boolean);
    return (
        <Sheet
            variant="soft"
            sx={{
                width: "100%",
                height: 158,
                overflow: "hidden",
                p: "12px 20px",
                borderRadius: "20px",
                bgcolor: "rgba(11,13,18,0.98)",
                border: "2px solid rgba(159,182,212,0.55)",
                boxShadow: "0 18px 44px rgba(0,0,0,0.6)",
                color: "#e9e6df",
                display: { xs: "none", md: "flex" },
                alignItems: "center",
                gap: "18px",
                flexWrap: "nowrap",
            }}
        >
            {img && (
                <Box
                    component="img"
                    src={img}
                    alt={c.name}
                    sx={{
                        width: "92px",
                        height: "92px",
                        borderRadius: "50%",
                        objectFit: "cover",
                        border: "3px solid rgba(220,177,88,0.75)",
                        flex: "0 0 auto",
                    }}
                />
            )}
            <Box sx={{ flex: "0 0 auto" }}>
                <Typography sx={{ fontSize: 30, fontWeight: 700, color: "#efe4cc", lineHeight: 1.1 }}>
                    {c.name}
                </Typography>
                <Typography sx={{ fontSize: 17, color: "#7c8290" }}>
                    Level {c.level} · {entry.faction} · {c.size === 2 ? "2×2" : "1×1"}
                </Typography>
                {armyHp > 0 && (
                    <Typography sx={{ fontSize: 15, color: "#8fcd7d" }}>
                        +{c.hp} HP → {armyHp + c.hp} total
                    </Typography>
                )}
            </Box>
            <Box
                sx={{
                    flex: "1 1 auto",
                    minWidth: 0,
                    display: "grid",
                    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                    gridAutoRows: "minmax(38px, 1fr)",
                    gap: "8px",
                }}
            >
                <StatChip icon={<HeartIcon />} label={t("Hit points")} value={`${c.hp}/${c.hp}`} />
                <StatChip
                    icon={<FistIcon />}
                    label={t("Damage")}
                    value={`${c.attack_damage_min} - ${c.attack_damage_max}`}
                />
                <StatChip icon={<SwordIcon />} label={t("Attack")} value={c.attack} />
                <StatChip
                    icon={<ShotRangeIcon />}
                    label={t("Shot distance")}
                    value={isRanged ? c.shot_distance : "—"}
                />
                <StatChip icon={<QuiverIcon />} label={t("Shots")} value={isRanged ? c.range_shots : "—"} />
                <StatChip icon={<ShieldIcon />} label={t("Armor")} value={c.armor} />
                <StatChip icon={<MagicShieldIcon />} label={t("Magic resist")} value={`${c.magic_resist}%`} />
                <StatChip
                    icon={<ArrowShieldIcon />}
                    label={t("Size on the board")}
                    value={c.size === 2 ? "2×2" : "1×1"}
                />
                <StatChip icon={<InitiativeIcon />} label={t("Initiative")} value={c.initiative} />
                <StatChip icon={<BootIcon />} label={t("Movement steps")} value={c.steps} />
            </Box>
            <>
                <Divider orientation="vertical" sx={{ display: { xs: "none", lg: "block" } }} />
                <Box sx={{ flex: "0 0 auto", display: "flex", gap: "8px" }}>
                    {abilities.map((ability, i) => (
                        <Tooltip
                            key={ability ?? `empty-${i}`}
                            title={ability ? abilityDescription(ability) : ""}
                            variant="soft"
                            placement="top"
                        >
                            <Box
                                sx={{
                                    width: "72px",
                                    height: "72px",
                                    borderRadius: "14px",
                                    bgcolor: ability ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.02)",
                                    border: `1px solid ${ability ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.04)"}`,
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    justifyContent: "flex-start",
                                    gap: 0.5,
                                    p: 1,
                                }}
                            >
                                {ability && (
                                    <>
                                        <Box
                                            component="img"
                                            src={images[`${ability.toLowerCase().replace(/\s+/g, "_")}_256`]}
                                            alt=""
                                            sx={{ width: "58%", height: "58%", objectFit: "contain" }}
                                        />
                                        <Typography
                                            sx={{
                                                fontSize: 14,
                                                color: "#9fd0ff",
                                                textAlign: "center",
                                                lineHeight: 1.1,
                                            }}
                                        >
                                            {ability}
                                        </Typography>
                                    </>
                                )}
                            </Box>
                        </Tooltip>
                    ))}
                </Box>
            </>
        </Sheet>
    );
};

// ---- The shared phase frame -----------------------------------------------------------------------
//
// Every draft phase — bundle, the four creature picks, the tier-2 artifact and the augment step — is the
// same page: one gradient background, one 1340px column, a title band of fixed height, the phase's own
// contents, and the step rail at the bottom. Both screens import these so the geometry lives in one place
// and cannot drift apart.

export const DRAFT_COLUMN = "min(1340px, 97vw)";

// The draft is laid out once, at this exact size, and then scaled as a whole to fit the window. Nothing
// re-flows: a bigger window (or fullscreen) only paints more background around the same board, a smaller
// one shrinks the board uniformly instead of growing scrollbars.
export const DRAFT_BOARD_WIDTH = 1340;
// The draft needs enough breathing room for the choice frame, confirmation button and step rail to read as
// separate beats instead of one vertically crowded stack.
export const DRAFT_BOARD_HEIGHT = 880;
const DRAFT_MAX_SCALE = 1.05;

export const draftShellSx = {
    width: "100%",
    height: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    p: 0,
    backgroundColor: "#050504",
    backgroundImage: `url(${images.pick_phase_ember_background_v2})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    color: "#e9e6df",
    overflow: "hidden",
    position: "relative",
    fontFamily: hocDisplayFontFamily,
    // The complete draft surface uses the same carved fantasy face as the sandbox controls. Joy components
    // (buttons, chips and inputs) declare their own font, so target descendants explicitly as well.
    "& *, & *::before, & *::after": {
        fontFamily: `${hocDisplayFontFamily} !important`,
    },
} as const;

/** True while the page is in fullscreen — the toggle button reads this to expand or collapse. */
export const useIsFullscreen = (): boolean => {
    const [isFullscreen, setIsFullscreen] = useState(false);
    useEffect(() => {
        const sync = () => setIsFullscreen(isFullscreenActive());
        sync();
        return onFullscreenChange(sync);
    }, []);
    return isFullscreen;
};

/** The factor the fixed board is drawn at: 1.05 whenever it fits, less on windows too small to hold it. */
export const useDraftScale = (): number => {
    const [scale, setScale] = useState(DRAFT_MAX_SCALE);
    useEffect(() => {
        const fit = () =>
            setScale(
                Math.min(
                    DRAFT_MAX_SCALE,
                    (window.innerWidth - 48) / DRAFT_BOARD_WIDTH,
                    (window.innerHeight - 40) / DRAFT_BOARD_HEIGHT,
                ),
            );
        fit();
        // resize alone is not enough: entering fullscreen resizes the viewport without always firing it, so
        // observe the document element too and re-fit on the fullscreen transition itself.
        window.addEventListener("resize", fit);
        document.addEventListener("fullscreenchange", fit);
        const observer = new ResizeObserver(fit);
        observer.observe(document.documentElement);
        return () => {
            window.removeEventListener("resize", fit);
            document.removeEventListener("fullscreenchange", fit);
            observer.disconnect();
        };
    }, []);
    return scale;
};

/** The board itself: always 1340x880 internally, only its scale reacts to the window. */
export const draftBoardSx = (scale: number) =>
    ({
        position: "relative",
        width: DRAFT_BOARD_WIDTH,
        height: DRAFT_BOARD_HEIGHT,
        flex: "0 0 auto",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "26px",
        transform: `scale(${scale})`,
        transformOrigin: "center center",
        px: "22px",
        py: "12px",
        boxSizing: "border-box",
    }) as const;

// The title always occupies the same band, so the block under it starts on the same line on every phase.
export const DraftTitle: React.FC<{ children: React.ReactNode; subtitle?: React.ReactNode }> = ({
    children,
    subtitle,
}) => (
    <Box
        sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 0.5,
            minHeight: "78px",
            flex: "0 1 auto",
            py: "10px",
        }}
    >
        <Typography
            sx={{
                fontSize: "46px",
                fontWeight: 400,
                letterSpacing: "0.055em",
                lineHeight: 1.1,
                color: "#efe4cc",
                textAlign: "center",
                textTransform: "uppercase",
                textShadow: "0 2px 2px #000, 0 0 14px rgba(210,160,90,.16)",
            }}
        >
            {children}
        </Typography>
        <Box
            sx={{
                width: 520,
                height: 10,
                mt: 0.2,
                background:
                    "linear-gradient(90deg, transparent 0%, rgba(166,112,54,.8) 18%, #c59a62 49%, rgba(166,112,54,.8) 82%, transparent 100%) center/100% 1px no-repeat",
            }}
        />
        {subtitle}
    </Box>
);

// ---- Draft copy, step rail and portrait states ------------------------------------------------

const PERK_ICON: Record<number, string> = Object.fromEntries(
    Perk.PERK_LIST.map((perk) => [perk.id, PERK_COPY[perk.id]?.icon ?? "•"]),
);

const PHASE_HINT: Record<number, string> = {
    [PickPhaseVals.PERK]:
        "Choose your scouting doctrine. It lasts the whole draft and decides which of the opponent's army slots you can watch.",
    [PickPhaseVals.INITIAL_PICK]: "Each bundle gives you two creatures and a Tier-1 artifact. Pick one.",
    [PickPhaseVals.PICK]:
        "Greyed portraits are banned. Opponent picks are hidden — if you pick one they already took, you'll re-pick.",
    [PickPhaseVals.ARTIFACT_2]: "One of three. Both players choose at the same time.",
};

const RULES_URL = "https://heroesofcrypto.io/rules";

const phaseAction = (phase: number, level: number): string => {
    switch (phase) {
        case PickPhaseVals.PERK:
            return t("Pick one doctrine to continue.");
        case PickPhaseVals.INITIAL_PICK:
            return t("Pick one starting bundle.");
        case PickPhaseVals.PICK:
            return level > 0
                ? `Pick one Level ${level} creature for your army.`
                : t("Pick one creature for your army.");
        case PickPhaseVals.ARTIFACT_2:
            return t("Pick one Tier-2 artifact for your whole army.");
        default:
            return "";
    }
};

// The doctrine no longer owns a step of its own — it is answered on the Bundle screen.
const STEP_LABELS = ["Bundle", "Lvl 1", "Lvl 2", "Map reveal", "Lvl 3", "Artifact 2", "Lvl 4", "Augments", "Place"];

const currentStep = (phase: number, level: number): number => {
    switch (phase) {
        case PickPhaseVals.PERK:
        case PickPhaseVals.INITIAL_PICK:
            return 0;
        case PickPhaseVals.ARTIFACT_2:
            return 5;
        case PickPhaseVals.AUGMENTS:
        case PickPhaseVals.AUGMENTS_SCOUT:
            return 7;
        case PickPhaseVals.PICK:
            return level === 4 ? 6 : level === 3 ? 4 : level;
        default:
            return -1;
    }
};

// Who acts on each step, straight from the server's PickPhaseActors: the bundle, the tier-2 artifact and
// the augments are simultaneous; every creature level alternates, and the side that opens each level flips
// (L1 and L3 open on the lower/green side, L2 and L4 on the upper/red one).
type DraftStepOrder = "both" | "lowerFirst" | "upperFirst" | "automatic";

const STEP_ORDER: DraftStepOrder[] = [
    "both", // Bundle
    "lowerFirst", // Lvl 1
    "upperFirst", // Lvl 2
    "automatic", // Map reveal
    "lowerFirst", // Lvl 3
    "both", // Artifact 2
    "upperFirst", // Lvl 4
    "both", // Augments
    "both", // Place
];

const STEP_ORDER_HINT: Record<DraftStepOrder, string> = {
    both: "Both players choose at the same time",
    lowerFirst: "Green (lower) picks first, then red (upper)",
    upperFirst: "Red (upper) picks first, then green (lower)",
    automatic: "Revealed automatically before Level 3",
};

export const DraftStepper: React.FC<{ step: number; userTeam?: TeamType }> = ({ step, userTeam }) => (
    <Box
        sx={{
            display: "flex",
            alignItems: "flex-start",
            gap: 0,
            flexWrap: "nowrap",
            justifyContent: "space-between",
            width: "min(1040px, 88vw)",
        }}
    >
        {STEP_LABELS.map((label, i) => {
            const done = i < step;
            const active = i === step;
            const order = STEP_ORDER[i];
            // "You" / "Opp" is only meaningful once the server has told us which side we are.
            const youFirst =
                userTeam === undefined || order === "both" || order === "automatic"
                    ? undefined
                    : (order === "lowerFirst") === (userTeam === TeamVals.LOWER);
            const marker =
                order === "automatic"
                    ? "✦"
                    : order === "both"
                      ? "⇄"
                      : youFirst === undefined
                        ? "1·2"
                        : youFirst
                          ? "You"
                          : "Opp";
            const markerColor = active
                ? "#241a06"
                : order === "automatic" || order === "both"
                  ? done
                      ? "#8fcd7d"
                      : "#9aa0ab"
                  : youFirst
                    ? "#8fcd7d"
                    : "#ff9d9d";
            return (
                <React.Fragment key={label}>
                    <Tooltip
                        title={`${t(label)} — ${t(STEP_ORDER_HINT[order])}`}
                        variant="soft"
                        placement="top"
                        sx={{ zIndex: 3000 }}
                    >
                        <Box
                            sx={{
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                gap: 0.4,
                                minWidth: 0,
                            }}
                        >
                            <Box
                                sx={{
                                    minWidth: 52,
                                    height: 34,
                                    px: 0.75,
                                    borderRadius: "2px",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: order === "both" || order === "automatic" ? 17 : 13,
                                    fontWeight: 700,
                                    bgcolor: active ? "#d5aa53" : done ? "rgba(45,83,44,0.42)" : "#11100f",
                                    border: `2px solid ${active ? "#f0c66e" : done ? "#6f8e55" : "rgba(174,128,73,0.52)"}`,
                                    color: markerColor,
                                    boxShadow: active
                                        ? "inset 0 0 0 2px rgba(75,42,12,.72), 0 0 11px rgba(222,174,77,.28)"
                                        : "inset 0 0 0 1px rgba(255,220,154,.06), 0 3px 7px rgba(0,0,0,.5)",
                                    clipPath:
                                        "polygon(7px 0, calc(100% - 7px) 0, 100% 7px, 100% calc(100% - 7px), calc(100% - 7px) 100%, 7px 100%, 0 calc(100% - 7px), 0 7px)",
                                }}
                            >
                                {done ? "✓" : marker}
                            </Box>
                            <Typography
                                level="body-xs"
                                sx={{ fontSize: 11.5, color: active ? "#efe4cc" : done ? "#8fcd7d" : "#7c8290" }}
                            >
                                {t(label)}
                            </Typography>
                        </Box>
                    </Tooltip>
                    {i < STEP_LABELS.length - 1 && (
                        <Box
                            sx={{
                                flex: "1 1 auto",
                                minWidth: 10,
                                height: 2,
                                mt: "13px",
                                bgcolor: done ? "#6f8e55" : "rgba(174,128,73,0.42)",
                            }}
                        />
                    )}
                </React.Fragment>
            );
        })}
    </Box>
);

type PortraitState = "available" | "picked" | "taken" | "banned";

// English keys only — resolved through t() at render time. Translating here would freeze the hints at
// whatever language was active when this module first loaded, so a mid-session switch never reached them.
const STATE_HINT: Record<PortraitState, string> = {
    available: "",
    picked: "In your army",
    taken: "Taken by your opponent",
    banned: "Banned",
};

const stateHint = (state: PortraitState): string => (STATE_HINT[state] ? t(STATE_HINT[state]) : "");

// Lucide-style attack-type glyph drawn inline: sword for melee, bow for ranged, open book for casters.
const AttackTypeIcon: React.FC<{ attackType: string }> = ({ attackType }) => {
    const common = {
        width: 18,
        height: 18,
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "#9aa0ab",
        strokeWidth: 2.75,
        strokeLinecap: "round" as const,
        strokeLinejoin: "round" as const,
        "aria-hidden": true,
    };
    if (attackType === "RANGE") {
        return (
            <svg {...common}>
                <path d="M17 3h4v4" />
                <path d="M18.575 11.082a13 13 0 0 1 1.048 9.027 1.17 1.17 0 0 1-1.914.597L14 17" />
                <path d="M7 10 3.29 6.29a1.17 1.17 0 0 1 .6-1.91 13 13 0 0 1 9.03 1.05" />
                <path d="M21 3 3 21" />
            </svg>
        );
    }
    if (attackType === "MAGIC") {
        return (
            <svg {...common}>
                <path d="M12 7v14" />
                <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
            </svg>
        );
    }
    return (
        <svg {...common}>
            <path d="M14.5 17.5 3 6V3h3l11.5 11.5" />
            <path d="M13 19l6-6" />
            <path d="M16 16l4 4" />
            <path d="M19 21l2-2" />
        </svg>
    );
};

const CreaturePortrait: React.FC<{
    creatureId: number;
    state: PortraitState;
    disabled?: boolean;
    size?: number;
    /** Grid tiles stretch to their column instead of using a fixed px size. */
    fill?: boolean;
    /** Name + attack-type glyph under the portrait (pick grid only). */
    caption?: boolean;
    /** Clicked but not yet committed — the commit button carries the confirm now. */
    pending?: boolean;
    onClick?: () => void;
    onInspect?: (creatureId: number) => void;
    onInspectEnd?: () => void;
}> = ({ creatureId, state, disabled, size = 104, fill, caption, pending, onClick, onInspect, onInspectEnd }) => {
    const src = creatureImage(creatureId);
    const selectable = state === "available" && !disabled && !!onClick;
    const ring = pending
        ? "#3B9B5C"
        : state === "picked"
          ? "#3B9B5C"
          : state === "banned" || state === "taken"
            ? "#8a2b2b"
            : "rgba(255,255,255,0.18)";
    const hint = stateHint(state);
    const tip = hint ? `${creatureName(creatureId)} — ${hint}` : creatureName(creatureId);
    const config = creatureFullConfig(creatureId)?.config;
    const portrait = (
        <Tooltip title={tip} variant="soft" placement="top">
            <Box
                onClick={selectable ? onClick : undefined}
                onMouseEnter={() => onInspect?.(creatureId)}
                onMouseLeave={() => onInspectEnd?.()}
                sx={{
                    position: "relative",
                    width: fill ? "auto" : size,
                    height: fill ? "auto" : size,
                    flex: fill ? "1 1 0" : undefined,
                    minHeight: fill ? 0 : undefined,
                    maxWidth: fill ? "100%" : undefined,
                    alignSelf: fill ? "center" : undefined,
                    aspectRatio: fill ? "1" : undefined,
                    borderRadius: fill ? "20px" : "10px",
                    overflow: "hidden",
                    border: `${fill ? 3 : 2}px solid ${ring}`,
                    cursor: selectable ? "pointer" : "default",
                    opacity: state === "available" ? 1 : 0.5,
                    // The unit you are about to confirm pulses a soft green halo.
                    animation: pending
                        ? "hocPendingGlow 1.6s ease-in-out infinite"
                        : state === "picked"
                          ? "hocCommitFlash 620ms ease-out"
                          : "none",
                    "@keyframes hocCommitFlash": {
                        "0%": { boxShadow: "0 0 0 0 rgba(143,205,125,0.9)" },
                        "100%": { boxShadow: "0 0 0 26px rgba(143,205,125,0)" },
                    },
                    "@keyframes hocBanStroke": {
                        "0%": { opacity: 0, transform: "scale(1.35) rotate(-8deg)" },
                        "60%": { opacity: 1 },
                        "100%": { opacity: 1, transform: "scale(1) rotate(0deg)" },
                    },
                    "@keyframes hocPendingGlow": {
                        "0%, 100%": { boxShadow: "0 0 0 0 rgba(59,155,92,0.55), 0 0 10px rgba(59,155,92,0.35)" },
                        "50%": { boxShadow: "0 0 0 6px rgba(59,155,92,0), 0 0 22px rgba(59,155,92,0.75)" },
                    },
                    transition: "transform 120ms ease, box-shadow 120ms ease",
                    "&:hover": selectable
                        ? { transform: "translateY(-3px)", boxShadow: "0 0 14px rgba(120,220,150,0.6)" }
                        : undefined,
                }}
            >
                {src ? (
                    <img
                        src={src}
                        alt={creatureName(creatureId)}
                        style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            filter: state === "banned" || state === "taken" ? "grayscale(1)" : "none",
                        }}
                    />
                ) : (
                    <Typography level="body-xs" sx={{ p: 1 }}>
                        {creatureName(creatureId)}
                    </Typography>
                )}
                {(state === "banned" || state === "taken") && (
                    // Painted red brush stroke across a greyscale portrait (the grayscale filter is applied
                    // on the portrait above) — the same `x_mark_2_512` art the legacy pick/ban boxes use, so
                    // every banned creature reads the same across the draft UI.
                    <img
                        aria-hidden
                        src={images.x_mark_2_512}
                        alt=""
                        style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            width: "100%",
                            height: "100%",
                            objectFit: "contain",
                            pointerEvents: "none",
                            animation: "hocBanStroke 320ms ease-out",
                        }}
                    />
                )}
                {(state === "picked" || pending) && (
                    <Box
                        sx={{
                            position: "absolute",
                            bottom: 2,
                            right: 4,
                            color: "#7CFC9B",
                            fontSize: 22,
                            textShadow: "0 0 4px #000",
                        }}
                    >
                        ✓
                    </Box>
                )}
            </Box>
        </Tooltip>
    );

    if (!caption) {
        return portrait;
    }

    return (
        <Box
            sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 0.75,
                minWidth: 0,
                minHeight: 0,
                width: "100%",
                height: "100%",
                maxWidth: "168px",
            }}
        >
            {portrait}
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0.75, minWidth: 0 }}>
                <Typography
                    level="body-sm"
                    sx={{
                        fontSize: 15,
                        color: state === "available" ? "#e9e6df" : "#7c8290",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                    }}
                >
                    {creatureName(creatureId)}
                </Typography>
                {config && <AttackTypeIcon attackType={config.attack_type} />}
            </Box>
        </Box>
    );
};

// One wide button carries both the commit and the countdown: clicking a card/creature only selects it,
// this button locks it in. On the opponent's turn it turns red and blocks input while the timer keeps
// running; under 15 seconds the digits blink red.
export const PickCommitButton: React.FC<{
    label: string;
    armed: boolean;
    isYourTurn: boolean;
    seconds: number;
    /** Extra read-out between the label and the clock (the augment step shows "spent / budget"). */
    extra?: React.ReactNode;
    /** Gold while a choice is still owed, green once it is complete. */
    tone?: "green" | "gold";
    /**
     * Why the button cannot be pressed yet. A disabled button that simply ignores the click leaves the
     * player guessing, so the press itself answers: the reason pops above the button for a few seconds
     * (and on hover).
     */
    blockedHint?: string;
    onCommit: () => void;
}> = ({ label, armed, isYourTurn, seconds, extra, tone = "green", blockedHint, onCommit }) => {
    const urgent = seconds >= 0 && seconds <= 15;
    const blocked = !armed && !!blockedHint;
    const [hintOpen, setHintOpen] = useState(false);
    useEffect(() => {
        if (!hintOpen) {
            return undefined;
        }
        const timer = setTimeout(() => setHintOpen(false), 2600);
        return () => clearTimeout(timer);
    }, [hintOpen]);
    return (
        <Tooltip
            title={blockedHint ?? ""}
            open={blocked && hintOpen}
            variant="soft"
            color="warning"
            placement="top"
            sx={{ fontSize: 15, fontWeight: 600 }}
        >
            <Box
                component="button"
                type="button"
                // A blocked button stays clickable ON PURPOSE: the click is what surfaces the reason.
                disabled={!armed && !blocked}
                onClick={armed ? onCommit : blocked ? () => setHintOpen(true) : undefined}
                onMouseEnter={blocked ? () => setHintOpen(true) : undefined}
                sx={{
                    // A forged plate rather than a glossy pill: flat slate body, a hairline bevel, and the
                    // tone carried by a lit edge + a soft under-glow instead of a full-bleed gradient. Reads
                    // calmer beside the choice frame and lets the label do the talking.
                    minHeight: 72,
                    width: "min(560px, 84%)",
                    minWidth: "min(560px, 84%)",
                    mt: 0,
                    position: "relative",
                    borderRadius: 0,
                    border: 0,
                    outline: 0,
                    backgroundColor: "transparent",
                    backgroundImage: `linear-gradient(rgba(25,20,13,.22), rgba(5,5,4,.48)), url(${images.ui_start_button_plate_trimmed})`,
                    backgroundSize: "100% 100%",
                    backgroundPosition: "center",
                    backgroundRepeat: "no-repeat",
                    boxShadow: `inset 0 1px 0 rgba(255,224,176,.1), inset 0 -2px 0 rgba(0,0,0,.65), 0 5px 18px rgba(0,0,0,.52), 0 0 18px ${
                        armed ? "rgba(183,132,69,.32)" : "rgba(90,62,34,.16)"
                    }`,
                    color: !isYourTurn ? "#d8aaa3" : "#efe4cc",
                    fontSize: "22px",
                    fontWeight: 700,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    display: "flex",
                    alignItems: "stretch",
                    justifyContent: "center",
                    gap: 0,
                    cursor: armed ? "pointer" : "default",
                    px: 0,
                    overflow: "hidden",
                    transition: "border-color 140ms ease, box-shadow 140ms ease, transform 120ms ease",
                    // Armed = a choice is staged and this press commits it. The whole plate breathes so the
                    // second press is obviously still owed; hovering settles it.
                    animation: armed
                        ? `${tone === "gold" ? "hocCommitPlateGold" : "hocCommitPlate"} 1.5s ease-in-out infinite`
                        : "none",
                    // A thin lit bar along the top edge rides the same beat.
                    "&::before": {
                        content: '""',
                        position: "absolute",
                        left: 14,
                        right: 14,
                        top: 5,
                        height: "2px",
                        borderRadius: "2px",
                        background: !isYourTurn
                            ? "linear-gradient(90deg, transparent, #9c4a40, transparent)"
                            : "linear-gradient(90deg, transparent, #d4a968, transparent)",
                        animation: armed ? "hocCommitBlink 1.6s ease-in-out infinite" : "none",
                    },
                    "&:hover": armed
                        ? {
                              filter: "brightness(1.08) contrast(1.04)",
                              transform: "translateY(-1px)",
                              animation: "none",
                              "&::before": { animation: "none" },
                          }
                        : undefined,
                    "@keyframes hocCommitBlink": {
                        "0%, 100%": { opacity: 1 },
                        "50%": { opacity: 0.3 },
                    },
                    "@keyframes hocCommitPlate": {
                        "0%, 100%": {
                            borderColor: "rgba(150,222,150,0.8)",
                            boxShadow:
                                "inset 0 1px 0 rgba(255,255,255,0.09), inset 0 -1px 0 rgba(0,0,0,0.5), 0 0 22px rgba(90,190,110,0.3)",
                        },
                        "50%": {
                            borderColor: "rgba(178,240,178,0.94)",
                            boxShadow:
                                "inset 0 1px 0 rgba(255,255,255,0.13), inset 0 -1px 0 rgba(0,0,0,0.5), 0 0 30px rgba(120,225,140,0.62)",
                        },
                    },
                    "@keyframes hocCommitPlateGold": {
                        "0%, 100%": {
                            borderColor: "rgba(226,186,110,0.8)",
                            boxShadow:
                                "inset 0 1px 0 rgba(255,255,255,0.09), inset 0 -1px 0 rgba(0,0,0,0.5), 0 0 22px rgba(214,164,74,0.3)",
                        },
                        "50%": {
                            borderColor: "rgba(246,215,150,0.94)",
                            boxShadow:
                                "inset 0 1px 0 rgba(255,255,255,0.13), inset 0 -1px 0 rgba(0,0,0,0.5), 0 0 30px rgba(236,190,100,0.62)",
                        },
                    },
                    "@keyframes hocCommitLabel": {
                        "0%, 100%": { textShadow: "none", letterSpacing: "0.12em" },
                        "50%": { textShadow: "0 0 10px rgba(190,255,190,0.6)", letterSpacing: "0.148em" },
                    },
                    "@keyframes hocTimerBlink": {
                        "0%, 100%": { opacity: 1 },
                        "50%": { opacity: 0.25 },
                    },
                }}
            >
                <Box
                    component="span"
                    sx={{
                        flex: "1 1 auto",
                        display: "grid",
                        placeItems: "center",
                        px: 2.5,
                        textAlign: "center",
                        // The label breathes with the plate — the press it is waiting for is the confirming one.
                        animation: armed ? "hocCommitLabel 1.5s ease-in-out infinite" : "none",
                    }}
                >
                    {label}
                </Box>
                {extra !== undefined && (
                    <Box
                        component="span"
                        sx={{
                            display: "grid",
                            placeItems: "center",
                            px: 2.5,
                            borderLeft: "1px solid rgba(255,255,255,0.14)",
                            bgcolor: "rgba(255,255,255,0.03)",
                            fontVariantNumeric: "tabular-nums",
                        }}
                    >
                        {extra}
                    </Box>
                )}
                {seconds >= 0 && (
                    <Box
                        component="span"
                        sx={{
                            display: "grid",
                            placeItems: "center",
                            px: 2.5,
                            borderLeft: "1px solid rgba(255,255,255,0.14)",
                            bgcolor: "rgba(255,255,255,0.03)",
                            fontVariantNumeric: "tabular-nums",
                            // White while there is time, blinking red for the last 15 seconds.
                            color: urgent ? "#ff3b2f" : "#fff",
                            textShadow: urgent ? "0 0 18px rgba(255,59,47,0.75)" : "none",
                            animation: urgent ? "hocTimerBlink 1s ease-in-out infinite" : "none",
                        }}
                    >
                        {`${Math.floor(Math.max(0, seconds) / 60)}:${String(Math.max(0, seconds) % 60).padStart(2, "0")}`}
                    </Box>
                )}
            </Box>
        </Tooltip>
    );
};

// ---- Stage panels ---------------------------------------------------------

const PerkPanel: React.FC<{ disabled: boolean; selected: number; onSelect: (perkId: number) => void }> = ({
    disabled,
    selected,
    onSelect,
}) => (
    <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", justifyContent: "center" }}>
        {[...Perk.PERK_LIST]
            .sort((a, b) => a.upgradePoints - b.upgradePoints)
            .map((p) => {
                const isSelected = selected === p.id;
                return (
                    <Card
                        key={p.id}
                        variant={isSelected ? "solid" : "outlined"}
                        color={isSelected ? "primary" : "neutral"}
                        sx={{ width: 250, bgcolor: isSelected ? undefined : "rgba(0,0,0,0.35)" }}
                    >
                        <CardContent sx={{ gap: 1, alignItems: "flex-start" }}>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                <Typography level="h4">{PERK_ICON[p.id] ?? "•"}</Typography>
                                <Typography level="title-md">{p.name}</Typography>
                            </Box>
                            <Chip size="sm" color="warning" variant="soft">
                                {p.upgradePoints} upgrade points
                            </Chip>
                            <Typography level="body-sm" sx={{ minHeight: 60 }}>
                                {p.description}
                            </Typography>
                            <Button
                                disabled={disabled}
                                variant={isSelected ? "soft" : "solid"}
                                onClick={() => onSelect(p.id)}
                                sx={{ mt: 0.5 }}
                                fullWidth
                            >
                                {isSelected ? "✓ Chosen" : t("Choose")}
                            </Button>
                        </CardContent>
                    </Card>
                );
            })}
    </Box>
);

const BundlePanel: React.FC<{
    bundles: [number, number, number][];
    disabled: boolean;
    selected: number;
    onSelect: (index: number) => void;
    onInspect?: (creatureId: number) => void;
    onInspectEnd?: () => void;
}> = ({ bundles, disabled, selected, onSelect, onInspect, onInspectEnd }) => (
    <PhasePanel>
        <Box
            sx={{
                width: "100%",
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: "18px",
                height: "100%",
                overflow: "hidden",
                alignItems: "stretch",
                position: "relative",
                "&::after": {
                    content: '""',
                    position: "absolute",
                    zIndex: 12,
                    pointerEvents: "none",
                    top: 3,
                    bottom: 3,
                    left: "50%",
                    width: 62,
                    transform: "translateX(-50%)",
                    backgroundImage: `url(${images.pick_phase_bundle_divider})`,
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "center",
                    backgroundSize: "100% 100%",
                    filter: "brightness(.9) contrast(1.04) drop-shadow(0 0 5px rgba(0,0,0,.9))",
                },
            }}
        >
            {bundles.map((bundle, index) => {
                const [l1, l2, artifactId] = bundle;
                const artifact = Artifact.getTier1ArtifactProperties(artifactId as Artifact.Tier1Artifact);
                const artifactImg = images[artifact.imageKey];
                const isSelected = selected === index;
                return (
                    <Card
                        key={index}
                        variant="outlined"
                        color="neutral"
                        onClick={disabled ? undefined : () => onSelect(index)}
                        sx={{
                            position: "relative",
                            width: "100%",
                            height: "100%",
                            overflow: "hidden",
                            cursor: disabled ? "default" : "pointer",
                            bgcolor: "transparent",
                            border: 0,
                            borderRadius: 0,
                            boxShadow: isSelected ? "inset 0 0 28px rgba(220,177,88,0.08)" : "none",
                            transition: "box-shadow 140ms ease",
                        }}
                    >
                        <CardContent
                            sx={{
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 3,
                                flex: "1 1 auto",
                                minHeight: 0,
                            }}
                        >
                            <Box sx={{ display: "flex", gap: 3, justifyContent: "center" }}>
                                {[
                                    { id: l1, level: 1 },
                                    { id: l2, level: 2 },
                                ].map(({ id, level }) => (
                                    <Box
                                        key={level}
                                        sx={{
                                            display: "flex",
                                            flexDirection: "column",
                                            alignItems: "center",
                                            gap: 0.5,
                                        }}
                                        onMouseEnter={() => onInspect?.(id)}
                                        onMouseLeave={() => onInspectEnd?.()}
                                    >
                                        <Box
                                            component="img"
                                            src={creatureImage(id)}
                                            alt={creatureName(id)}
                                            sx={{
                                                width: "128px",
                                                height: "128px",
                                                borderRadius: "50%",
                                                objectFit: "cover",
                                            }}
                                        />
                                        <Typography sx={{ fontSize: "16px", fontWeight: 700, color: "#e9e6df" }}>
                                            {creatureName(id)}
                                        </Typography>
                                        <Typography sx={{ fontSize: "13px", color: "#7c8290" }}>
                                            Level {level}
                                        </Typography>
                                    </Box>
                                ))}
                            </Box>
                            <Box
                                sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 1.5,
                                    width: "100%",
                                    p: 1.5,
                                    borderRadius: "7px",
                                    background: "linear-gradient(180deg, rgba(30,28,24,.78), rgba(13,12,10,.9))",
                                    border: "2px solid rgba(181,135,73,0.55)",
                                    boxShadow: "inset 0 1px rgba(255,225,175,.06), 0 2px 8px rgba(0,0,0,.38)",
                                }}
                            >
                                {artifactImg && (
                                    <img
                                        src={artifactImg}
                                        alt={artifact.name}
                                        style={{
                                            width: "72px",
                                            height: "72px",
                                            objectFit: "contain",
                                            flex: "0 0 auto",
                                        }}
                                    />
                                )}
                                <Box sx={{ minWidth: 0 }}>
                                    <Typography sx={{ fontSize: 17, fontWeight: 700, color: "#dcb158" }}>
                                        {artifact.name}
                                    </Typography>
                                    <Typography
                                        sx={{
                                            fontSize: 12,
                                            letterSpacing: "0.1em",
                                            textTransform: "uppercase",
                                            color: "#7c8290",
                                        }}
                                    >
                                        Tier-1 artifact
                                    </Typography>
                                    <Typography sx={{ fontSize: "13px", color: "#9aa0ab" }}>
                                        ({Artifact.formatArtifactDescription(artifact)})
                                    </Typography>
                                </Box>
                            </Box>
                        </CardContent>
                    </Card>
                );
            })}
        </Box>
    </PhasePanel>
);

// The frame every phase's choices sit in: same width, padding and border, so switching phases only swaps
// the contents and nothing on screen jumps.
export const PhasePanel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <Box
        sx={{
            position: "relative",
            width: "100%",
            // Exactly the height left over inside the fixed board, so every phase's frame is the same box and
            // its contents shrink to fit instead of scrolling.
            height: "100%",
            minHeight: 0,
            overflow: "hidden",
            p: "18px 14px",
            borderRadius: 0,
            bgcolor: "rgba(5,5,4,0.5)",
            border: 0,
            // The same outer frame used by the sandbox's left command deck. It is painted as an overlay
            // rather than a real border so adding it never steals space from the pick cards or changes the
            // fixed draft geometry. 9-slicing preserves the authored corners while stretching only rails.
            "&::after": {
                content: '""',
                position: "absolute",
                inset: 0,
                zIndex: 10,
                pointerEvents: "none",
                boxSizing: "border-box",
                border: "32px solid transparent",
                borderImageSource: `url(${images.ui_outer_frame_3_9slice})`,
                borderImageSlice: "58",
                borderImageWidth: "32px",
                borderImageRepeat: "stretch",
            },
        }}
    >
        {children}
    </Box>
);

// Draft pools are faction-balanced (4/4/4/4 on L1-L2, 3/3/3/3 on L3-L4) and never contain Death, so the
// grid can give every faction its own column.
const FACTION_ORDER = ["Life", "Nature", "Chaos", "Might"] as const;

const FACTION_COLOR: Record<string, string> = {
    Life: "#e0d3b0",
    Nature: "#aebf92",
    Chaos: "#e0a06a",
    Might: "#9fb6d4",
};

const PickPanel: React.FC<{
    level: number;
    banned: number[];
    picked: number[];
    opponentTaken: number[];
    disabled: boolean;
    pendingId?: number;
    onSelect: (creatureId: number) => void;
    onInspect?: (creatureId: number) => void;
    onInspectEnd?: () => void;
}> = ({ level, banned, picked, opponentTaken, disabled, pendingId, onSelect, onInspect, onInspectEnd }) => {
    const bannedSet = new Set(banned);
    const pickedSet = new Set(picked);
    const takenSet = new Set(opponentTaken);
    const creatures = (level >= 1 ? getCreaturesByLevel(level) : []).filter(
        (creatureId) => creatureFullConfig(creatureId)?.faction !== "Death",
    );
    const byFaction = FACTION_ORDER.map((faction) => ({
        faction,
        ids: creatures.filter((creatureId) => creatureFullConfig(creatureId)?.faction === faction),
    })).filter((group) => group.ids.length > 0);

    // Columns are one faction each (owner call). The pool is 3-5 creatures per faction depending on level,
    // so every column is given the SAME number of rows as the largest one: a short faction then leaves an
    // empty slot at the bottom instead of stretching its portraits taller than its neighbours', which is
    // what makes the four columns read as four columns rather than four different-sized stacks.
    const rowsPerFaction = byFaction.reduce((most, group) => Math.max(most, group.ids.length), 0);

    return (
        <PhasePanel>
            {/* One column per faction. The captions are gone — the pool is faction-balanced and every player
                knows the crests — so the portraits take that room instead. */}
            <Box
                sx={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "stretch",
                    // The panel is far wider than four portrait columns need. Stretching the columns to a
                    // quarter of it each shrinks the portraits to thumbnails and strands the width between
                    // them, so the columns are sized to the art and the leftover space goes to the gutters.
                    gap: "clamp(24px, 6vw, 96px)",
                    height: "100%",
                }}
            >
                {byFaction.map(({ faction, ids }) => (
                    <Box
                        key={faction}
                        sx={{
                            display: "grid",
                            gridTemplateRows: `repeat(${rowsPerFaction}, minmax(0, 1fr))`,
                            gap: "14px",
                            height: "100%",
                            // One square cell per row: the column is exactly as wide as a portrait is tall,
                            // which is what keeps the art at full size no matter how wide the panel gets.
                            aspectRatio: `1 / ${rowsPerFaction}`,
                            minWidth: 0,
                            minHeight: 0,
                            // A column only reads as "this faction" if the eye can group it, and four
                            // unlabelled stacks of portraits cannot do that on their own. A hairline in the
                            // faction's colour and the faintest wash behind it are enough, and cost none of
                            // the vertical room the portraits need.
                            paddingTop: "10px",
                            borderTop: `2px solid ${FACTION_COLOR[faction] ?? "#8a8a8a"}`,
                            borderRadius: "10px 10px 0 0",
                            background: `linear-gradient(180deg, ${FACTION_COLOR[faction] ?? "#8a8a8a"}14 0%, transparent 42%)`,
                        }}
                    >
                        {ids.map((creatureId) => {
                            let state: PortraitState = "available";
                            if (pickedSet.has(creatureId)) state = "picked";
                            else if (bannedSet.has(creatureId)) state = "banned";
                            else if (takenSet.has(creatureId)) state = "taken";
                            return (
                                <CreaturePortrait
                                    key={creatureId}
                                    creatureId={creatureId}
                                    state={state}
                                    disabled={disabled}
                                    fill
                                    caption
                                    pending={pendingId === creatureId}
                                    onClick={() => onSelect(creatureId)}
                                    onInspect={onInspect}
                                    onInspectEnd={onInspectEnd}
                                />
                            );
                        })}
                    </Box>
                ))}
            </Box>
        </PhasePanel>
    );
};

const ArtifactPanel: React.FC<{
    disabled: boolean;
    selected: number;
    offered: number[];
    onSelect: (artifactId: number) => void;
}> = ({ disabled, selected, offered, onSelect }) => {
    // The server offers 3 random Tier-2 artifacts (of 12). Fall back to the full list only if no offer has
    // arrived yet (e.g. a server that predates the offer field), so the picker is never empty.
    const offeredIds = offered.length ? offered : Artifact.TIER2_ARTIFACT_LIST.map((a) => a.id);
    return (
        <PhasePanel>
            <Box
                sx={{
                    width: "100%",
                    display: "grid",
                    gridTemplateColumns: "repeat(3, minmax(0, 340px))",
                    gridTemplateRows: "minmax(0, 1fr)",
                    justifyContent: "center",
                    gap: "20px",
                    height: "100%",
                    minHeight: 0,
                    overflow: "hidden",
                    alignItems: "stretch",
                }}
            >
                {offeredIds.map((id) => {
                    const a = Artifact.getTier2ArtifactProperties(id as Artifact.Tier2Artifact);
                    const isSelected = selected === a.id;
                    // Descriptions differ by a factor of three in length (compare "Increases the army's luck
                    // by 10." with the Lava Striders paragraph). Rather than let the long one push its card's
                    // bottom border out of the frame, the art and the type shrink a notch for it.
                    const descriptionLength = Artifact.formatArtifactDescription(a).length;
                    const wordy = descriptionLength > 96;
                    // The very longest entries (Lava Striders) need one more notch or their last line would
                    // be the thing that gets clipped inside the card.
                    const veryWordy = descriptionLength > 130;
                    return (
                        // No hover affordance here on purpose: the full effect text is already printed on
                        // the card, so a tooltip only repeated it over the artifact art, and the card's own
                        // hover tint fought the gold "selected" border.
                        <React.Fragment key={a.id}>
                            <Card
                                key={id}
                                variant="outlined"
                                color="neutral"
                                onClick={disabled ? undefined : () => onSelect(id)}
                                sx={{
                                    height: "100%",
                                    minHeight: 0,
                                    overflow: "hidden",
                                    cursor: disabled ? "default" : "pointer",
                                    bgcolor: "#12151d",
                                    border: `2px solid ${isSelected ? "#dcb158" : "rgba(255,255,255,0.08)"}`,
                                    borderRadius: "22px",
                                    boxShadow: isSelected ? "0 0 18px rgba(220,177,88,0.35)" : "none",
                                    transition: "none",
                                    "&:hover": {
                                        bgcolor: "#12151d",
                                        borderColor: isSelected ? "#dcb158" : "rgba(255,255,255,0.08)",
                                        boxShadow: isSelected ? "0 0 18px rgba(220,177,88,0.35)" : "none",
                                        transform: "none",
                                    },
                                }}
                            >
                                <CardContent
                                    sx={{
                                        alignItems: "center",
                                        gap: 1,
                                        p: 1.5,
                                        flex: "1 1 auto",
                                        minHeight: 0,
                                        height: "100%",
                                    }}
                                >
                                    {images[a.imageKey] && (
                                        <Box
                                            component="img"
                                            src={images[a.imageKey]}
                                            alt={a.name}
                                            sx={{
                                                width: veryWordy ? "82px" : wordy ? "96px" : "118px",
                                                height: veryWordy ? "82px" : wordy ? "96px" : "118px",
                                                flex: "0 0 auto",
                                                objectFit: "contain",
                                                borderRadius: "12px",
                                            }}
                                        />
                                    )}
                                    <Typography
                                        sx={{ fontSize: wordy ? "20px" : "22px", fontWeight: 700, color: "#dcb158" }}
                                    >
                                        {a.name}
                                    </Typography>
                                    <Typography
                                        sx={{
                                            fontSize: wordy ? 13 : 15,
                                            letterSpacing: "0.12em",
                                            textTransform: "uppercase",
                                            color: "#9aa0ab",
                                        }}
                                    >
                                        Tier-2 artifact
                                    </Typography>
                                    <Box
                                        sx={{
                                            display: "flex",
                                            flexDirection: "column",
                                            gap: 1,
                                            width: "100%",
                                            flex: "1 1 auto",
                                            minHeight: 0,
                                        }}
                                    >
                                        {(() => {
                                            // One box for every artifact, same height on all three cards: the
                                            // caveat sentence rides in parentheses instead of a second panel.
                                            const [head, ...rest] = Artifact.formatArtifactDescription(a)
                                                .split(/(?<=\.)\s+/)
                                                .filter(Boolean);
                                            const text = rest.length ? `${head} (${rest.join(" ")})` : head;
                                            return (
                                                <Box
                                                    sx={{
                                                        p: "10px 14px",
                                                        borderRadius: "16px",
                                                        bgcolor: "rgba(255,255,255,0.05)",
                                                        fontSize: veryWordy ? "12.5px" : wordy ? "13px" : "14px",
                                                        lineHeight: wordy ? 1.35 : 1.45,
                                                        overflow: "hidden",
                                                        color: "#e9e6df",
                                                        // No fixed height: the box takes what the card has
                                                        // left, so the longest artifact still fits and every
                                                        // card ends with the same padding it starts with.
                                                        display: "flex",
                                                        alignItems: "center",
                                                        flex: "1 1 auto",
                                                        minHeight: 0,
                                                        width: "100%",
                                                    }}
                                                >
                                                    {text}
                                                </Box>
                                            );
                                        })()}
                                    </Box>
                                </CardContent>
                            </Card>
                        </React.Fragment>
                    );
                })}
            </Box>
        </PhasePanel>
    );
};

// ---- t("Your army") summary bar ---------------------------------------------

const perkName = (perkId: number): string => Perk.getPerkProperties(perkId as Perk.Perk)?.name ?? "";

// A hairline between the groups a rail carries: doctrine | synergies | the army | artifacts.
const BarDivider: React.FC<{ strong?: boolean }> = ({ strong }) => (
    <Box
        sx={{
            width: "1px",
            alignSelf: "center",
            height: strong ? 30 : 26,
            borderRadius: "1px",
            flex: "0 0 auto",
            bgcolor: strong ? "rgba(255,255,255,0.34)" : "rgba(255,255,255,0.2)",
            mx: 0.35,
        }}
    />
);

// ---- Synergy progress -----------------------------------------------------
//
// The synergy LEVEL climbs automatically while drafting (level 1/2/3 at 2/4/6 units of a faction — the
// same UNITS_TO_SYNERGY_LEVEL ladder the engine applies), but WHICH of the faction's two synergies
// applies is picked later, at the setup stage. So these rail dots track the level under the FACTION
// crest and name both candidates — presuming neither, since the choice hasn't happened yet.
export const synergyLevelForFaction = (picked: number[], faction: string): number => {
    const units = picked.filter((id) => id && creatureFullConfig(id)?.faction === faction).length;
    return Math.min(Math.floor(units / 2), 3);
};

// "Improves movement steps by {} cells" + [2] -> "Improves movement steps by 2 cells".
const describeSynergy = (key: string): string => {
    const template = SYNERGY_NAME_TO_DESCRIPTION[key as keyof typeof SYNERGY_NAME_TO_DESCRIPTION] ?? "";
    const powers = SynergyKeysToPower[key] ?? [];
    let i = 0;
    return template.replace(/\{\}/g, () => String(powers[i++] ?? ""));
};

// Human-readable name of a synergy variant, for the badge tooltip.
const SYNERGY_VARIANT_LABEL: Record<string, string> = {
    "Life:1": "Supply",
    "Life:2": "Morale & luck",
    "Nature:1": "Board units",
    "Nature:2": "Flying armor",
    "Chaos:1": "Movement",
    "Chaos:2": "Break on attack",
    "Might:1": "Aura range",
    "Might:2": "Abilities power",
};

/**
 * The four synergies THIS match fields, one per faction.
 *
 * There is nothing to pick: the variant of each pair is drawn from the game id (the server draws the same
 * one for the fight), so the rails show the actual synergy — its own icon, its own description — from the
 * first screen of the draft, and it levels itself at 2 / 4 / 6 units of that faction.
 */
export const SynergyDots: React.FC<{
    picked: number[];
    tone: "own" | "opponent";
    gameId?: string;
    /** Creature clicked but not yet confirmed — its faction's badge previews the level it would light. */
    pendingId?: number;
}> = ({ picked, tone, gameId, pendingId }) => {
    const variants = synergyVariantsForSeed(gameId ?? "");
    const pendingFaction = pendingId ? creatureFullConfig(pendingId)?.faction : undefined;
    return (
        <Box sx={{ display: "flex", gap: 0.5, flexWrap: "nowrap" }}>
            {FACTION_ORDER.map((faction) => {
                const variant = variants[faction];
                const level = synergyLevelForFaction(picked, faction);
                // The staged creature is counted separately: if confirming it would raise this faction's
                // level, the badge lights up and blinks the level it is ABOUT to reach.
                const previewLevel =
                    pendingFaction === faction && pendingId
                        ? synergyLevelForFaction([...picked, pendingId], faction)
                        : level;
                const previewing = previewLevel > level;
                const shownLevel = previewing ? previewLevel : level;
                const key = `${faction}:${variant}:${shownLevel || 1}`;
                const img = SYNERGY_KEY_TO_IMAGE[key as keyof typeof SYNERGY_KEY_TO_IMAGE];
                const label = t(SYNERGY_VARIANT_LABEL[`${faction}:${variant}`] ?? faction);
                const units = picked.filter((id) => id && creatureFullConfig(id)?.faction === faction).length;
                const tip = previewing
                    ? `Confirming this pick lights ${faction} — ${label} lvl ${previewLevel}: ${describeSynergy(
                          `${faction}:${variant}:${previewLevel}`,
                      )}`
                    : level
                      ? `${faction} — ${label} (lvl ${level}): ${describeSynergy(`${faction}:${variant}:${level}`)}`
                      : `${faction} — ${label}: locked, ${2 - units} more ${faction} unit${units === 1 ? "" : "s"} to reach lvl 1`;
                return (
                    <Tooltip key={faction} title={tip} variant="soft" placement="top">
                        <Box
                            sx={{
                                position: "relative",
                                width: 37,
                                height: 37,
                                borderRadius: "50%",
                                display: "grid",
                                placeItems: "center",
                                flex: "0 0 auto",
                                border: `1px solid ${
                                    shownLevel ? (FACTION_COLOR[faction] ?? "#e9e6df") : "rgba(255,255,255,0.16)"
                                }`,
                                bgcolor: shownLevel ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.02)",
                                opacity: shownLevel ? 1 : 0.4,
                                filter: shownLevel ? "none" : "grayscale(1)",
                                boxShadow: shownLevel
                                    ? `0 0 8px ${tone === "own" ? "rgba(120,220,150,0.35)" : "rgba(226,120,150,0.3)"}`
                                    : "none",
                                transition: "opacity 160ms ease, box-shadow 160ms ease",
                                animation: previewing ? "hocSynergyPreview 1s ease-in-out infinite" : "none",
                                "@keyframes hocSynergyPreview": {
                                    "0%, 100%": {
                                        boxShadow: `0 0 8px ${FACTION_COLOR[faction] ?? "#e9e6df"}55`,
                                        transform: "scale(1)",
                                    },
                                    "50%": {
                                        boxShadow: `0 0 18px ${FACTION_COLOR[faction] ?? "#e9e6df"}cc`,
                                        transform: "scale(1.08)",
                                    },
                                },
                            }}
                        >
                            {img && (
                                <img
                                    src={img}
                                    alt={label}
                                    // Fills the badge right up to its ring: the frame keeps its 1px edge
                                    // and the art takes everything inside it.
                                    style={{
                                        width: "calc(100% - 2px)",
                                        height: "calc(100% - 2px)",
                                        borderRadius: "50%",
                                        objectFit: "cover",
                                    }}
                                />
                            )}
                            {shownLevel > 0 && (
                                <Typography
                                    sx={{
                                        position: "absolute",
                                        right: -3,
                                        bottom: -3,
                                        minWidth: 12,
                                        px: "2px",
                                        borderRadius: "6px",
                                        fontSize: 9,
                                        fontWeight: 700,
                                        lineHeight: "12px",
                                        textAlign: "center",
                                        color: "#0b0d12",
                                        bgcolor: FACTION_COLOR[faction] ?? "#e9e6df",
                                    }}
                                >
                                    {shownLevel}
                                </Typography>
                            )}
                        </Box>
                    </Tooltip>
                );
            })}
        </Box>
    );
};

// Fixed slot layout shown for BOTH armies: [L1, L1, L2, L2, L3, L4]. Mirrors CreaturePoolByLevel = [2,2,1,1]
// and the level-sorted creaturesPicked order the server now maintains, so a slot index maps 1:1 to a level.
const ARMY_LAYOUT: number[] = [1, 1, 2, 2, 3, 4];

// Place picked creature ids into the fixed level layout. Returns an array of length ARMY_LAYOUT.length where each cell
// is either the picked creature id of that level (filled left-to-right within each level) or 0 when empty.
// Empty picks get a level so the caller can render a labelled placeholder.
const placeIntoLevelSlots = (picked: number[]): { id: number; level: number }[] => {
    const valid = picked.filter((id) => id && id !== CreatureVals.NO_CREATURE);
    // Bucket creatures by level, preserving arrival order within a level.
    const byLevel: Record<number, number[]> = { 1: [], 2: [], 3: [], 4: [] };
    for (const id of valid) {
        const lvl = (getCreatureLevel(id) as number) || 0;
        if (lvl >= 1 && lvl <= 4) {
            byLevel[lvl].push(id);
        }
    }
    return ARMY_LAYOUT.map((level) => ({ id: byLevel[level].shift() ?? 0, level }));
};

// Sticky bottom-center summary of the player's own draft so far — chosen doctrine (perk), picked units, and
// picked artifacts. Stays pinned as the draft advances so the player always sees the army they're building.
export const MyDraftBar: React.FC<{
    perk: number;
    picked: number[];
    artifactTier1: number;
    artifactTier2: number;
    onInspect?: (creatureId: number) => void;
    onInspectEnd?: () => void;
    /** Seeds this match's synergy draw — the rails show the four synergies actually in play. */
    gameId?: string;
    /** Creature staged for confirmation, so its synergy can be previewed. */
    pendingId?: number;
}> = ({ perk, picked, artifactTier1, artifactTier2, onInspect, onInspectEnd, gameId, pendingId }) => {
    const t1 = artifactTier1 ? Artifact.getTier1ArtifactProperties(artifactTier1 as Artifact.Tier1Artifact) : undefined;
    const t2 = artifactTier2 ? Artifact.getTier2ArtifactProperties(artifactTier2 as Artifact.Tier2Artifact) : undefined;
    // Fixed 6 slots in level order [L1,L1,L2,L2,L3,L4], filled progressively (mirrors OpponentDraftBar).
    const slots = placeIntoLevelSlots(picked);
    return (
        <Box
            sx={{
                flex: "0 0 auto",
                width: 624,
                display: "flex",
                justifyContent: "center",
            }}
        >
            <Sheet
                variant="soft"
                sx={{
                    position: "relative",
                    pointerEvents: "auto",
                    display: "flex",
                    alignItems: "center",
                    gap: 0.6,
                    px: 0.9,
                    py: 0.25,
                    minHeight: 62,
                    maxWidth: "100%",
                    flexWrap: "nowrap",
                    overflow: "hidden",
                    justifyContent: "center",
                    borderRadius: 0,
                    bgcolor: "#0f2216",
                    border: 0,
                    color: "#e6f5e9",
                    width: "100%",
                    "&::after": {
                        content: '\"\"',
                        position: "absolute",
                        inset: 0,
                        zIndex: 10,
                        pointerEvents: "none",
                        boxSizing: "border-box",
                        border: "16px solid transparent",
                        borderImageSource: `url(${images.ui_container_frame_1_9slice})`,
                        borderImageSlice: "120",
                        borderImageWidth: "16px",
                        borderImageRepeat: "stretch",
                    },
                }}
            >
                {perk > 0 && (
                    <Tooltip title={`Doctrine: ${perkName(perk)}`} variant="soft">
                        <Box
                            sx={{
                                width: 30,
                                height: 30,
                                flex: "0 0 auto",
                                borderRadius: "50%",
                                display: "grid",
                                placeItems: "center",
                                fontSize: 22,
                                lineHeight: 1,
                                overflow: "hidden",
                                bgcolor: "rgba(255,255,255,0.06)",
                                border: "1px solid rgba(220,177,88,0.45)",
                            }}
                        >
                            {PERK_ICON[perk] ?? "•"}
                        </Box>
                    </Tooltip>
                )}
                <BarDivider strong />
                <SynergyDots picked={picked} tone="own" gameId={gameId} pendingId={pendingId} />
                <BarDivider />
                <Box sx={{ display: "flex", gap: 0.75, flexWrap: "nowrap", flex: "0 0 auto" }}>
                    {slots.map((slot, i) => {
                        const id = slot.id;
                        if (id) {
                            const src = creatureImage(id);
                            return (
                                <Tooltip key={`${id}-${i}`} title={creatureName(id)} variant="soft">
                                    <Box
                                        onMouseEnter={() => onInspect?.(id)}
                                        onMouseLeave={() => onInspectEnd?.()}
                                        sx={{
                                            width: 46,
                                            height: 46,
                                            flex: "0 0 auto",
                                            borderRadius: "9px",
                                            overflow: "hidden",
                                            border: "1px solid rgba(120,220,150,0.5)",
                                        }}
                                    >
                                        {src ? (
                                            <img
                                                src={src}
                                                alt={creatureName(id)}
                                                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                            />
                                        ) : (
                                            <Typography level="body-xs" sx={{ p: 0.5 }}>
                                                {creatureName(id)}
                                            </Typography>
                                        )}
                                    </Box>
                                </Tooltip>
                            );
                        }
                        // Empty slot: show the level it will hold, so the layout reads as 6 ordered slots.
                        return (
                            <Tooltip key={`empty-${i}`} title={`Level ${slot.level} slot`} variant="soft">
                                <Box
                                    sx={{
                                        width: 46,
                                        height: 46,
                                        flex: "0 0 auto",
                                        borderRadius: "9px",
                                        display: "grid",
                                        placeItems: "center",
                                        border: "1px dashed rgba(120,220,150,0.35)",
                                        bgcolor: "rgba(120,220,150,0.05)",
                                        color: "rgba(180,230,195,0.55)",
                                        fontSize: 14,
                                        fontWeight: 700,
                                    }}
                                >
                                    L{slot.level}
                                </Box>
                            </Tooltip>
                        );
                    })}
                </Box>
                <BarDivider />
                {/* BOTH artifact slots are always here — the tier-2 one as an empty frame until it is
                    drafted. Rendering it only once picked shifted everything left of it mid-draft. */}
                <Box sx={{ display: "flex", gap: 0.5 }}>
                    {[t1, t2].map((a, tier) => {
                        const img = a ? images[a.imageKey] : undefined;
                        return (
                            <Tooltip
                                key={`artifact-tier-${tier + 1}`}
                                title={
                                    a
                                        ? `${a.name} — ${Artifact.formatArtifactDescription(a)}`
                                        : `Tier-${tier + 1} artifact — not drafted yet`
                                }
                                variant="soft"
                            >
                                <Box
                                    sx={{
                                        width: 32,
                                        height: 32,
                                        flex: "0 0 auto",
                                        borderRadius: "7px",
                                        display: "grid",
                                        placeItems: "center",
                                        border: a
                                            ? "1px solid rgba(245,158,11,0.45)"
                                            : "1px dashed rgba(245,158,11,0.28)",
                                        bgcolor: a ? "rgba(245,158,11,0.08)" : "rgba(245,158,11,0.03)",
                                    }}
                                >
                                    {img && (
                                        <img
                                            src={img}
                                            alt={a?.name ?? ""}
                                            style={{ width: 28, height: 28, objectFit: "contain" }}
                                        />
                                    )}
                                </Box>
                            </Tooltip>
                        );
                    })}
                </Box>
            </Sheet>
        </Box>
    );
};

// ---- Root view ------------------------------------------------------------

interface StainedGlassProps {
    userTeam: TeamType;
    /** This match's id — seeds the per-game synergy draw shown in the rails. */
    gameId?: string;
    opponentLabel?: string;
    height?: number;
    /** Ranked/private games hide the opponent rail while the final augment event hands off to Setup. */
    showOpponentRosterDuringAugmentHandoff?: boolean;
}

// The opponent's army rendered as EXACTLY 6 fixed level-ordered slots [L1,L1,L2,L2,L3,L4]. Each slot shows one
// of three states: a portrait (the opponent has picked there AND your doctrine reveals it), an eye (your
// doctrine watches that slot but the opponent hasn't filled it yet), or a "?" (not revealed by your doctrine).
// `opponentPicked` is a slot-ALIGNED array (length = ARMY_LAYOUT.length): the creature id at each watched slot
// the opponent has filled, and 0 elsewhere — so a creature stays at its true positional slot (a bundle L2 at
// index 2 vs a separately-picked L2 at index 3) instead of being bucket-filled left-to-right. `watchedSlots`
// is the set of slot indices (0..5) your scouting doctrine watches — a watched-but-empty slot shows the eye.
export const OpponentDraftBar: React.FC<{
    opponentPicked: number[];
    opponentLabel: string;
    // Opponent slot indices (0..5) this player's scouting doctrine actually watches — server-authoritative
    // (SSE `ws` / slotsSeen), seeded at doctrine selection: all six for Spymaster, the three tier-block-random
    // slots for Scout, none for Blind Fury.
    watchedSlots: number[];
    onInspect?: (creatureId: number) => void;
    onInspectEnd?: () => void;
    /** Seeds this match's synergy draw — the rails show the four synergies actually in play. */
    gameId?: string;
}> = ({ opponentPicked, watchedSlots, onInspect, onInspectEnd, gameId }) => {
    // Build the 6 fixed level-ordered slots directly from the slot-aligned reveal array (no bucketing), so each
    // creature lands at its real slot index — preserving bundle-vs-picked ordering within a level.
    const slots = ARMY_LAYOUT.map((level, i) => ({ id: opponentPicked[i] ?? 0, level }));
    // The exact slot indices your doctrine watches, straight from the server (NOT the first-N slots): the Scout
    // doctrine watches three tier-block-random slots the server seeded, so the eye lands on the SAME slot the
    // reveal flips — no longer a misleading fixed 1-2-3. A watched-but-not-yet-picked slot shows the eye.
    const watched = new Set(watchedSlots);
    return (
        <Box
            sx={{
                flex: "0 0 auto",
                width: 496,
                display: "flex",
                justifyContent: "center",
            }}
        >
            <Sheet
                variant="soft"
                sx={{
                    position: "relative",
                    pointerEvents: "auto",
                    display: "flex",
                    alignItems: "center",
                    gap: 0.6,
                    px: 0.9,
                    py: 0.25,
                    minHeight: 62,
                    maxWidth: "100%",
                    flexWrap: "nowrap",
                    overflow: "hidden",
                    justifyContent: "center",
                    borderRadius: 0,
                    bgcolor: "#241416",
                    border: 0,
                    width: "100%",
                    color: "#f0e7e9",
                    "&::after": {
                        content: '\"\"',
                        position: "absolute",
                        inset: 0,
                        zIndex: 10,
                        pointerEvents: "none",
                        boxSizing: "border-box",
                        border: "16px solid transparent",
                        borderImageSource: `url(${images.ui_container_frame_1_9slice})`,
                        borderImageSlice: "120",
                        borderImageWidth: "16px",
                        borderImageRepeat: "stretch",
                    },
                }}
            >
                {/* Only the picks your doctrine reveals count — a hidden slot cannot light a synergy. */}
                <SynergyDots picked={opponentPicked} tone="opponent" gameId={gameId} />
                <BarDivider strong />
                <Box sx={{ display: "flex", gap: 0.75, flexWrap: "nowrap", flex: "0 0 auto" }}>
                    {slots.map((slot, i) => {
                        const id = slot.id;
                        const isWatched = watched.has(i);
                        if (id) {
                            // Watched slot the opponent has filled -> reveal the creature portrait.
                            const src = creatureImage(id);
                            return (
                                <Tooltip key={`opp-${id}-${i}`} title={creatureName(id)} variant="soft">
                                    <Box
                                        onMouseEnter={() => onInspect?.(id)}
                                        onMouseLeave={() => onInspectEnd?.()}
                                        sx={{
                                            width: 44,
                                            height: 44,
                                            flex: "0 0 auto",
                                            borderRadius: "9px",
                                            overflow: "hidden",
                                            border: "1px solid rgba(240,120,120,0.6)",
                                        }}
                                    >
                                        {src ? (
                                            <img
                                                src={src}
                                                alt={creatureName(id)}
                                                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                            />
                                        ) : (
                                            <Typography level="body-xs" sx={{ p: 0.5 }}>
                                                {creatureName(id)}
                                            </Typography>
                                        )}
                                    </Box>
                                </Tooltip>
                            );
                        }
                        if (isWatched) {
                            // Watched but not yet picked by the opponent -> eye on this slot.
                            return (
                                <Tooltip
                                    key={`opp-eye-${i}`}
                                    title={`Level ${slot.level} — revealed by your doctrine (flips to the unit once your opponent picks here)`}
                                    variant="soft"
                                >
                                    <Box
                                        sx={{
                                            width: 44,
                                            height: 44,
                                            flex: "0 0 auto",
                                            borderRadius: "9px",
                                            display: "grid",
                                            placeItems: "center",
                                            border: "1px solid rgba(240,180,90,0.55)",
                                            bgcolor: "rgba(240,180,90,0.1)",
                                            color: "rgba(245,205,130,0.95)",
                                            fontSize: 20,
                                        }}
                                    >
                                        👁
                                    </Box>
                                </Tooltip>
                            );
                        }
                        // Not revealed by your doctrine -> face-down slot.
                        return (
                            <Tooltip key={`opp-hidden-${i}`} title={`Level ${slot.level} — hidden`} variant="soft">
                                <Box
                                    sx={{
                                        width: 44,
                                        height: 44,
                                        flex: "0 0 auto",
                                        borderRadius: "9px",
                                        display: "grid",
                                        placeItems: "center",
                                        border: "1px dashed rgba(255,255,255,0.22)",
                                        bgcolor: "rgba(255,255,255,0.04)",
                                        color: "rgba(255,255,255,0.5)",
                                        fontSize: 18,
                                        fontWeight: 700,
                                    }}
                                >
                                    ?
                                </Box>
                            </Tooltip>
                        );
                    })}
                </Box>
            </Sheet>
        </Box>
    );
};

const StainedGlassWindow: React.FC<StainedGlassProps> = ({
    userTeam,
    gameId,
    opponentLabel = t("Opponent"),
    showOpponentRosterDuringAugmentHandoff = true,
}) => {
    // Re-renders the whole draft when the profile's language changes; children use the module t().
    useTranslation();
    const {
        pickPhase,
        isYourTurn,
        secondsRemaining,
        initialBundles,
        tier2Offers,
        requiredLevel,
        banned,
        picked,
        perk,
        upgradePoints,
        artifactTier1,
        artifactTier2,
        opponentPicked,
        watchedSlots,
        mapType,
    } = usePickBanEvents();
    const { perk: sendPerk, pickPair, pick, artifact } = useAuthContext();
    const [busy, setBusy] = useState(false);

    // Pre-game perk auto-commit: when the draft enters the PERK phase and the player hasn't committed
    // a perk yet (perk === 0), immediately commit the one they chose in the lobby (persisted in
    // localStorage). This makes the PERK phase effectively invisible — the player already chose their
    // doctrine before queuing, so the draft skips straight to BUNDLE. Fires once per PERK entry; the
    // server-echoed perk (perk > 0) then locks the panel and the phase advances.
    useEffect(() => {
        if (pickPhase !== PickPhaseVals.PERK || perk !== 0 || busy) {
            return;
        }
        const storedPerk = getPreGamePerk();
        if (storedPerk === Perk.Perk.NO_PERK) {
            return;
        }
        void sendPerk(storedPerk);
        // No setBusy here: sendPerk is a fire-and-forget POST; the panel re-renders locked once the
        // server echoes perk > 0 via the pick-events stream. A transient busy guard isn't needed
        // because perk !== 0 (the guard above) prevents re-entry once committed.
    }, [pickPhase, perk, busy, sendPerk]);
    // Remember what the player chose this phase so the UI can confirm it while the opponent acts.
    const [selection, setSelection] = useState<{ phase: number; value: number } | null>(null);
    // The board is drawn at a fixed 1340x880 and only scaled to fit the window — never re-flowed.
    const draftScale = useDraftScale();
    const isFullscreen = useIsFullscreen();
    // Creature currently hovered anywhere in the draft — its stats + abilities replace the draft title in
    // the reserved header. Clearing on a short delay lets the cursor pass between nearby draft elements
    // without flashing the readout, while still closing it once the cursor is elsewhere.
    const [inspectedId, setInspectedId] = useState<number>(0);
    const inspectTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const cancelInspectEnd = React.useCallback(() => {
        if (inspectTimer.current) {
            clearTimeout(inspectTimer.current);
            inspectTimer.current = null;
        }
    }, []);
    const beginInspect = React.useCallback(
        (creatureId: number) => {
            cancelInspectEnd();
            setInspectedId(creatureId);
        },
        [cancelInspectEnd],
    );
    const endInspect = React.useCallback(() => {
        cancelInspectEnd();
        inspectTimer.current = setTimeout(() => setInspectedId(0), 90);
    }, [cancelInspectEnd]);
    useEffect(() => cancelInspectEnd, [cancelInspectEnd]);
    // Opponent picks are fully hidden by the server. The ONLY way we learn a unit is taken is by picking it
    // and getting a 409 collision back — we remember those locally so they grey out and we don't re-try them.
    const [collided, setCollided] = useState<number[]>([]);
    const [pickError, setPickError] = useState<string>("");
    // Creature the player clicked to pick — opens the confirm modal. The actual pick only fires on Confirm.
    const [pendingPick, setPendingPick] = useState<number>(0);
    const [pendingBundle, setPendingBundle] = useState<number>(-1);
    // Artifact the player clicked to pick — opens the confirm modal. The actual pick only fires on Confirm.
    const [pendingArtifact, setPendingArtifact] = useState<number>(0);

    // Clear the local selection whenever the phase advances.
    useEffect(() => {
        setSelection((prev) => (prev && prev.phase === pickPhase ? prev : null));
        setPickError("");
        setPendingPick(0);
        setPendingArtifact(0);
        // The hovered creature goes with it: the tile under the cursor is gone, so its mouseleave never
        // fires and the stat panel would otherwise hang around for the whole next phase.
        setInspectedId(0);
    }, [pickPhase]);

    const send = async (value: number, fn: () => Promise<void>): Promise<void> => {
        if (busy) return;
        setBusy(true);
        try {
            await fn();
            setSelection({ phase: pickPhase, value });
        } catch (err) {
            console.warn("[pick] action rejected", (err as Error)?.message ?? err);
        } finally {
            setBusy(false);
        }
    };

    // Creature pick: on a collision (409 — the opponent secretly holds this unit) the server does NOT advance
    // the phase, so remember the unit (grey it out) and prompt a re-pick instead of locking in a selection.
    const pickCreature = async (id: number): Promise<void> => {
        if (busy) return;
        setBusy(true);
        setPickError("");
        try {
            await pick(id);
            setSelection({ phase: pickPhase, value: id });
        } catch (err) {
            const status = (err as { response?: { status?: number } })?.response?.status;
            const msg = (err as Error)?.message ?? "";
            if (status === 409 || /already taken|already picked/i.test(msg)) {
                setCollided((prev) => (prev.includes(id) ? prev : [...prev, id]));
                setPickError("Already picked by your opponent — choose another.");
            } else {
                setPickError(msg || t("Pick rejected — choose another."));
            }
        } finally {
            setBusy(false);
        }
    };

    // Summed hit points of everything already drafted, so the hover panel can show what a pick adds.
    const armyHp = picked.reduce((sum, id) => sum + (creatureFullConfig(id)?.config.hp ?? 0), 0);
    const disabled = !isYourTurn || busy;

    // Keyboard: Enter commits whatever is selected on the current step, Escape clears the selection.
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (!isYourTurn || busy) {
                return;
            }
            if (event.key === "Escape") {
                setPendingPick(0);
                setPendingBundle(-1);
                setPendingArtifact(0);
                return;
            }
            if (event.key !== "Enter") {
                return;
            }
            if (pickPhase === PickPhaseVals.PICK && pendingPick > 0) {
                const id = pendingPick;
                setPendingPick(0);
                void pickCreature(id);
            } else if (pickPhase === PickPhaseVals.INITIAL_PICK && pendingBundle >= 0) {
                const index = pendingBundle;
                setPendingBundle(-1);
                void send(index, () => pickPair(index));
            } else if (pickPhase === PickPhaseVals.ARTIFACT_2 && pendingArtifact > 0) {
                const artifactId = pendingArtifact;
                setPendingArtifact(0);
                void send(artifactId, () => artifact(artifactId, 2));
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    });
    const selectedValue = selection && selection.phase === pickPhase ? selection.value : -1;
    const hint = t(PHASE_HINT[pickPhase] ?? "");
    // "Taken" units are the opponent picks we legitimately know about: the ones we've collided on locally
    // (a 409 re-pick) PLUS the ones the server has already revealed to us through our scouting doctrine /
    // reveal perks. Those arrive in `opponentPicked` (the `op` field) — a slot-aligned array carrying the
    // creature id at each watched-and-filled slot and 0 (NO_CREATURE) elsewhere, so we drop the empties.
    // Mirrors getKnownOpponentCreatures() in the pick sim (and the LocalModelDraftOpponent path) so the grid
    // greys out units we already know are gone instead of letting us pick into a guaranteed collision.
    const knownOpponentPicked = opponentPicked.filter((id) => !!id && id !== CreatureVals.NO_CREATURE);
    const opponentTaken = Array.from(new Set([...collided, ...knownOpponentPicked]));
    const isHandoff = isAugmentHandoffPhase(pickPhase);
    // The doctrine step is a pass-through whenever a pre-game perk is stored (the usual case): the client
    // auto-commits it and the server advances. Until that lands there is nothing to choose, so the screen
    // says so instead of flashing the chooser's title, hint and turn chips.
    const isPreparing = pickPhase < 0 || (pickPhase === PickPhaseVals.PERK && getPreGamePerk() !== Perk.Perk.NO_PERK);
    // Phases whose confirm lives in the wide button at the bottom — they drop the header chips, the
    // sub-line and the imperative hint, exactly like the redesign.
    const isCommitPhase =
        pickPhase === PickPhaseVals.PICK ||
        pickPhase === PickPhaseVals.INITIAL_PICK ||
        pickPhase === PickPhaseVals.ARTIFACT_2;
    // PERK is now a doctrine-only phase; the server echoes the player's perk (perk > 0), which survives reload
    // and locks the panel.
    const perkLocked = pickPhase === PickPhaseVals.PERK && perk > 0;
    // INITIAL_PICK is the separate starting-bundle phase; the server echoes the picked bundle (picked.length > 0).
    const bundleLocked = pickPhase === PickPhaseVals.INITIAL_PICK && picked.length > 0;
    // Which bundle was chosen — local index if just picked, else recover it from the picked creatures.
    const bundleChosenIndex = bundleLocked
        ? initialBundles.findIndex((b) => b[0] === picked[0] && b[1] === picked[1])
        : selectedValue;

    let panel: React.ReactNode = <CircularProgress />;
    if (pickPhase < 0) {
        // No phase from the server yet — hold the spinner instead of briefly painting the doctrine step.
        panel = <CircularProgress />;
    } else if (pickPhase === PickPhaseVals.PERK) {
        // Pre-game perk auto-commit: if the player already chose a doctrine in the lobby (persisted),
        // the PERK phase is a brief pass-through — show a spinner while the auto-commit lands and the
        // server advances the phase, instead of flashing the chooser. Only fall back to the manual
        // PerkPanel when there is no pre-game perk to commit (e.g. storage unavailable).
        if (getPreGamePerk() === Perk.Perk.NO_PERK) {
            panel = (
                <PerkPanel
                    disabled={disabled || perkLocked}
                    selected={perkLocked ? perk : selectedValue}
                    onSelect={(id) => void send(id, () => sendPerk(id))}
                />
            );
        }
        // Otherwise panel stays <CircularProgress />: the auto-commit useEffect fires, the server
        // echoes perk > 0, the daemon advances to BUNDLE, and this branch stops rendering.
    } else if (pickPhase === PickPhaseVals.INITIAL_PICK) {
        // Starting-bundle phase: choose one bundle {L1 + L2 + Tier-1 artifact}.
        panel = (
            <BundlePanel
                bundles={initialBundles}
                disabled={disabled || bundleLocked}
                selected={bundleLocked ? bundleChosenIndex : pendingBundle}
                onSelect={(i) => setPendingBundle(i)}
                onInspect={beginInspect}
                onInspectEnd={endInspect}
            />
        );
    } else if (pickPhase === PickPhaseVals.PICK) {
        panel = (
            <Box sx={{ position: "relative", width: "100%", height: "100%", minHeight: 0 }}>
                {pickError && (
                    <Chip
                        size="sm"
                        color="danger"
                        variant="soft"
                        sx={{ position: "absolute", top: -26, left: "50%", transform: "translateX(-50%)" }}
                    >
                        {pickError}
                    </Chip>
                )}
                <PickPanel
                    level={requiredLevel}
                    banned={banned}
                    picked={picked}
                    opponentTaken={opponentTaken}
                    disabled={disabled}
                    pendingId={pendingPick}
                    onSelect={(id) => setPendingPick(id)}
                    onInspect={beginInspect}
                    onInspectEnd={endInspect}
                />
            </Box>
        );
    } else if (pickPhase === PickPhaseVals.ARTIFACT_2) {
        panel = (
            <ArtifactPanel
                disabled={disabled}
                selected={pendingArtifact > 0 ? pendingArtifact : selectedValue}
                offered={tier2Offers}
                onSelect={(id) => setPendingArtifact(id)}
            />
        );
    } else if (isHandoff) {
        panel = (
            <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1.5 }}>
                <CircularProgress />
                <Typography level="title-md">{t("Preparing placement…")}</Typography>
            </Box>
        );
    }

    return (
        <Sheet variant="solid" sx={draftShellSx}>
            {/* One fixed-size board. The shell around it only paints background, so enlarging the window
                (or going fullscreen) adds empty background around this box and never reflows it. */}
            <Box sx={draftBoardSx(draftScale)} onMouseLeave={endInspect}>
                <Tooltip title={t("Open the full How-to-Play guide in a new tab")} variant="soft" placement="left">
                    <Typography
                        component="a"
                        href={RULES_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        level="body-sm"
                        sx={{
                            position: "absolute",
                            top: 12,
                            right: 16,
                            zIndex: 5,
                            color: "#9fd0ff",
                            textDecoration: "none",
                            display: "flex",
                            alignItems: "center",
                            gap: 0.5,
                            fontWeight: 600,
                            "&:hover": { textDecoration: "underline" },
                        }}
                    >
                        📖 Rules
                    </Typography>
                </Tooltip>

                {/* The header reserves the inspector's height even when no unit is hovered. That keeps the
                cards stable under the cursor, and the readout replaces the draft title instead of covering it. */}
                <Box
                    sx={{
                        width: "100%",
                        minHeight: { xs: "78px", md: "158px" },
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                    }}
                    onMouseEnter={cancelInspectEnd}
                    onMouseLeave={endInspect}
                >
                    {inspectedId ? (
                        <>
                            <Box sx={{ display: { xs: "flex", md: "none" }, justifyContent: "center" }}>
                                <DraftTitle
                                    subtitle={
                                        hint && !isCommitPhase && !isPreparing ? (
                                            <Typography
                                                level="body-sm"
                                                sx={{ opacity: 0.7, textAlign: "center", maxWidth: 560 }}
                                            >
                                                {hint}
                                            </Typography>
                                        ) : undefined
                                    }
                                >
                                    {isPreparing ? t("Preparing the draft…") : title(pickPhase, requiredLevel)}
                                </DraftTitle>
                            </Box>
                            <CreatureDetailPanel creatureId={inspectedId} armyHp={armyHp} />
                        </>
                    ) : (
                        <DraftTitle
                            subtitle={
                                hint && !isCommitPhase && !isPreparing ? (
                                    <Typography
                                        level="body-sm"
                                        sx={{ opacity: 0.7, textAlign: "center", maxWidth: 560 }}
                                    >
                                        {hint}
                                    </Typography>
                                ) : undefined
                            }
                        >
                            {isPreparing ? t("Preparing the draft…") : title(pickPhase, requiredLevel)}
                        </DraftTitle>
                    )}
                </Box>

                <Box
                    sx={{
                        display: isCommitPhase || isPreparing ? "none" : "flex",
                        alignItems: "center",
                        gap: 1.5,
                    }}
                >
                    <Chip color={isYourTurn ? "success" : "warning"} variant="soft">
                        {isYourTurn ? t("Your turn") : `${opponentLabel}'s turn`}
                    </Chip>
                    {upgradePoints > 0 && (
                        <Tooltip title="Points you can spend on upgrades before placement" variant="soft">
                            <Chip color="primary" variant="soft">
                                {upgradePoints} upgrade pts
                            </Chip>
                        </Tooltip>
                    )}
                    {secondsRemaining >= 0 && !isHandoff && !isCommitPhase && (
                        <Timer localSeconds={secondsRemaining} isYourTurn={!!isYourTurn} />
                    )}
                </Box>

                {/* Imperative "what to do now" so first-time players always know the expected action. */}
                {isYourTurn &&
                    !isHandoff &&
                    !isCommitPhase &&
                    !isPreparing &&
                    phaseAction(pickPhase, requiredLevel) && (
                        <Typography
                            level="title-sm"
                            sx={{ color: "#7CFC9B", fontWeight: 700, textAlign: "center", mt: -0.5 }}
                        >
                            👉 {phaseAction(pickPhase, requiredLevel)}
                        </Typography>
                    )}

                {pickPhase !== PickPhaseVals.PERK && (
                    <>
                        {/* Both armies sit above the grid by default. Ranked/private callers can suppress the
                            opponent rail during the zero-second augment handoff before private Setup opens. */}
                        <Box
                            sx={{
                                display: "flex",
                                gap: 1.5,
                                width: "100%",
                                justifyContent: "center",
                                alignItems: "center",
                                flexWrap: "nowrap",
                                flex: "0 0 auto",
                            }}
                        >
                            <MyDraftBar
                                perk={perk}
                                picked={picked}
                                artifactTier1={artifactTier1}
                                artifactTier2={artifactTier2}
                                onInspect={beginInspect}
                                onInspectEnd={endInspect}
                                gameId={gameId}
                                pendingId={pendingPick}
                            />
                            {/* Reads t("Map: ?") until the server reveals the map right before the L3 picks, then
                                the name — dead centre between the two armies. */}
                            <Box sx={{ flex: "0 0 auto", display: "flex", justifyContent: "center" }}>
                                <MapBadge mapType={mapType} />
                            </Box>
                            {shouldShowOpponentDraftRail(pickPhase, showOpponentRosterDuringAugmentHandoff) && (
                                <OpponentDraftBar
                                    opponentPicked={opponentPicked}
                                    opponentLabel={opponentLabel}
                                    watchedSlots={watchedSlots}
                                    onInspect={beginInspect}
                                    onInspectEnd={endInspect}
                                    gameId={gameId}
                                />
                            )}
                        </Box>
                    </>
                )}

                {/* Flexible slot for the phase's choice frame. It consumes the remaining board height without
                affecting the reserved header, confirmation action or draft rail. */}
                <Box
                    sx={{
                        position: "relative",
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "stretch",
                        width: "100%",
                        flex: "1 1 auto",
                        minHeight: 0,
                        overflowY: "hidden",
                    }}
                >
                    {userTeam ? panel : null}
                </Box>

                {userTeam && isCommitPhase && pickPhase >= 0 && (
                    <PickCommitButton
                        label={
                            !isYourTurn
                                ? pickPhase === PickPhaseVals.PICK && requiredLevel > 0
                                    ? `Opponent's turn — Lvl ${requiredLevel}`
                                    : t("Opponent's turn")
                                : pickPhase === PickPhaseVals.ARTIFACT_2
                                  ? pendingArtifact > 0
                                      ? `Confirm ${Artifact.getTier2ArtifactProperties(pendingArtifact as Artifact.Tier2Artifact).name}`
                                      : t("Pick an artifact")
                                  : pickPhase === PickPhaseVals.INITIAL_PICK
                                    ? pendingBundle >= 0
                                        ? t("Confirm bundle")
                                        : t("Pick a bundle")
                                    : pendingPick > 0
                                      ? `Confirm ${creatureName(pendingPick)}`
                                      : t("Pick a creature")
                        }
                        armed={
                            !!isYourTurn &&
                            !busy &&
                            (pickPhase === PickPhaseVals.ARTIFACT_2
                                ? pendingArtifact > 0
                                : pickPhase === PickPhaseVals.INITIAL_PICK
                                  ? pendingBundle >= 0 && !bundleLocked
                                  : pendingPick > 0)
                        }
                        isYourTurn={!!isYourTurn}
                        blockedHint={
                            !isYourTurn
                                ? undefined
                                : pickPhase === PickPhaseVals.ARTIFACT_2
                                  ? t("Choose one of the three artifacts first.")
                                  : pickPhase === PickPhaseVals.INITIAL_PICK
                                    ? t("Choose one of the two bundles first.")
                                    : "Choose a creature first — click a portrait, then confirm."
                        }
                        seconds={secondsRemaining}
                        onCommit={() => {
                            if (pickPhase === PickPhaseVals.ARTIFACT_2) {
                                const artifactId = pendingArtifact;
                                setPendingArtifact(0);
                                void send(artifactId, () => artifact(artifactId, 2));
                                return;
                            }
                            if (pickPhase === PickPhaseVals.INITIAL_PICK) {
                                const index = pendingBundle;
                                setPendingBundle(-1);
                                void send(index, () => pickPair(index));
                                return;
                            }
                            const id = pendingPick;
                            setPendingPick(0);
                            void pickCreature(id);
                        }}
                    />
                )}

                {/* Each phase is a simultaneous both-teams choice; show "waiting" while the opponent hasn't acted. */}
                {!isYourTurn && !isHandoff && !isCommitPhase && (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, opacity: 0.7 }}>
                        <CircularProgress size="sm" />
                        <Typography level="body-sm">
                            {selectedValue >= 0
                                ? t("Locked in — waiting for your opponent…")
                                : t("Waiting for your opponent…")}
                        </Typography>
                    </Box>
                )}

                {/* Fires once, right before the L3 picks, the moment the server reveals the map type. */}
                <MapRevealModal mapType={mapType} />

                {/* The rail sits at the bottom of the screen: the step you are on is the screen itself, the rail
                is only there to show how far the draft has come. */}
                <Box sx={{ mt: "auto", pt: 4, width: "100%", display: "flex", justifyContent: "center" }}>
                    <DraftStepper step={currentStep(pickPhase, requiredLevel)} userTeam={userTeam} />
                </Box>
            </Box>
            <Tooltip title={isFullscreen ? t("Exit fullscreen") : t("Fullscreen")} variant="soft" placement="top">
                <Box
                    component="button"
                    type="button"
                    onClick={toggleFullscreen}
                    sx={{
                        position: "fixed",
                        left: "1rem",
                        bottom: "1rem",
                        zIndex: 60,
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        display: "grid",
                        placeItems: "center",
                        cursor: "pointer",
                        color: "#9aa0ab",
                        bgcolor: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.12)",
                        "&:hover": { color: "#efe4cc", bgcolor: "rgba(255,255,255,0.08)" },
                    }}
                >
                    <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                    >
                        {isFullscreen ? (
                            // Inward arrows: pressing it shrinks the page back to the window it came from.
                            <path d="M9 3v3a2 2 0 0 1-2 2H4M15 3v3a2 2 0 0 0 2 2h3M9 21v-3a2 2 0 0 0-2-2H4M15 21v-3a2 2 0 0 1 2-2h3" />
                        ) : (
                            <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />
                        )}
                    </svg>
                </Box>
            </Tooltip>
        </Sheet>
    );
};

const PHASE_NAME: Record<number, string> = {
    [PickPhaseVals.PERK]: t("Choose your doctrine"),
    [PickPhaseVals.INITIAL_PICK]: t("Choose your starting bundle"),
    [PickPhaseVals.PICK]: t("Pick a creature"),
    [PickPhaseVals.ARTIFACT_2]: t("Choose a Tier-2 artifact"),
    [PickPhaseVals.AUGMENTS]: t("Preparing placement…"),
    [PickPhaseVals.AUGMENTS_SCOUT]: t("Preparing placement…"),
};

function title(phase: number, level = 0): string {
    if (phase === PickPhaseVals.PICK && level >= 1) {
        return `Pick a Level ${level} creature`;
    }
    return PHASE_NAME[phase] ?? t("Pick phase");
}

export default StainedGlassWindow;
