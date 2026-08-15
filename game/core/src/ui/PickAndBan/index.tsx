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
import {
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    CircularProgress,
    Divider,
    Sheet,
    Tooltip as JoyTooltip,
    Typography,
} from "@mui/joy";
import React, { useEffect, useState } from "react";

import { images as rawImages } from "../../generated/image_imports";
import { t, tf, useTranslation } from "../../i18n/i18n";
import { isFullscreenActive, onFullscreenChange, toggleFullscreen } from "../fullscreen";
import { getPreGamePerk } from "../../utils/preGamePerk";
import { runDraftSubmission, type DraftCommit } from "./draftSubmission";
import { usePickBanEvents } from "../context/PickBanContext";
import { useAuthContext } from "../auth/context/auth_context";
import { hocDisplayFontFamily } from "../hocTheme";
import { SYNERGY_KEY_TO_IMAGE, SYNERGY_NAME_TO_DESCRIPTION } from "../LeftSideBar/SynergiesConstants";
import { PerkIcon } from "../PerkIcon";
import { UNIT_ID_TO_IMAGE, UNIT_ID_TO_NAME } from "../unit_ui_constants";
import { getPerkCopy } from "../perkCopy";
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
const watchedEyeImage = images.pick_phase_watched_eye;
const draftBackgroundImage = images.pick_phase_ember_background_v2;
const pickCommitFullImage = images.ui_start_button_plate_trimmed;

const DRAFT_TOOLTIP_SX = {
    bgcolor: "#171a1c",
    backgroundImage: "linear-gradient(145deg, rgba(31,34,36,.99), rgba(20,22,23,.99))",
    color: "#e9e3d8",
    fontFamily: hocDisplayFontFamily,
    fontSize: 14,
    lineHeight: 1.4,
    border: "1px solid rgba(211,166,91,.12)",
    borderRadius: "9px",
    boxShadow: "0 8px 22px rgba(0,0,0,.6)",
} as const;

// Every hint on the draft uses the same dark forged tooltip treatment. Keeping the wrapper local to
// this screen also catches plain-string hints (button/artifact/fullscreen), not only rich doctrine copy.
const Tooltip: React.FC<React.ComponentProps<typeof JoyTooltip>> = ({ sx, ...props }) => (
    <JoyTooltip
        {...props}
        color="neutral"
        sx={{ ...DRAFT_TOOLTIP_SX, ...(sx as Record<string, unknown> | undefined) }}
    />
);

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
            <Typography sx={{ fontSize: 19, fontWeight: 700, color: "#efe4cc", whiteSpace: "nowrap" }}>
                {value}
            </Typography>
        </Box>
    </Tooltip>
);

// Top readout showing the currently inspected (hovered) creature's stats + abilities, so players can read
// what a unit does before picking it. The header always reserves its space; revealing it must not shove the
// hovered portrait away from the cursor.
const CreatureDetailPanel: React.FC<{ creatureId: number }> = ({ creatureId }) => {
    if (!creatureId) {
        return null;
    }
    const entry = creatureFullConfig(creatureId);
    if (!entry) {
        return null;
    }
    const c = entry.config;
    // Range-only values are omitted when the creature cannot use them. Showing an em dash made an
    // inapplicable mechanic look like a real zero-valued stat (for example on Berserker).
    const usesShotDistance = c.attack_type === "RANGE" && c.shot_distance > 0;
    const usesShots = c.attack_type === "RANGE" && c.range_shots > 0;
    const img = creatureImage(creatureId);
    const abilities = (c.abilities ?? []).filter(Boolean);
    // A lone passive gets the 108px hero treatment; two use 94px each. Additional passives share this
    // same fixed 260px zone and shrink uniformly instead of widening the panel.
    const abilityCount = Math.max(abilities.length, 1);
    const maxAbilitySlotSize = abilities.length === 1 ? 108 : 94;
    const abilitySlotSize = Math.min(maxAbilitySlotSize, Math.floor((260 - 7 * (abilityCount - 1)) / abilityCount));
    return (
        <Sheet
            variant="soft"
            sx={{
                width: "100%",
                height: 158,
                overflow: "hidden",
                p: "12px 20px",
                borderRadius: "10px",
                backgroundImage:
                    "linear-gradient(rgba(0,0,0,.25), rgba(0,0,0,.25)), linear-gradient(160deg, rgba(30,18,7,.64) 0%, rgba(9,6,2,.70) 100%)",
                border: "1px solid rgba(255,255,255,.18)",
                boxShadow: "0 18px 44px rgba(0,0,0,.6)",
                color: "#efe4cc",
                display: { xs: "none", md: "flex" },
                alignItems: "center",
                gap: "18px",
                flexWrap: "nowrap",
                position: "relative",
            }}
        >
            {img && (
                <Box
                    component="img"
                    src={img}
                    alt={c.name}
                    sx={{
                        width: "92px",
                        height: "124px",
                        borderRadius: "7px",
                        objectFit: "cover",
                        border: "2px solid rgba(255,255,255,.18)",
                        flex: "0 0 auto",
                    }}
                />
            )}
            <Box sx={{ flex: "0 0 168px", width: 168, minWidth: 0 }}>
                <Typography sx={{ fontSize: 30, fontWeight: 700, color: "#efe4cc", lineHeight: 1.1 }}>
                    {c.name}
                </Typography>
                <Typography sx={{ fontSize: 17, color: "#7c8290" }}>
                    Level {c.level} · {entry.faction}
                </Typography>
            </Box>
            <Box
                sx={{
                    flex: "1 1 0",
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
                {usesShotDistance && (
                    <StatChip icon={<ShotRangeIcon />} label={t("Shot distance")} value={c.shot_distance} />
                )}
                {usesShots && <StatChip icon={<QuiverIcon />} label={t("Shots")} value={c.range_shots} />}
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
                <Box
                    sx={{
                        flex: "0 0 260px",
                        width: 260,
                        display: "grid",
                        gridTemplateColumns: `repeat(${abilityCount}, ${abilitySlotSize}px)`,
                        justifyContent: "space-evenly",
                        alignItems: "center",
                        gap: "7px",
                    }}
                >
                    {abilities.map((ability, i) => (
                        <Tooltip
                            key={ability ?? `empty-${i}`}
                            title={ability ? `${ability}: ${abilityDescription(ability)}` : ""}
                            variant="soft"
                            placement="top"
                        >
                            <Box
                                sx={{
                                    minWidth: 0,
                                    width: `${abilitySlotSize}px`,
                                    height: `${abilitySlotSize}px`,
                                    borderRadius: "10px",
                                    bgcolor: ability ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.02)",
                                    border: `1px solid ${ability ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.04)"}`,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    p: 0.75,
                                }}
                            >
                                {ability && (
                                    <>
                                        <Box
                                            component="img"
                                            src={images[`${ability.toLowerCase().replace(/\s+/g, "_")}_256`]}
                                            alt={ability}
                                            sx={{ width: "82%", height: "82%", objectFit: "contain" }}
                                        />
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
export const DRAFT_ZONE_GAP = "26px";
export const DRAFT_HEADER_HEIGHT = { xs: "78px", md: "158px" } as const;
export const DRAFT_ARMIES_HEIGHT = "62px";
const DRAFT_ACTION_HEIGHT = "72px";

export const draftShellSx = {
    width: "100%",
    height: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    p: 0,
    // Share the warm obsidian-and-ember palette used by the fight-results screen so the draft
    // belongs to the same visual family instead of reading as a cooler charcoal surface.
    backgroundColor: "#0b0704",
    backgroundImage: `url(${draftBackgroundImage})`,
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
        gap: DRAFT_ZONE_GAP,
        // Raise the complete draft composition by 3% of the viewport while keeping its internal geometry.
        // The bottom stage rail stays viewport-anchored, giving the composition more breathing room below.
        transform: `translateY(-3vh) scale(${scale})`,
        transformOrigin: "center center",
        px: "22px",
        pt: "12px",
        // The stage rail is fixed to the viewport bottom. Reserve its height plus the same visual breathing
        // room used above the board, so the commit plate always sits clearly above it instead of overlapping.
        pb: "84px",
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
            minHeight: "62px",
            flex: "0 1 auto",
            py: "6px",
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

const STEP_BUTTON_WIDTHS = [90, 78, 78, 112, 78, 112, 78, 106, 82];

export const DraftStepper: React.FC<{ step: number; userTeam?: TeamType }> = ({ step, userTeam }) => (
    <Box
        sx={{
            display: "flex",
            alignItems: "flex-start",
            gap: 0,
            flexWrap: "nowrap",
            justifyContent: "space-between",
            width: "1040px",
            pointerEvents: "auto",
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
            const marker = order === "automatic" ? "✦" : order === "both" ? "⇄" : undefined;
            // Alternating creature-pick steps no longer need a separate You/Opp row. The label itself
            // carries that information: green when the viewer picks first, red when the opponent does.
            const labelColor =
                order === "lowerFirst" || order === "upperFirst"
                    ? youFirst === undefined
                        ? "#d8ccb4"
                        : youFirst
                          ? "#8fcd7d"
                          : "#ff9d9d"
                    : active
                      ? "#c0b7a6"
                      : done
                        ? "#a9d39d"
                        : "#c0b7a6";
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
                                alignItems: "center",
                                minWidth: 0,
                            }}
                        >
                            <Box
                                sx={{
                                    width: STEP_BUTTON_WIDTHS[i],
                                    height: 34,
                                    px: 1.1,
                                    position: "relative",
                                    borderRadius: "10px",
                                    display: "flex",
                                    flexDirection: "row",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    gap: 0.7,
                                    fontWeight: 700,
                                    bgcolor: "transparent",
                                    border: "2px solid rgba(145,104,67,.82)",
                                    color: labelColor,
                                    boxShadow:
                                        "inset 0 0 0 1px rgba(12,9,7,.95), inset 0 0 0 3px rgba(79,68,58,.28), 0 2px 5px rgba(0,0,0,.5)",
                                    isolation: "isolate",
                                    "&::before": {
                                        content: '""',
                                        position: "absolute",
                                        // Keep the active fill inside the ornamental frame instead of letting
                                        // the gold plate bleed underneath its rails.
                                        inset: 2,
                                        borderRadius: "6px",
                                        zIndex: -1,
                                        background: active
                                            ? "rgba(213,170,83,.64)"
                                            : done
                                              ? "rgba(69,72,74,.5)"
                                              : "rgba(17,16,15,.82)",
                                        boxShadow: active ? "0 0 7px rgba(222,174,77,.3)" : "none",
                                    },
                                    "&::after": {
                                        content: '""',
                                        position: "absolute",
                                        inset: 0,
                                        pointerEvents: "none",
                                        borderRadius: "8px",
                                        border: "1px solid rgba(52,44,38,.92)",
                                        boxShadow: "inset 0 1px 0 rgba(224,174,99,.18)",
                                        filter: active ? "brightness(1.25)" : done ? "sepia(.25)" : "brightness(.8)",
                                    },
                                }}
                            >
                                <Typography
                                    component="span"
                                    sx={{
                                        fontSize: 12.2,
                                        fontWeight: 700,
                                        lineHeight: 1,
                                        color: labelColor,
                                        whiteSpace: "nowrap",
                                        letterSpacing: ".02em",
                                        textTransform: "uppercase",
                                    }}
                                >
                                    {t(label)}
                                </Typography>
                                {marker && (
                                    <Box
                                        component="span"
                                        aria-hidden="true"
                                        sx={{
                                            display: "inline-flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            height: "1em",
                                            fontSize: 14,
                                            lineHeight: 1,
                                            color: labelColor,
                                            transform: "translateY(-0.5px)",
                                        }}
                                    >
                                        {marker}
                                    </Box>
                                )}
                            </Box>
                        </Box>
                    </Tooltip>
                    {i < STEP_LABELS.length - 1 && (
                        <Box
                            sx={{
                                flex: "1 1 auto",
                                minWidth: 12,
                                height: 10,
                                mx: "3px",
                                mt: "12px",
                                position: "relative",
                                opacity: done ? 1 : 0.62,
                                filter: done ? "drop-shadow(0 0 3px rgba(224,169,83,.28))" : "none",
                                "&::before": {
                                    content: '""',
                                    position: "absolute",
                                    left: 0,
                                    right: 0,
                                    top: "4px",
                                    height: "3px",
                                    background:
                                        "linear-gradient(180deg, rgba(255,225,157,.92) 0, #c58a35 34%, #704119 66%, rgba(30,17,9,.95) 100%)",
                                    borderRadius: "999px",
                                    boxShadow:
                                        "0 -1px 0 rgba(255,220,145,.18), 0 1px 0 rgba(12,7,4,.9), inset 0 0 0 1px rgba(106,61,24,.42)",
                                },
                                "&::after": {
                                    content: '""',
                                    position: "absolute",
                                    left: "50%",
                                    top: "2px",
                                    width: "5.6px",
                                    height: "5.6px",
                                    transform: "translateX(-50%) rotate(45deg)",
                                    background: done
                                        ? "linear-gradient(135deg, #f4cf77, #8b511f)"
                                        : "linear-gradient(135deg, #b8843e, #442715)",
                                    border: "1px solid rgba(39,21,10,.95)",
                                    boxShadow:
                                        "inset 0 0 0 1px rgba(255,222,145,.32), 0 0 0 1px rgba(171,111,43,.52), 0 1px 3px rgba(0,0,0,.8)",
                                },
                            }}
                        />
                    )}
                </React.Fragment>
            );
        })}
    </Box>
);

/** Fixed draft footer shared by every phase, including the separate augment screen. */
export const DraftBottomControls: React.FC<{
    step: number;
    userTeam?: TeamType;
    draftScale: number;
}> = ({ step, userTeam, draftScale }) => {
    const isFullscreen = useIsFullscreen();
    const fullscreenLabel = isFullscreen ? t("Exit fullscreen") : t("Fullscreen");

    return (
        <>
            <Box
                sx={{
                    position: "fixed",
                    left: "50%",
                    bottom: "1rem",
                    zIndex: 55,
                    width: "1040px",
                    height: "46px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    pointerEvents: "none",
                    transform: `translateX(-50%) scale(${draftScale})`,
                    transformOrigin: "center bottom",
                }}
            >
                <DraftStepper step={step} userTeam={userTeam} />
            </Box>
            <Tooltip title={fullscreenLabel} variant="soft" placement="top">
                <Box
                    component="button"
                    type="button"
                    aria-label={fullscreenLabel}
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
                        color: "#dcb158",
                        bgcolor: "transparent",
                        border: 0,
                        "&:hover": { color: "#f1cf76", bgcolor: "transparent" },
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
                            <path d="M9 3v3a2 2 0 0 1-2 2H4M15 3v3a2 2 0 0 0 2 2h3M9 21v-3a2 2 0 0 0-2-2H4M15 21v-3a2 2 0 0 1 2-2h3" />
                        ) : (
                            <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />
                        )}
                    </svg>
                </Box>
            </Tooltip>
        </>
    );
};

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

const ATTACK_TYPE_ICON_IMAGE: Record<string, string> = {
    RANGE: images.pick_attack_ranged_silver,
    MAGIC: images.pick_attack_magic_silver,
    MELEE: images.pick_attack_melee_silver,
};
const BAN_SLASH_FRAME_COUNT = 14;

// The three matching silver pictograms come from the selected concept set. Muted cards carry the same
// visual weight as their dimmed captions, so a banned creature cannot keep a bright class icon.
const AttackTypeIcon: React.FC<{ attackType: string; muted?: boolean }> = ({ attackType, muted = false }) => (
    <Box
        component="img"
        src={ATTACK_TYPE_ICON_IMAGE[attackType] ?? ATTACK_TYPE_ICON_IMAGE.MELEE}
        alt=""
        aria-hidden
        sx={{
            width: 15,
            height: 15,
            flex: "0 0 auto",
            display: "block",
            alignSelf: "center",
            objectFit: "contain",
            // The glyph artwork carries a little more visual weight below its geometric centre. Lift it by
            // one pixel so sword, bow and book sit on the optical middle of the creature-name lettering.
            transform: "translateY(-1px)",
            opacity: muted ? 0.72 : 0.95,
            filter: muted
                ? "grayscale(1) brightness(.72)"
                : "grayscale(1) brightness(.82) drop-shadow(0 1px 1px rgba(0,0,0,.7))",
        }}
    />
);

const CreaturePortrait: React.FC<{
    creatureId: number;
    state: PortraitState;
    disabled?: boolean;
    size?: number;
    /** Optional portrait height for the tall cropped cards used by bundle and pick layouts. */
    portraitHeight?: number;
    /** Grid tiles stretch to their column instead of using a fixed px size. */
    fill?: boolean;
    /** Name + attack-type glyph under the portrait (pick grid only). */
    caption?: boolean;
    /** Size the whole tile from its row height so space-evenly can equalise outer and inner gutters. */
    evenlySpaced?: boolean;
    /** Clicked but not yet committed — the commit button carries the confirm now. */
    pending?: boolean;
    onClick?: () => void;
    onInspect?: (creatureId: number) => void;
    onInspectEnd?: () => void;
}> = ({
    creatureId,
    state,
    disabled,
    size = 104,
    portraitHeight,
    fill,
    caption,
    evenlySpaced,
    pending,
    onClick,
    onInspect,
    onInspectEnd,
}) => {
    const src = creatureImage(creatureId);
    const selectable = state === "available" && !disabled && !!onClick;
    const ring = pending ? "#3B9B5C" : state === "picked" ? "#3B9B5C" : "rgba(255,255,255,0.18)";
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
                    // Pick-stage cells consume their complete equal grid slot. The artwork itself keeps its
                    // proportions through object-fit: cover while the surrounding card closes every gutter.
                    // Container units let both 8×2 and 6×2 pools grow to the largest size that fits their
                    // cell without ever breaking the 190:256 bundle-card ratio.
                    width: fill
                        ? caption
                            ? "min(100cqw, calc((100cqh - 26px) * 190 / 256))"
                            : "min(100cqw, calc(100cqh * 190 / 256))"
                        : size,
                    height: fill ? "auto" : (portraitHeight ?? size),
                    aspectRatio: fill ? "190 / 256" : undefined,
                    flex: fill ? "0 0 auto" : undefined,
                    maxWidth: fill ? "100%" : undefined,
                    maxHeight: fill ? "100%" : undefined,
                    alignSelf: fill ? "center" : undefined,
                    borderRadius: "10px",
                    overflow: "hidden",
                    border: `2px solid ${ring}`,
                    cursor: selectable ? "pointer" : "default",
                    opacity: 1,
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
                    "@keyframes hocBanSlashCut": {
                        "0%": { backgroundPosition: "0% 0" },
                        "100%": { backgroundPosition: "100% 0" },
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
                            // Creature art is authored in square/circular medallions. Zoom it into the tall
                            // pick frame so the artwork reaches every inner edge instead of floating in it.
                            transform: fill ? "scale(1.18)" : undefined,
                            filter: state === "banned" || state === "taken" ? "grayscale(1)" : "none",
                            opacity: state === "available" ? 1 : 0.5,
                        }}
                    />
                ) : (
                    <Typography level="body-xs" sx={{ p: 1 }}>
                        {creatureName(creatureId)}
                    </Typography>
                )}
                {(state === "banned" || state === "taken") && (
                    // Variant 2 is authored as fourteen top-to-bottom sprite frames. The same overlay mounts
                    // for initial bans and for a newly learned 409 collision, so both events visibly cut the
                    // portrait open instead of fading in a static paint mark.
                    <Box
                        aria-hidden
                        sx={{
                            position: "absolute",
                            inset: 0,
                            zIndex: 2,
                            pointerEvents: "none",
                            borderRadius: "8px",
                            backgroundImage: `url(${images.pick_ban_slash_variant2_atlas})`,
                            backgroundRepeat: "no-repeat",
                            backgroundSize: `${BAN_SLASH_FRAME_COUNT * 100}% 100%`,
                            backgroundPosition: "0% 0",
                            animation: `hocBanSlashCut 580ms steps(${BAN_SLASH_FRAME_COUNT - 1}, end) forwards`,
                            willChange: "background-position",
                            "@media (prefers-reduced-motion: reduce)": {
                                animation: "none",
                                backgroundPosition: "100% 0",
                            },
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

    if (!caption && !fill) {
        return portrait;
    }

    return (
        <Box
            sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 0,
                minWidth: 0,
                minHeight: 0,
                width: evenlySpaced ? "auto" : "100%",
                height: "100%",
                aspectRatio: evenlySpaced ? "190 / 282" : undefined,
                containerType: fill ? "size" : undefined,
                maxWidth: fill ? "none" : "168px",
                justifyContent: fill ? "center" : undefined,
            }}
        >
            {portrait}
            {caption && (
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0.35, minWidth: 0 }}>
                    <Typography
                        level="body-sm"
                        sx={{
                            fontSize: 15,
                            lineHeight: "20px",
                            color: state === "available" ? "#efe4cc" : "#7c8290",
                            textTransform: "uppercase",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                        }}
                    >
                        {creatureName(creatureId)}
                    </Typography>
                    {config && <AttackTypeIcon attackType={config.attack_type} muted={state !== "available"} />}
                </Box>
            )}
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
    submissionKey?: number | string;
    onCommit: DraftCommit;
}> = ({ label, armed, isYourTurn, seconds, extra, tone = "green", blockedHint, submissionKey, onCommit }) => {
    const urgent = seconds >= 0 && seconds <= 15;
    // Lock the plate immediately after confirmation instead of waiting for the server round-trip. This
    // also lets the static preview demonstrate the same waiting state as a live simultaneous draft.
    const [submitted, setSubmitted] = useState(false);
    const waiting = !isYourTurn || submitted;
    const effectiveArmed = armed && !waiting;
    const blocked = !waiting && !effectiveArmed && !!blockedHint;
    const [hintOpen, setHintOpen] = useState(false);
    useEffect(() => {
        if (isYourTurn) {
            setSubmitted(false);
        }
    }, [isYourTurn, submissionKey]);
    useEffect(() => {
        if (!hintOpen) {
            return undefined;
        }
        const timer = setTimeout(() => setHintOpen(false), 2600);
        return () => clearTimeout(timer);
    }, [hintOpen]);
    return (
        <Tooltip
            title={blocked ? (blockedHint ?? "") : ""}
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
                disabled={!effectiveArmed && !blocked}
                onClick={
                    effectiveArmed
                        ? () => {
                              setSubmitted(true);
                              void runDraftSubmission(onCommit).then((accepted) => {
                                  if (!accepted) setSubmitted(false);
                              });
                          }
                        : blocked
                          ? () => setHintOpen(true)
                          : undefined
                }
                onMouseEnter={blocked ? () => setHintOpen(true) : undefined}
                sx={{
                    // A forged plate rather than a glossy pill: flat slate body, a hairline bevel, and the
                    // tone carried by a lit edge + a soft under-glow instead of a full-bleed gradient. Reads
                    // calmer beside the choice frame and lets the label do the talking.
                    height: DRAFT_ACTION_HEIGHT,
                    minHeight: DRAFT_ACTION_HEIGHT,
                    maxHeight: DRAFT_ACTION_HEIGHT,
                    flex: "0 0 auto",
                    width: "min(560px, 84%)",
                    minWidth: "min(560px, 84%)",
                    mt: 0,
                    position: "relative",
                    // After the board is raised, place the action plate in the visual midpoint between
                    // the bundle cards and the fixed phase rail. This keeps both vertical gaps balanced.
                    transform: "translateY(3vh)",
                    borderRadius: "10px",
                    boxSizing: "border-box",
                    border: waiting ? "1.3px solid rgba(174,58,48,.94)" : "1.3px solid rgba(255,255,255,.18)",
                    outline: 0,
                    backgroundColor: "transparent",
                    backgroundImage: waiting
                        ? `linear-gradient(rgba(92,5,7,.62), rgba(38,2,3,.72)), url(${pickCommitFullImage})`
                        : "linear-gradient(rgba(2,3,3,.34), rgba(1,1,1,.4))",
                    backgroundSize: "100% 100%",
                    backgroundPosition: "center",
                    backgroundRepeat: "no-repeat",
                    backgroundBlendMode: "normal",
                    boxShadow: waiting
                        ? "inset 0 0 0 1.3px rgba(241,103,88,.22), inset 0 0 22px rgba(119,7,8,.34), 0 5px 18px rgba(0,0,0,.52), 0 0 24px rgba(199,40,34,.42)"
                        : effectiveArmed
                          ? "inset 0 0 0 1.3px rgba(203,190,163,.1), 0 5px 18px rgba(0,0,0,.58), 0 0 16px rgba(151,129,91,.2)"
                          : "inset 0 0 0 1px rgba(255,255,255,.06), 0 5px 18px rgba(0,0,0,.58), 0 0 0 1px rgba(203,181,137,.12), 0 0 22px rgba(203,181,137,.34)",
                    color: waiting ? "#ffd0c8" : "#c0b7a6",
                    fontSize: "23.5px",
                    fontWeight: 700,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    display: "flex",
                    alignItems: "stretch",
                    justifyContent: "center",
                    // The three fields form one continuous plate. A flex gap exposed the underlying image
                    // between the augment counter and clock as a differently coloured vertical strip.
                    gap: 0,
                    cursor: effectiveArmed ? "pointer" : "default",
                    px: 0,
                    overflow: "visible",
                    transition: "border-color 140ms ease, box-shadow 140ms ease, transform 120ms ease",
                    // Use the exact leather field painted over NEW BATTLE: its faint diagonal bands are
                    // a CSS layer, not part of the plate bitmap. Keeping it separate preserves their
                    // sharpness at every draft scale.
                    "&::before": {
                        content: '\"\"',
                        position: "absolute",
                        inset: "4px",
                        zIndex: 1,
                        pointerEvents: "none",
                        borderRadius: "5px",
                        // Keep the forged perimeter untouched; only the leather field is 7pp more transparent.
                        opacity: 0.13,
                        background: waiting
                            ? "linear-gradient(115deg, rgba(88,5,7,.88), rgba(48,3,4,.72), rgba(19,1,2,.9)), repeating-linear-gradient(14deg, rgba(255,255,255,.018) 0 1px, rgba(0,0,0,.08) 1px 3px), #160102"
                            : "linear-gradient(115deg, rgba(3,4,4,.92), rgba(12,12,11,.72), rgba(1,2,2,.94)), repeating-linear-gradient(14deg, rgba(255,255,255,.014) 0 1px, rgba(0,0,0,.075) 1px 3px), #020303",
                        WebkitMask: waiting
                            ? "none"
                            : "linear-gradient(90deg, #000 0 calc(78.5% - 3px), transparent calc(78.5% - 3px) calc(78.5% + 3px), #000 calc(78.5% + 3px) 100%)",
                        mask: waiting
                            ? "none"
                            : "linear-gradient(90deg, #000 0 calc(78.5% - 3px), transparent calc(78.5% - 3px) calc(78.5% + 3px), #000 calc(78.5% + 3px) 100%)",
                    },
                    // Match the extra bronze perimeter used by the fight-results action buttons. The
                    // plate remains the full background, while this masked copy only reinforces its
                    // outer ring so the frame keeps its weight after the draft board is scaled.
                    "&::after": {
                        content: '\"\"',
                        position: "absolute",
                        inset: 0,
                        zIndex: 3,
                        p: "5.2px",
                        pointerEvents: "none",
                        backgroundImage: `url(${pickCommitFullImage})`,
                        backgroundRepeat: "no-repeat",
                        backgroundPosition: "center",
                        backgroundSize: "100% 100%",
                        opacity: 0.68,
                        filter: waiting ? "none" : "grayscale(.72) brightness(.38) saturate(.24)",
                        WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
                        WebkitMaskComposite: "xor",
                        maskComposite: "exclude",
                    },
                    // Armed = a choice is staged and this press commits it. The whole plate breathes so the
                    // second press is obviously still owed; hovering settles it.
                    animation: waiting
                        ? "hocCommitWaiting 1.35s ease-in-out infinite"
                        : effectiveArmed
                          ? `${tone === "gold" ? "hocCommitPlateGold" : "hocCommitPlate"} 1.5s ease-in-out infinite`
                          : "none",
                    "&:hover": effectiveArmed
                        ? {
                              borderColor: "rgba(178,240,178,.92)",
                              outline: "1px solid rgba(139,232,155,.38)",
                              outlineOffset: "4px",
                          }
                        : undefined,
                    "&:hover::after": effectiveArmed
                        ? {
                              boxShadow:
                                  "0 0 12px rgba(120,225,140,.66), 0 0 38px rgba(120,225,140,.56), inset 0 0 12px rgba(120,225,140,.2)",
                          }
                        : undefined,
                    "&:active": effectiveArmed
                        ? {
                              transform: "translateY(3vh) scale(.94)",
                              filter: "brightness(.88) contrast(1.08)",
                              boxShadow:
                                  "inset 0 4px 12px rgba(0,0,0,.72), inset 0 0 0 1.3px rgba(211,151,93,.2), 0 2px 7px rgba(0,0,0,.56)",
                              animation: "none",
                          }
                        : undefined,
                    "@keyframes hocCommitBlink": {
                        "0%, 100%": { opacity: 1 },
                        "50%": { opacity: 0.3 },
                    },
                    "@keyframes hocCommitPlate": {
                        "0%, 100%": {
                            transform: "translateY(3vh) scale(1)",
                            filter: "brightness(1)",
                            borderColor: "rgba(150,222,150,0.8)",
                            boxShadow:
                                "inset 0 1px 0 rgba(255,255,255,0.09), inset 0 -1px 0 rgba(0,0,0,0.5), 0 0 14px rgba(90,190,110,0.2)",
                        },
                        "50%": {
                            transform: "translateY(3vh) scale(1.012)",
                            filter: "brightness(1.039)",
                            borderColor: "rgba(178,240,178,0.94)",
                            boxShadow:
                                "inset 0 1px 0 rgba(255,255,255,0.11), inset 0 -1px 0 rgba(0,0,0,0.5), 0 0 20px rgba(120,225,140,0.4)",
                        },
                    },
                    "@keyframes hocCommitPlateGold": {
                        "0%, 100%": {
                            transform: "translateY(3vh) scale(1)",
                            filter: "brightness(1)",
                            borderColor: "rgba(132,116,91,.84)",
                            boxShadow:
                                "inset 0 1px 0 rgba(255,255,255,.07), inset 0 -1px 0 rgba(0,0,0,.58), 0 0 16px rgba(145,121,78,.16)",
                        },
                        "50%": {
                            transform: "translateY(3vh) scale(1.012)",
                            filter: "brightness(1.06)",
                            borderColor: "rgba(177,156,119,.94)",
                            boxShadow:
                                "inset 0 1px 0 rgba(255,255,255,.1), inset 0 -1px 0 rgba(0,0,0,.58), 0 0 22px rgba(166,139,91,.26)",
                        },
                    },
                    "@keyframes hocCommitWaiting": {
                        "0%, 100%": {
                            borderColor: "rgba(165,48,42,.84)",
                            boxShadow:
                                "inset 0 0 0 1.3px rgba(241,103,88,.18), inset 0 0 18px rgba(119,7,8,.26), 0 5px 18px rgba(0,0,0,.52), 0 0 18px rgba(181,31,28,.28)",
                        },
                        "50%": {
                            borderColor: "rgba(238,91,77,.98)",
                            boxShadow:
                                "inset 0 0 0 1.3px rgba(255,143,126,.32), inset 0 0 26px rgba(159,11,12,.42), 0 5px 18px rgba(0,0,0,.52), 0 0 32px rgba(225,49,42,.58)",
                        },
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
                        whiteSpace: "nowrap",
                        position: "relative",
                        zIndex: 2,
                    }}
                >
                    {waiting ? t("WAITING OPPONENT") : label}
                </Box>
                {extra !== undefined && (
                    <Box
                        component="span"
                        sx={{
                            position: "relative",
                            width: "18.5%",
                            flex: "0 0 18.5%",
                            display: "grid",
                            placeItems: "center",
                            px: 2.5,
                            borderLeft: 0,
                            bgcolor: "rgba(255,255,255,0.03)",
                            fontVariantNumeric: "tabular-nums",
                            zIndex: 2,
                            "&::before": {
                                content: '\"\"',
                                position: "absolute",
                                left: 0,
                                top: "7%",
                                bottom: "7%",
                                width: "2px",
                                borderRadius: "2px",
                                background: waiting
                                    ? "linear-gradient(90deg, rgba(105,19,18,.92) 0 36%, rgba(198,62,53,.66) 36% 64%, rgba(105,19,18,.92) 64% 100%)"
                                    : "linear-gradient(90deg, rgba(5,5,5,.94) 0 38%, rgba(190,184,171,.3) 38% 62%, rgba(10,10,9,.94) 62% 100%)",
                                boxShadow: waiting
                                    ? "-1px 0 rgba(123,28,25,.46), 1px 0 rgba(244,102,88,.14)"
                                    : "-1px 0 rgba(0,0,0,.78), 1px 0 rgba(255,255,255,.055)",
                                // Keep the separator itself rigid while the armed plate breathes.
                                animation: "none",
                                transition: "none",
                            },
                        }}
                    >
                        {extra}
                    </Box>
                )}
                {seconds >= 0 && (
                    <Box
                        component="span"
                        sx={{
                            position: "relative",
                            width: "21.5%",
                            flex: "0 0 21.5%",
                            display: "grid",
                            placeItems: "center",
                            px: 1.5,
                            borderLeft: 0,
                            background: waiting
                                ? "linear-gradient(90deg, rgba(151,34,29,.12), transparent 34%)"
                                : "linear-gradient(90deg, rgba(198,167,112,.035), transparent 34%)",
                            fontVariantNumeric: "tabular-nums",
                            zIndex: 2,
                            "&::before": {
                                content: '""',
                                position: "absolute",
                                left: 0,
                                top: "7%",
                                bottom: "7%",
                                width: "2px",
                                borderRadius: "2px",
                                background: waiting
                                    ? "linear-gradient(90deg, rgba(105,19,18,.92) 0 36%, rgba(198,62,53,.66) 36% 64%, rgba(105,19,18,.92) 64% 100%)"
                                    : "linear-gradient(90deg, rgba(5,5,5,.94) 0 38%, rgba(190,184,171,.3) 38% 62%, rgba(10,10,9,.94) 62% 100%)",
                                boxShadow: waiting
                                    ? "-1px 0 rgba(123,28,25,.46), 1px 0 rgba(244,102,88,.14)"
                                    : "-1px 0 rgba(0,0,0,.78), 1px 0 rgba(255,255,255,.055)",
                                animation: "none",
                                transition: "none",
                            },
                            // White while there is time, blinking red for the last 15 seconds.
                            color: urgent ? "#ff3b2f" : "#c0b7a6",
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
                                <Box
                                    sx={{
                                        width: 70,
                                        height: 70,
                                        flex: "0 0 70px",
                                        borderRadius: "50%",
                                        overflow: "hidden",
                                        boxShadow: "0 0 0 1px rgba(194,151,84,.52), 0 3px 10px rgba(0,0,0,.55)",
                                    }}
                                >
                                    <PerkIcon perkId={p.id} />
                                </Box>
                                <Typography level="title-md">{t(p.name)}</Typography>
                            </Box>
                            <Chip size="sm" color="warning" variant="soft">
                                {tf("{count} upgrade points", { count: p.upgradePoints })}
                            </Chip>
                            <Typography level="body-sm" sx={{ minHeight: 60 }}>
                                {t(p.description)}
                            </Typography>
                            <Button
                                disabled={disabled}
                                variant={isSelected ? "soft" : "solid"}
                                onClick={() => onSelect(p.id)}
                                sx={{ mt: 0.5 }}
                                fullWidth
                            >
                                {isSelected ? `✓ ${t("Chosen")}` : t("Choose")}
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
    locked: boolean;
    selected: number;
    onSelect: (index: number) => void;
    onInspect?: (creatureId: number) => void;
    onInspectEnd?: () => void;
}> = ({ bundles, disabled, locked, selected, onSelect, onInspect, onInspectEnd }) => (
    <PhasePanel>
        <Box
            sx={{
                width: "100%",
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: "18px",
                height: "100%",
                overflow: "visible",
                alignItems: "stretch",
                position: "relative",
            }}
        >
            {bundles.map((bundle, index) => {
                const [l1, l2, artifactId] = bundle;
                const artifact = Artifact.getTier1ArtifactProperties(artifactId as Artifact.Tier1Artifact);
                const artifactImg = images[artifact.imageKey];
                const isSelected = selected === index;
                const isInactive = locked && !isSelected;
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
                            cursor: disabled || locked ? "default" : "pointer",
                            bgcolor: "transparent",
                            border: isSelected ? "2px solid rgba(205,151,82,.96)" : "2px solid rgba(145,104,67,.82)",
                            borderRadius: "14px",
                            opacity: isInactive ? 0.48 : 1,
                            filter: isInactive ? "grayscale(.58) brightness(.68)" : "none",
                            boxShadow: isSelected
                                ? "inset 0 0 0 1px rgba(17,11,6,.98), inset 0 0 0 3px rgba(134,91,49,.42), inset 0 0 24px rgba(221,166,75,.14), 0 0 0 1px rgba(222,176,91,.2), 0 0 13px rgba(222,176,91,.42), 0 3px 8px rgba(0,0,0,.58)"
                                : "inset 0 0 0 1px rgba(12,9,7,.95), inset 0 0 0 3px rgba(79,68,58,.32), 0 3px 8px rgba(0,0,0,.58)",
                            pointerEvents: isInactive ? "none" : "auto",
                            transition:
                                "box-shadow 160ms ease, border-color 160ms ease, opacity 160ms ease, filter 160ms ease",
                            "&:hover":
                                disabled || locked || (selected >= 0 && !isSelected)
                                    ? undefined
                                    : {
                                          zIndex: isSelected ? 5 : 1,
                                          borderColor: "rgba(205,151,82,.96)",
                                          boxShadow:
                                              "inset 0 0 0 1px rgba(17,11,6,.98), inset 0 0 0 3px rgba(134,91,49,.42), inset 0 0 18px rgba(221,166,75,.14), 0 0 0 1px rgba(222,176,91,.18), 0 0 12px rgba(205,151,82,.36), 0 3px 8px rgba(0,0,0,.58)",
                                      },
                            "&::before": {
                                content: '\"\"',
                                position: "absolute",
                                inset: "4px",
                                zIndex: 0,
                                pointerEvents: "none",
                                // Match the warm near-black well inside the fight-results frame instead of
                                // letting the brighter draft backdrop show through the bundle.
                                background:
                                    "linear-gradient(rgba(0,0,0,.25), rgba(0,0,0,.25)), linear-gradient(160deg, rgba(30,18,7,.64) 0%, rgba(9,6,2,.70) 100%)",
                                borderRadius: "10px",
                            },
                            "&::after": {
                                content: '\"\"',
                                position: "absolute",
                                inset: "3px",
                                zIndex: 3,
                                pointerEvents: "none",
                                boxSizing: "border-box",
                                border: "1px solid rgba(52,44,38,.92)",
                                borderRadius: "11px",
                            },
                        }}
                    >
                        <CardContent
                            sx={{
                                display: "grid",
                                // One spacing token controls the two outer gutters and both inner gaps.
                                gridTemplateColumns: "190px 190px 160px",
                                alignItems: "center",
                                justifyContent: "center",
                                columnGap: "20px",
                                px: "20px",
                                py: "8px",
                                flex: "1 1 auto",
                                minHeight: 0,
                                position: "relative",
                                zIndex: 1,
                            }}
                        >
                            {[
                                { id: l1, level: 1 },
                                { id: l2, level: 2 },
                            ].map(({ id, level }) => (
                                <Box
                                    key={level}
                                    sx={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        minWidth: 0,
                                        minHeight: 0,
                                        overflow: "hidden",
                                    }}
                                    onMouseEnter={() => onInspect?.(id)}
                                    onMouseLeave={() => onInspectEnd?.()}
                                >
                                    <CreaturePortrait
                                        creatureId={id}
                                        state="available"
                                        size={190}
                                        portraitHeight={256}
                                        caption
                                        onInspect={onInspect}
                                        onInspectEnd={onInspectEnd}
                                    />
                                </Box>
                            ))}
                            <Tooltip
                                title={Artifact.formatArtifactDescription(artifact)}
                                placement="top"
                                variant="soft"
                                color="warning"
                                sx={{ maxWidth: 360, fontSize: 14 }}
                            >
                                <Box
                                    sx={{
                                        display: "flex",
                                        flexDirection: "column",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        gap: 1,
                                        width: "100%",
                                        height: "207.39px",
                                        maxHeight: "calc(100% - 4px)",
                                        alignSelf: "center",
                                        // The creature caption sits below its portrait. Lift the shorter
                                        // artifact card so its centre aligns with the portrait frame itself.
                                        transform: "translateY(-15.5px)",
                                        minWidth: 0,
                                        minHeight: 0,
                                        p: 1.25,
                                        borderRadius: "9px",
                                        background: "linear-gradient(180deg, rgba(30,28,24,.78), rgba(13,12,10,.9))",
                                        border: "1px solid rgba(151,103,52,.7)",
                                        boxShadow: "inset 0 0 0 1px rgba(10,8,5,.88), 0 2px 5px rgba(0,0,0,.55)",
                                        position: "relative",
                                    }}
                                >
                                    {artifactImg && (
                                        <img
                                            src={artifactImg}
                                            alt={artifact.name}
                                            style={{
                                                width: "120px",
                                                height: "120px",
                                                objectFit: "contain",
                                                flex: "0 0 auto",
                                            }}
                                        />
                                    )}
                                    <Box sx={{ minWidth: 0, textAlign: "center" }}>
                                        <Typography
                                            sx={{
                                                fontSize: 15,
                                                fontWeight: 700,
                                                color: "#dcb158",
                                                textTransform: "uppercase",
                                            }}
                                        >
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
                                            {t("Tier-1 artifact")}
                                        </Typography>
                                    </Box>
                                </Box>
                            </Tooltip>
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
            overflow: "visible",
            p: 0,
            borderRadius: 0,
            bgcolor: "transparent",
            border: 0,
        }}
    >
        {children}
    </Box>
);

// Draft pools are faction-balanced (4/4/4/4 on L1-L2, 3/3/3/3 on L3-L4) and never contain Death, so the
// grid can lay the level out as two factions per row.
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
    const orderedCreatures = FACTION_ORDER.flatMap((faction) =>
        creatures.filter((creatureId) => creatureFullConfig(creatureId)?.faction === faction),
    );
    const columns = Math.max(1, Math.ceil(orderedCreatures.length / 2));

    return (
        <PhasePanel>
            {/* One flat two-row grid keeps faction order while a single 0.3% token controls both the outer
                inset and every gap. Portraits retain the same 190:256 geometry as the bundle cards. */}
            <Box
                sx={{
                    position: "relative",
                    display: "grid",
                    gridTemplateColumns:
                        level >= 3 ? `repeat(${columns}, max-content)` : `repeat(${columns}, minmax(0, 1fr))`,
                    gridTemplateRows: "repeat(2, minmax(0, 1fr))",
                    gridAutoFlow: "row",
                    columnGap: level >= 3 ? 0 : "0.3%",
                    rowGap: "0.3%",
                    justifyContent: level >= 3 ? "space-evenly" : undefined,
                    height: "100%",
                    minHeight: 0,
                    px: level >= 3 ? 0 : "0.3%",
                    py: "0.3%",
                    boxSizing: "border-box",
                    overflow: "hidden",
                    border: "2px solid rgba(145,104,67,.82)",
                    borderRadius: "14px",
                    background:
                        "linear-gradient(rgba(0,0,0,.24), rgba(0,0,0,.24)), linear-gradient(160deg, rgba(30,18,7,.58) 0%, rgba(9,6,2,.68) 100%)",
                    boxShadow:
                        "inset 0 0 0 1px rgba(12,9,7,.95), inset 0 0 0 3px rgba(79,68,58,.32), 0 3px 8px rgba(0,0,0,.58)",
                    "&::after": {
                        content: '\"\"',
                        position: "absolute",
                        inset: "3px",
                        pointerEvents: "none",
                        border: "1px solid rgba(52,44,38,.92)",
                        borderRadius: "11px",
                    },
                }}
            >
                {orderedCreatures.map((creatureId) => {
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
                            evenlySpaced={level >= 3}
                            pending={pendingId === creatureId}
                            onClick={() => onSelect(creatureId)}
                            onInspect={onInspect}
                            onInspectEnd={onInspectEnd}
                        />
                    );
                })}
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
                    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                    gridTemplateRows: "minmax(0, 1fr)",
                    gap: "18px",
                    height: "100%",
                    minHeight: 0,
                    overflow: "hidden",
                    alignItems: "stretch",
                }}
            >
                {offeredIds.map((id) => {
                    const a = Artifact.getTier2ArtifactProperties(id as Artifact.Tier2Artifact);
                    const isSelected = selected === a.id;
                    return (
                        <Tooltip
                            key={a.id}
                            title={Artifact.formatArtifactDescription(a)}
                            placement="top"
                            variant="soft"
                            color="warning"
                            sx={{ maxWidth: 420, fontSize: 15, lineHeight: 1.45 }}
                        >
                            <Card
                                key={id}
                                variant="outlined"
                                color="neutral"
                                onClick={disabled ? undefined : () => onSelect(id)}
                                sx={{
                                    position: "relative",
                                    height: "100%",
                                    minHeight: 0,
                                    overflow: "hidden",
                                    cursor: disabled ? "default" : "pointer",
                                    bgcolor: "transparent",
                                    boxSizing: "border-box",
                                    // The selected plate uses a 30% heavier, brighter gold edge while keeping
                                    // the card's outer dimensions fixed, so selection is unmistakable.
                                    border: isSelected
                                        ? "2.6px solid rgba(235,181,92,1)"
                                        : "2px solid rgba(145,104,67,.82)",
                                    borderRadius: "14px",
                                    boxShadow: isSelected
                                        ? "inset 0 0 0 1px rgba(17,11,6,.98), inset 0 0 0 3px rgba(177,119,52,.58), inset 0 0 28px rgba(239,184,82,.22), 0 0 0 1px rgba(244,194,103,.38), 0 0 18px rgba(235,177,75,.62), 0 3px 8px rgba(0,0,0,.58)"
                                        : "inset 0 0 0 1px rgba(12,9,7,.95), inset 0 0 0 3px rgba(79,68,58,.32), 0 3px 8px rgba(0,0,0,.58)",
                                    transition: "none",
                                    "&:hover": {
                                        bgcolor: "transparent",
                                        borderColor: isSelected ? "rgba(235,181,92,1)" : "rgba(145,104,67,.82)",
                                        boxShadow: isSelected
                                            ? "inset 0 0 0 1px rgba(17,11,6,.98), inset 0 0 0 3px rgba(177,119,52,.58), inset 0 0 28px rgba(239,184,82,.22), 0 0 0 1px rgba(244,194,103,.38), 0 0 18px rgba(235,177,75,.62), 0 3px 8px rgba(0,0,0,.58)"
                                            : "inset 0 0 0 1px rgba(12,9,7,.95), inset 0 0 0 3px rgba(79,68,58,.32), 0 3px 8px rgba(0,0,0,.58)",
                                        transform: "none",
                                    },
                                    "&::before": {
                                        content: '\"\"',
                                        position: "absolute",
                                        inset: "4px",
                                        zIndex: 0,
                                        pointerEvents: "none",
                                        background:
                                            "linear-gradient(rgba(0,0,0,.25), rgba(0,0,0,.25)), linear-gradient(160deg, rgba(30,18,7,.64) 0%, rgba(9,6,2,.70) 100%)",
                                        borderRadius: "10px",
                                    },
                                    "&::after": {
                                        content: '\"\"',
                                        position: "absolute",
                                        inset: "3px",
                                        zIndex: 3,
                                        pointerEvents: "none",
                                        border: "1px solid rgba(52,44,38,.92)",
                                        borderRadius: "11px",
                                    },
                                }}
                            >
                                <CardContent
                                    sx={{
                                        alignItems: "center",
                                        justifyContent: "center",
                                        gap: 1.5,
                                        p: 2,
                                        flex: "1 1 auto",
                                        minHeight: 0,
                                        height: "100%",
                                        position: "relative",
                                        zIndex: 1,
                                    }}
                                >
                                    {images[a.imageKey] && (
                                        <Box
                                            component="img"
                                            src={images[a.imageKey]}
                                            alt={a.name}
                                            sx={{
                                                width: "154px",
                                                height: "154px",
                                                flex: "0 0 auto",
                                                objectFit: "contain",
                                                borderRadius: "14px",
                                            }}
                                        />
                                    )}
                                    <Typography
                                        sx={{
                                            fontSize: "29px",
                                            lineHeight: 1.15,
                                            fontWeight: 700,
                                            color: "#dcb158",
                                            textAlign: "center",
                                        }}
                                    >
                                        {a.name}
                                    </Typography>
                                    <Typography
                                        sx={{
                                            fontSize: "19.5px",
                                            lineHeight: 1.15,
                                            letterSpacing: "0.12em",
                                            textTransform: "uppercase",
                                            color: "#9aa0ab",
                                            textAlign: "center",
                                        }}
                                    >
                                        {t("Tier-2 artifact")}
                                    </Typography>
                                </CardContent>
                            </Card>
                        </Tooltip>
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
                    ? tf("Confirming this pick lights {faction} — {label} lvl {level}: {description}", {
                          faction: t(faction),
                          label,
                          level: previewLevel,
                          description: describeSynergy(`${faction}:${variant}:${previewLevel}`),
                      })
                    : level
                      ? tf("{faction} — {label} (lvl {level}): {description}", {
                            faction: t(faction),
                            label,
                            level,
                            description: describeSynergy(`${faction}:${variant}:${level}`),
                        })
                      : tf(
                            units === 1
                                ? "{faction} — {label}: locked, {count} more {faction} unit to reach lvl 1"
                                : "{faction} — {label}: locked, {count} more {faction} units to reach lvl 1",
                            { faction: t(faction), label, count: 2 - units },
                        );
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
    // The doctrine is chosen before entering the draft. During the short gap before the server echoes it,
    // keep showing that persisted choice instead of falling back to the old no-perk emoji.
    const visiblePerk = perk > 0 ? perk : getPreGamePerk();
    const visiblePerkCopy = getPerkCopy(visiblePerk);
    const t1 = artifactTier1 ? Artifact.getTier1ArtifactProperties(artifactTier1 as Artifact.Tier1Artifact) : undefined;
    const t2 = artifactTier2 ? Artifact.getTier2ArtifactProperties(artifactTier2 as Artifact.Tier2Artifact) : undefined;
    // Fixed 6 slots in level order [L1,L1,L2,L2,L3,L4], filled progressively (mirrors OpponentDraftBar).
    const slots = placeIntoLevelSlots(picked);
    return (
        <Box
            sx={{
                flex: "1 1 0",
                width: 0,
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
                    borderRadius: "10px",
                    bgcolor: "transparent",
                    // A clean, continuous cloth tone. Removing the cropped source banner also removes its
                    // residual edge ornaments, which showed up as unrelated debris at both ends.
                    backgroundImage:
                        "linear-gradient(90deg, rgba(3,18,8,.65), rgba(5,31,14,.55) 50%, rgba(3,18,8,.65))",
                    backgroundSize: "100% 100%",
                    backgroundPosition: "center",
                    backgroundRepeat: "no-repeat",
                    backgroundBlendMode: "normal, normal",
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
                        borderRadius: "10px",
                        border: "1px solid rgba(151,103,52,.66)",
                        boxShadow: "inset 0 0 0 1px rgba(10,8,5,.88), 0 1px 3px rgba(0,0,0,.65)",
                    },
                }}
            >
                <Tooltip
                    variant="soft"
                    placement="top"
                    title={
                        <Box sx={{ width: 330, maxWidth: "78vw", p: 0.45, display: "grid", gap: 0.65 }}>
                            <Typography level="title-sm" sx={{ color: "#efe4cc" }}>
                                {t(perkName(visiblePerk))}
                            </Typography>
                            <Typography level="body-xs" sx={{ color: "rgba(255,255,255,.88)", lineHeight: 1.35 }}>
                                {visiblePerkCopy ? t(visiblePerkCopy.detail) : ""}
                            </Typography>
                            {visiblePerkCopy && (
                                <Typography level="body-xs" sx={{ color: "#dcb158", lineHeight: 1.3 }}>
                                    {t(visiblePerkCopy.budget)}
                                </Typography>
                            )}
                        </Box>
                    }
                >
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
                        <PerkIcon perkId={visiblePerk} />
                    </Box>
                </Tooltip>
                <BarDivider strong />
                <SynergyDots picked={picked} tone="own" gameId={gameId} pendingId={pendingId} />
                <BarDivider />
                <Box sx={{ display: "flex", gap: 0.55, flexWrap: "nowrap", flex: "0 0 auto" }}>
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
                                            width: 38,
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
                            <Tooltip
                                key={`empty-${i}`}
                                title={tf("Level {level} slot", { level: slot.level })}
                                variant="soft"
                            >
                                <Box
                                    sx={{
                                        width: 38,
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
                                        : tf("Tier-{tier} artifact — not drafted yet", { tier: tier + 1 })
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
                                        overflow: "hidden",
                                    }}
                                >
                                    {img && (
                                        <img
                                            src={img}
                                            alt={a?.name ?? ""}
                                            style={{
                                                width: "100%",
                                                height: "100%",
                                                objectFit: "cover",
                                                borderRadius: "inherit",
                                                transform: "scale(1.15)",
                                            }}
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
                flex: "1 1 0",
                width: 0,
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
                    borderRadius: "10px",
                    bgcolor: "transparent",
                    backgroundImage:
                        "linear-gradient(90deg, rgba(31,5,8,.65), rgba(68,8,13,.55) 50%, rgba(31,5,8,.65))",
                    backgroundSize: "100% 100%",
                    backgroundPosition: "center",
                    backgroundRepeat: "no-repeat",
                    backgroundBlendMode: "normal, normal",
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
                        borderRadius: "10px",
                        border: "1px solid rgba(151,103,52,.66)",
                        boxShadow: "inset 0 0 0 1px rgba(10,8,5,.88), 0 1px 3px rgba(0,0,0,.65)",
                    },
                }}
            >
                {/* Only the picks your doctrine reveals count — a hidden slot cannot light a synergy. */}
                <SynergyDots picked={opponentPicked} tone="opponent" gameId={gameId} />
                <BarDivider strong />
                <Box sx={{ display: "flex", gap: 0.55, flexWrap: "nowrap", flex: "0 0 auto" }}>
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
                                            width: 36,
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
                                    title={tf(
                                        "Level {level} — revealed by your doctrine (flips to the unit once your opponent picks here)",
                                        { level: slot.level },
                                    )}
                                    variant="soft"
                                >
                                    <Box
                                        sx={{
                                            width: 36,
                                            height: 44,
                                            flex: "0 0 auto",
                                            borderRadius: "9px",
                                            display: "grid",
                                            placeItems: "center",
                                            border: "1px solid rgba(240,180,90,0.55)",
                                            bgcolor: "rgba(240,180,90,0.1)",
                                        }}
                                    >
                                        <Box
                                            component="img"
                                            src={watchedEyeImage}
                                            alt="Watched slot"
                                            sx={{
                                                width: 30,
                                                height: 20,
                                                objectFit: "contain",
                                                filter: "drop-shadow(0 1px 1px rgba(0,0,0,.72))",
                                            }}
                                        />
                                    </Box>
                                </Tooltip>
                            );
                        }
                        // Not revealed by your doctrine -> face-down slot.
                        return (
                            <Tooltip
                                key={`opp-hidden-${i}`}
                                title={tf("Level {level} — hidden", { level: slot.level })}
                                variant="soft"
                            >
                                <Box
                                    sx={{
                                        width: 36,
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
        phaseIdentity,
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
    const [selection, setSelection] = useState<{ phaseIdentity: string; value: number } | null>(null);
    // The board is drawn at a fixed 1340x880 and only scaled to fit the window — never re-flowed.
    const draftScale = useDraftScale();
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
    // Unlike the server echo, this flips on the exact confirmation click. It keeps the chosen bundle
    // visually and interactively frozen throughout WAITING OPPONENT, including backend-free previews.
    const [committedBundle, setCommittedBundle] = useState<number>(-1);
    // Artifact the player clicked to pick — opens the confirm modal. The actual pick only fires on Confirm.
    const [pendingArtifact, setPendingArtifact] = useState<number>(0);

    // Clear the local selection whenever the phase advances.
    useEffect(() => {
        setSelection((prev) => (prev && prev.phaseIdentity === phaseIdentity ? prev : null));
        setPickError("");
        setPendingPick(0);
        setPendingArtifact(0);
        setCommittedBundle(-1);
        // The hovered creature goes with it: the tile under the cursor is gone, so its mouseleave never
        // fires and the stat panel would otherwise hang around for the whole next phase.
        setInspectedId(0);
    }, [phaseIdentity]);

    const send = async (value: number, fn: () => Promise<void>): Promise<boolean> => {
        if (busy) return false;
        setBusy(true);
        try {
            await fn();
            setSelection({ phaseIdentity, value });
            return true;
        } catch (err) {
            console.warn("[pick] action rejected", (err as Error)?.message ?? err);
            return false;
        } finally {
            setBusy(false);
        }
    };

    // Creature pick: on a collision (409 — the opponent secretly holds this unit) the server does NOT advance
    // the phase, so remember the unit (grey it out) and prompt a re-pick instead of locking in a selection.
    const pickCreature = async (id: number): Promise<boolean> => {
        if (busy) return false;
        setBusy(true);
        setPickError("");
        try {
            await pick(id);
            setSelection({ phaseIdentity, value: id });
            return true;
        } catch (err) {
            const status = (err as { response?: { status?: number } })?.response?.status;
            const msg = (err as Error)?.message ?? "";
            if (status === 409 || /already taken|already picked/i.test(msg)) {
                setCollided((prev) => (prev.includes(id) ? prev : [...prev, id]));
                setPickError(t("Already picked by your opponent — choose another."));
            } else {
                setPickError(msg || t("Pick rejected — choose another."));
            }
            return false;
        } finally {
            setBusy(false);
        }
    };

    const commitBundle = async (index: number): Promise<boolean> => {
        setCommittedBundle(index);
        const accepted = await send(index, () => pickPair(index));
        if (!accepted) setCommittedBundle(-1);
        return accepted;
    };

    const commitArtifact = (artifactId: number): Promise<boolean> => {
        setPendingArtifact(0);
        return send(artifactId, () => artifact(artifactId, 2));
    };

    const commitCreature = (id: number): Promise<boolean> => {
        setPendingPick(0);
        return pickCreature(id);
    };

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
                void commitCreature(pendingPick);
            } else if (pickPhase === PickPhaseVals.INITIAL_PICK && pendingBundle >= 0) {
                void commitBundle(pendingBundle);
            } else if (pickPhase === PickPhaseVals.ARTIFACT_2 && pendingArtifact > 0) {
                void commitArtifact(pendingArtifact);
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    });
    const selectedValue = selection && selection.phaseIdentity === phaseIdentity ? selection.value : -1;
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
    const bundleSelectionLocked =
        bundleLocked || committedBundle >= 0 || selectedValue >= 0 || (busy && pendingBundle >= 0);

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
                disabled={disabled || bundleSelectionLocked}
                locked={bundleSelectionLocked}
                selected={
                    bundleLocked
                        ? bundleChosenIndex
                        : committedBundle >= 0
                          ? committedBundle
                          : pendingBundle >= 0
                            ? pendingBundle
                            : selectedValue
                }
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
                {/* The header reserves the inspector's height even when no unit is hovered. That keeps the
                cards stable under the cursor, and the readout replaces the draft title instead of covering it. */}
                <Box
                    data-testid="draft-header-zone"
                    sx={{
                        width: "100%",
                        height: DRAFT_HEADER_HEIGHT,
                        minHeight: DRAFT_HEADER_HEIGHT,
                        maxHeight: DRAFT_HEADER_HEIGHT,
                        flex: "0 0 auto",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        overflow: "hidden",
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
                            <CreatureDetailPanel creatureId={inspectedId} />
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
                        {isYourTurn ? t("Your turn") : tf("{opponent}'s turn", { opponent: opponentLabel })}
                    </Chip>
                    {upgradePoints > 0 && (
                        <Tooltip title={t("Points you can spend on upgrades before placement")} variant="soft">
                            <Chip color="primary" variant="soft">
                                {tf("{count} upgrade pts", { count: upgradePoints })}
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
                            data-testid="draft-armies-zone"
                            sx={{
                                display: "flex",
                                gap: 1.5,
                                width: "100%",
                                height: DRAFT_ARMIES_HEIGHT,
                                minHeight: DRAFT_ARMIES_HEIGHT,
                                maxHeight: DRAFT_ARMIES_HEIGHT,
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

                <Box
                    data-testid="draft-choice-action-zone"
                    sx={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: DRAFT_ZONE_GAP,
                        width: "100%",
                        flex: "1 1 0",
                        minHeight: 0,
                    }}
                >
                    {/* Flexible slot for the phase's choice frame. Every phase receives this exact region;
                        only the grid rendered inside it changes. */}
                    <Box
                        data-testid="draft-choice-zone"
                        sx={{
                            position: "relative",
                            display: "flex",
                            justifyContent: "center",
                            alignItems: "stretch",
                            width: "100%",
                            flex: "1 1 0",
                            minHeight: 0,
                            overflow: "visible",
                        }}
                    >
                        {userTeam ? panel : null}
                    </Box>

                    {userTeam && isCommitPhase && pickPhase >= 0 && (
                        <PickCommitButton
                            label={
                                !isYourTurn
                                    ? pickPhase === PickPhaseVals.PICK && requiredLevel > 0
                                        ? tf("Opponent's turn — Lvl {level}", { level: requiredLevel })
                                        : t("Opponent's turn")
                                    : pickPhase === PickPhaseVals.ARTIFACT_2
                                      ? pendingArtifact > 0
                                          ? tf("Confirm {name}", {
                                                name: Artifact.getTier2ArtifactProperties(
                                                    pendingArtifact as Artifact.Tier2Artifact,
                                                ).name,
                                            })
                                          : t("Pick an artifact")
                                      : pickPhase === PickPhaseVals.INITIAL_PICK
                                        ? pendingBundle >= 0
                                            ? t("Confirm bundle")
                                            : t("Pick a bundle")
                                        : pendingPick > 0
                                          ? tf("Confirm {name}", { name: creatureName(pendingPick) })
                                          : t("Pick a creature")
                            }
                            tone="green"
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
                                        : t("Choose a creature first — click a portrait, then confirm.")
                            }
                            seconds={secondsRemaining}
                            submissionKey={phaseIdentity}
                            onCommit={() => {
                                if (pickPhase === PickPhaseVals.ARTIFACT_2) {
                                    return commitArtifact(pendingArtifact);
                                }
                                if (pickPhase === PickPhaseVals.INITIAL_PICK) {
                                    return commitBundle(pendingBundle);
                                }
                                return commitCreature(pendingPick);
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
                </Box>

                {/* Fires once, right before the L3 picks, the moment the server reveals the map type. */}
                <MapRevealModal mapType={mapType} />
            </Box>
            {/* Keep draft progress out of the fixed board. It now shares the bottom control line with the
                fullscreen button and ThemeMusic's floating volume control, so the choice area gets the full
                board height and the rail remains anchored regardless of the active phase. */}
            <DraftBottomControls
                step={currentStep(pickPhase, requiredLevel)}
                userTeam={userTeam}
                draftScale={draftScale}
            />
            <Tooltip title={t("Open the full How-to-Play guide in a new tab")} variant="soft" placement="left">
                <Typography
                    component="a"
                    href={RULES_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    level="body-sm"
                    sx={{
                        position: "fixed",
                        top: "1rem",
                        right: "1rem",
                        zIndex: 60,
                        color: "#9fd0ff",
                        textDecoration: "none",
                        display: "flex",
                        alignItems: "center",
                        gap: 0.5,
                        fontWeight: 600,
                        "&:hover": { textDecoration: "underline" },
                    }}
                >
                    📖 {t("Rules")}
                </Typography>
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
