import {
    Artifact,
    CREATURES_JSON,
    CreatureVals,
    getCreatureLevel,
    getCreaturesByLevel,
    HoCConfig,
    Perk,
    PickPhaseVals,
    type TeamType,
} from "@heroesofcrypto/common";
import { Box, Button, Card, CardContent, Chip, CircularProgress, Divider, Sheet, Tooltip, Typography } from "@mui/joy";
import React, { useEffect, useState } from "react";

import { images as rawImages } from "../../generated/image_imports";
import { getPreGamePerk } from "../../utils/preGamePerk";
import { usePickBanEvents } from "../context/PickBanContext";
import { useAuthContext } from "../auth/context/auth_context";
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
import { SpeedIcon } from "../svg/speed";
import { SwordIcon } from "../svg/sword";
import { MapBadge, MapRevealModal } from "./MapReveal";
import { Timer } from "./Timer";

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
    speed: number;
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
        return (cfg.desc ?? [])
            .join(" ")
            .replace(/\{\}/g, String(cfg.power ?? ""))
            .trim();
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
                px: 1.5,
                py: 1,
                borderRadius: "14px",
                bgcolor: "rgba(255,255,255,0.05)",
                "& svg": { width: 26, height: 26 },
            }}
        >
            {icon}
            <Typography sx={{ fontSize: 23, fontWeight: 700, color: "#e9e6df" }}>{value}</Typography>
        </Box>
    </Tooltip>
);

// Fixed left-side panel showing the currently inspected (hovered) creature's stats + abilities, so players
// can read what a unit does before picking it. Renders nothing until a creature is hovered.
const CreatureDetailPanel: React.FC<{ creatureId: number }> = ({ creatureId }) => {
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
                position: "absolute",
                top: "clamp(6px, 1.5vh, 30px)",
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 6,
                width: "min(1340px, 97vw)",
                minHeight: "clamp(168px, 19vh, 214px)",
                p: "12px 20px",
                borderRadius: "20px",
                bgcolor: "rgba(11,13,18,0.98)",
                border: "2px solid rgba(159,182,212,0.55)",
                boxShadow: "0 18px 44px rgba(0,0,0,0.6)",
                color: "#e9e6df",
                pointerEvents: "none",
                display: { xs: "none", md: "flex" },
                alignItems: "center",
                gap: "26px",
                flexWrap: "wrap",
            }}
        >
            {img && (
                <Box
                    component="img"
                    src={img}
                    alt={c.name}
                    sx={{
                        width: 112,
                        height: 112,
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
            </Box>
            <Box
                sx={{
                    flex: "1 1 340px",
                    display: "grid",
                    gridTemplateColumns: "repeat(4, minmax(112px, 1fr))",
                    gridAutoRows: "minmax(46px, auto)",
                    gap: "10px",
                }}
            >
                <StatChip icon={<HeartIcon />} label="Hit points" value={`${c.hp}/${c.hp}`} />
                <StatChip
                    icon={<FistIcon />}
                    label="Damage"
                    value={`${c.attack_damage_min} - ${c.attack_damage_max}`}
                />
                <StatChip icon={<SwordIcon />} label="Attack" value={c.attack} />
                <StatChip icon={<ShotRangeIcon />} label="Shot distance" value={isRanged ? c.shot_distance : "—"} />
                <StatChip icon={<QuiverIcon />} label="Shots" value={isRanged ? c.range_shots : "—"} />
                <StatChip icon={<ShieldIcon />} label="Armor" value={c.armor} />
                <StatChip icon={<MagicShieldIcon />} label="Magic resist" value={`${c.magic_resist}%`} />
                <StatChip icon={<ArrowShieldIcon />} label="Size on the board" value={c.size === 2 ? "2×2" : "1×1"} />
                <StatChip icon={<SpeedIcon />} label="Speed" value={c.speed} />
                <StatChip icon={<BootIcon />} label="Movement steps" value={c.steps} />
            </Box>
            <>
                <Divider orientation="vertical" sx={{ display: { xs: "none", lg: "block" } }} />
                <Box sx={{ flex: "0 0 auto", display: "flex", gap: "10px" }}>
                    {Array.from({ length: 4 }, (_, i) => abilities[i]).map((ability, i) => (
                        <Tooltip
                            key={ability ?? `empty-${i}`}
                            title={ability ? abilityDescription(ability) : ""}
                            variant="soft"
                            placement="top"
                        >
                            <Box
                                sx={{
                                    width: 96,
                                    height: 96,
                                    borderRadius: "16px",
                                    bgcolor: ability ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.02)",
                                    border: `1px solid ${ability ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.04)"}`,
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    justifyContent: "center",
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
                                            sx={{ width: 44, height: 44, objectFit: "contain" }}
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
            return "Pick one doctrine to continue.";
        case PickPhaseVals.INITIAL_PICK:
            return "Pick one starting bundle.";
        case PickPhaseVals.PICK:
            return level > 0 ? `Pick one Level ${level} creature for your army.` : "Pick one creature for your army.";
        case PickPhaseVals.ARTIFACT_2:
            return "Pick one Tier-2 artifact for your whole army.";
        default:
            return "";
    }
};

// The doctrine no longer owns a step of its own — it is answered on the Bundle screen.
const STEP_LABELS = ["Bundle", "Lvl 1", "Lvl 2", "Lvl 3", "Artifact 2", "Lvl 4", "Augments", "Place"];

const currentStep = (phase: number, level: number): number => {
    switch (phase) {
        case PickPhaseVals.PERK:
        case PickPhaseVals.INITIAL_PICK:
            return 0;
        case PickPhaseVals.ARTIFACT_2:
            return 4;
        case PickPhaseVals.AUGMENTS:
        case PickPhaseVals.AUGMENTS_SCOUT:
            return 6;
        case PickPhaseVals.PICK:
            return level === 4 ? 5 : level;
        default:
            return -1;
    }
};

export const DraftStepper: React.FC<{ step: number }> = ({ step }) => (
    <Box
        sx={{
            display: "flex",
            alignItems: "flex-start",
            gap: 0,
            flexWrap: "nowrap",
            justifyContent: "space-between",
            width: "min(1340px, 97vw)",
        }}
    >
        {STEP_LABELS.map((label, i) => {
            const done = i < step;
            const active = i === step;
            return (
                <React.Fragment key={label}>
                    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0.75 }}>
                        <Box
                            sx={{
                                width: 34,
                                height: 34,
                                borderRadius: "12px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 16,
                                fontWeight: 700,
                                bgcolor: active ? "#dcb158" : done ? "rgba(78,148,80,0.18)" : "#12151d",
                                border: `2px solid ${active ? "#dcb158" : done ? "#4e9450" : "rgba(255,255,255,0.12)"}`,
                                color: active ? "#241a06" : done ? "#8fcd7d" : "#7c8290",
                            }}
                        >
                            {done ? "✓" : i + 1}
                        </Box>
                        <Typography
                            level="body-xs"
                            sx={{ fontSize: 14, color: active ? "#efe4cc" : done ? "#8fcd7d" : "#7c8290" }}
                        >
                            {label}
                        </Typography>
                    </Box>
                    {i < STEP_LABELS.length - 1 && (
                        <Box
                            sx={{
                                flex: "1 1 auto",
                                minWidth: 12,
                                height: 2,
                                mt: "16px",
                                bgcolor: done ? "#4e9450" : "rgba(255,255,255,0.14)",
                            }}
                        />
                    )}
                </React.Fragment>
            );
        })}
    </Box>
);

type PortraitState = "available" | "picked" | "taken" | "banned";

const STATE_HINT: Record<PortraitState, string> = {
    available: "",
    picked: "In your army",
    taken: "Taken by your opponent",
    banned: "Banned",
};

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
    const tip = STATE_HINT[state] ? `${creatureName(creatureId)} — ${STATE_HINT[state]}` : creatureName(creatureId);
    const config = creatureFullConfig(creatureId)?.config;
    const portrait = (
        <Tooltip title={tip} variant="soft" placement="top">
            <Box
                onClick={selectable ? onClick : undefined}
                onMouseEnter={() => onInspect?.(creatureId)}
                onMouseLeave={() => onInspectEnd?.()}
                sx={{
                    position: "relative",
                    width: fill ? "100%" : size,
                    height: fill ? "auto" : size,
                    aspectRatio: fill ? "1" : undefined,
                    borderRadius: fill ? "20px" : "10px",
                    overflow: "hidden",
                    border: `${fill ? 3 : 2}px solid ${ring}`,
                    cursor: selectable ? "pointer" : "default",
                    opacity: state === "available" ? 1 : 0.5,
                    // The unit you are about to confirm pulses a soft green halo.
                    animation: pending ? "hocPendingGlow 1.6s ease-in-out infinite" : "none",
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
                gap: 0.75,
                minWidth: 0,
                width: "100%",
                maxWidth: "clamp(92px, 9.5vw, 138px)",
            }}
        >
            {portrait}
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0.75, minWidth: 0 }}>
                <Typography
                    level="body-sm"
                    sx={{
                        fontSize: 17,
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
const PickCommitButton: React.FC<{
    label: string;
    armed: boolean;
    isYourTurn: boolean;
    seconds: number;
    onCommit: () => void;
}> = ({ label, armed, isYourTurn, seconds, onCommit }) => {
    const urgent = seconds >= 0 && seconds <= 15;
    return (
        <Box
            component="button"
            type="button"
            disabled={!armed}
            onClick={armed ? onCommit : undefined}
            sx={{
                minHeight: "clamp(56px, 8vh, 96px)",
                minWidth: "min(620px, 88%)",
                mt: "calc(clamp(10px, 1.6vh, 30px) * -0.7)",
                borderRadius: "16px",
                border: `2px solid ${isYourTurn ? "rgba(214,240,200,0.55)" : "rgba(255,205,195,0.5)"}`,
                background: isYourTurn
                    ? "linear-gradient(180deg, #7ab86a 0%, #4e9450 46%, #2f6b3c 100%)"
                    : "linear-gradient(180deg, #d1554a 0%, #a3322b 46%, #6e1f1a 100%)",
                boxShadow:
                    "inset 0 0 0 3px rgba(214,240,200,0.55), inset 0 2px 0 rgba(255,255,255,0.35), inset 0 -12px 26px rgba(0,0,0,0.28)",
                color: "#f2fbee",
                fontSize: "clamp(20px, 1.9vw, 34px)",
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 3,
                cursor: armed ? "pointer" : "default",
                px: 3,
                // Blinks while it is waiting for you to commit; hovering stops it so the label stays readable.
                animation: armed ? "hocCommitBlink 1.4s ease-in-out infinite" : "none",
                "&:hover": { animation: "none" },
                "@keyframes hocCommitBlink": {
                    "0%, 100%": { opacity: 1 },
                    "50%": { opacity: 0.62 },
                },
                "@keyframes hocTimerBlink": {
                    "0%, 100%": { opacity: 1 },
                    "50%": { opacity: 0.25 },
                },
            }}
        >
            <Box component="span" sx={{ flex: "1 1 auto", textAlign: "center" }}>
                {label}
            </Box>
            {seconds >= 0 && (
                <Box
                    component="span"
                    sx={{
                        pl: 3,
                        borderLeft: "2px solid rgba(255,255,255,0.35)",
                        fontVariantNumeric: "tabular-nums",
                        // White while there is time, blinking red for the last 15 seconds.
                        color: urgent ? "#ff3b2f" : "#fff",
                        textShadow: urgent ? "0 0 18px rgba(255,59,47,0.75)" : "none",
                        animation: urgent ? "hocTimerBlink 1s ease-in-out infinite" : "none",
                    }}
                >
                    {`0:${String(Math.max(0, seconds)).padStart(2, "0")}`}
                </Box>
            )}
        </Box>
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
                                {isSelected ? "✓ Chosen" : "Choose"}
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
    <Box
        sx={{
            width: "min(1340px, 97vw)",
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: "26px",
            minHeight: "clamp(320px, 47vh, 640px)",
            alignItems: "stretch",
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
                        width: "100%",
                        height: "100%",
                        cursor: disabled ? "default" : "pointer",
                        bgcolor: "rgba(0,0,0,0.35)",
                        border: `2px solid ${isSelected ? "#dcb158" : "rgba(255,255,255,0.12)"}`,
                        boxShadow: isSelected ? "0 0 18px rgba(220,177,88,0.35)" : "none",
                    }}
                >
                    <CardContent sx={{ alignItems: "center", gap: 2 }}>
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
                                            width: "clamp(120px, 13vw, 210px)",
                                            height: "clamp(120px, 13vw, 210px)",
                                            borderRadius: "50%",
                                            objectFit: "cover",
                                        }}
                                    />
                                    <Typography sx={{ fontSize: 18, fontWeight: 700, color: "#e9e6df" }}>
                                        {creatureName(id)}
                                    </Typography>
                                    <Typography sx={{ fontSize: 14, color: "#7c8290" }}>Level {level}</Typography>
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
                                borderRadius: "14px",
                                bgcolor: "rgba(255,255,255,0.04)",
                                border: "1px solid rgba(220,177,88,0.28)",
                            }}
                        >
                            {artifactImg && (
                                <img
                                    src={artifactImg}
                                    alt={artifact.name}
                                    style={{
                                        width: "clamp(72px, 7vw, 120px)",
                                        height: "clamp(72px, 7vw, 120px)",
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
                                <Typography sx={{ fontSize: 13.5, color: "#9aa0ab" }}>
                                    ({Artifact.formatArtifactDescription(artifact)})
                                </Typography>
                            </Box>
                        </Box>
                    </CardContent>
                </Card>
            );
        })}
    </Box>
);

// The frame every phase's choices sit in: same width, padding and border, so switching phases only swaps
// the contents and nothing on screen jumps.
const PhasePanel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <Box
        sx={{
            width: "min(1340px, 97vw)",
            p: "22px",
            borderRadius: "30px",
            bgcolor: "rgba(255,255,255,0.025)",
            border: "2px solid rgba(255,255,255,0.1)",
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
    const columns = level >= 3 ? 3 : 4;
    const byFaction = FACTION_ORDER.map((faction) => ({
        faction,
        ids: creatures.filter((creatureId) => creatureFullConfig(creatureId)?.faction === faction),
    })).filter((group) => group.ids.length > 0);

    return (
        <PhasePanel>
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "26px" }}>
                {byFaction.map(({ faction, ids }) => (
                    <Box key={faction} sx={{ display: "flex", flexDirection: "column", gap: 1.5, minWidth: 0 }}>
                        <Typography
                            level="body-sm"
                            sx={{
                                fontSize: 16,
                                letterSpacing: "0.14em",
                                textTransform: "uppercase",
                                textAlign: "center",
                                color: FACTION_COLOR[faction] ?? "#e9e6df",
                            }}
                        >
                            {faction}
                        </Typography>
                        <Box
                            sx={{
                                display: "grid",
                                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                                gap: "14px",
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
        <Box
            sx={{
                width: "min(1340px, 97vw)",
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: "20px",
                minHeight: "clamp(320px, 47vh, 640px)",
                alignItems: "stretch",
            }}
        >
            {offeredIds.map((id) => {
                const a = Artifact.getTier2ArtifactProperties(id as Artifact.Tier2Artifact);
                const isSelected = selected === a.id;
                return (
                    <Tooltip key={a.id} title={Artifact.formatArtifactDescription(a)} variant="soft" placement="top">
                        <Card
                            key={id}
                            variant="outlined"
                            color="neutral"
                            onClick={disabled ? undefined : () => onSelect(id)}
                            sx={{
                                height: "100%",
                                cursor: disabled ? "default" : "pointer",
                                bgcolor: "#12151d",
                                border: `2px solid ${isSelected ? "#dcb158" : "rgba(255,255,255,0.08)"}`,
                                borderRadius: "22px",
                                boxShadow: isSelected ? "0 0 18px rgba(220,177,88,0.35)" : "none",
                            }}
                        >
                            <CardContent sx={{ alignItems: "center", gap: 1.25, p: 2 }}>
                                {images[a.imageKey] && (
                                    <Box
                                        component="img"
                                        src={images[a.imageKey]}
                                        alt={a.name}
                                        sx={{
                                            width: "clamp(110px, 11vw, 186px)",
                                            height: "clamp(110px, 11vw, 186px)",
                                            objectFit: "contain",
                                            borderRadius: "12px",
                                        }}
                                    />
                                )}
                                <Typography
                                    sx={{ fontSize: "clamp(18px, 1.7vw, 32px)", fontWeight: 700, color: "#dcb158" }}
                                >
                                    {a.name}
                                </Typography>
                                <Typography
                                    sx={{
                                        fontSize: 16,
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
                                        mt: 0.5,
                                    }}
                                >
                                    {Artifact.formatArtifactDescription(a)
                                        .split(/(?<=\.)\s+/)
                                        .filter(Boolean)
                                        .map((line) => (
                                            <Box
                                                key={line}
                                                sx={{
                                                    p: "12px 16px",
                                                    borderRadius: "18px",
                                                    bgcolor: "rgba(255,255,255,0.05)",
                                                    fontSize: "clamp(14px, 1.1vw, 20px)",
                                                    color: "#e9e6df",
                                                }}
                                            >
                                                {line}
                                            </Box>
                                        ))}
                                </Box>
                            </CardContent>
                        </Card>
                    </Tooltip>
                );
            })}
        </Box>
    );
};

// ---- "Your army" summary bar ---------------------------------------------

const perkName = (perkId: number): string => Perk.getPerkProperties(perkId as Perk.Perk)?.name ?? "";

const BarDivider: React.FC = () => (
    <Box sx={{ width: "1px", alignSelf: "stretch", bgcolor: "rgba(255,255,255,0.14)", mx: 0.25 }} />
);

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
const MyDraftBar: React.FC<{
    perk: number;
    picked: number[];
    artifactTier1: number;
    artifactTier2: number;
    onInspect?: (creatureId: number) => void;
}> = ({ perk, picked, artifactTier1, artifactTier2, onInspect }) => {
    const t1 = artifactTier1 ? Artifact.getTier1ArtifactProperties(artifactTier1 as Artifact.Tier1Artifact) : undefined;
    const t2 = artifactTier2 ? Artifact.getTier2ArtifactProperties(artifactTier2 as Artifact.Tier2Artifact) : undefined;
    const artifacts = [t1, t2].filter((a): a is Artifact.ArtifactProperties => !!a);
    // Fixed 6 slots in level order [L1,L1,L2,L2,L3,L4], filled progressively (mirrors OpponentDraftBar).
    const slots = placeIntoLevelSlots(picked);
    return (
        <Box
            sx={{
                flex: "1 1 560px",
                maxWidth: 720,
                display: "flex",
                justifyContent: "center",
            }}
        >
            <Sheet
                variant="soft"
                sx={{
                    pointerEvents: "auto",
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    px: 1.75,
                    py: 0.25,
                    maxWidth: "94%",
                    flexWrap: "wrap",
                    justifyContent: "center",
                    borderRadius: "14px",
                    bgcolor: "#171a23",
                    border: "1px solid rgba(255,255,255,0.12)",
                    color: "#e9e6df",
                    width: "100%",
                }}
            >
                <Typography sx={{ color: "#dcb158", fontWeight: 700, fontSize: 17, whiteSpace: "nowrap" }}>
                    Your army
                </Typography>
                {perk > 0 && (
                    <>
                        <BarDivider />
                        <Tooltip title="Your doctrine (perk)" variant="soft">
                            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                                <Typography level="body-sm">{PERK_ICON[perk] ?? "•"}</Typography>
                                <Typography level="body-sm" sx={{ fontWeight: 600 }}>
                                    {perkName(perk)}
                                </Typography>
                            </Box>
                        </Tooltip>
                    </>
                )}
                <BarDivider />
                <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap" }}>
                    {slots.map((slot, i) => {
                        const id = slot.id;
                        if (id) {
                            const src = creatureImage(id);
                            return (
                                <Tooltip key={`${id}-${i}`} title={creatureName(id)} variant="soft">
                                    <Box
                                        onMouseEnter={() => onInspect?.(id)}
                                        sx={{
                                            width: 50,
                                            height: 50,
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
                                        width: 50,
                                        height: 50,
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
                {artifacts.length > 0 && (
                    <>
                        <BarDivider />
                        <Box sx={{ display: "flex", gap: 0.5 }}>
                            {artifacts.map((a) => {
                                const img = images[a.imageKey];
                                return (
                                    <Tooltip
                                        key={a.id}
                                        title={`${a.name} — ${Artifact.formatArtifactDescription(a)}`}
                                        variant="soft"
                                    >
                                        <Box
                                            sx={{
                                                width: 34,
                                                height: 34,
                                                borderRadius: "7px",
                                                display: "grid",
                                                placeItems: "center",
                                                border: "1px solid rgba(245,158,11,0.45)",
                                                bgcolor: "rgba(245,158,11,0.08)",
                                            }}
                                        >
                                            {img && (
                                                <img
                                                    src={img}
                                                    alt={a.name}
                                                    style={{ width: 28, height: 28, objectFit: "contain" }}
                                                />
                                            )}
                                        </Box>
                                    </Tooltip>
                                );
                            })}
                        </Box>
                    </>
                )}
            </Sheet>
        </Box>
    );
};

// ---- Root view ------------------------------------------------------------

interface StainedGlassProps {
    userTeam: TeamType;
    opponentLabel?: string;
    height?: number;
}

// The opponent's army rendered as EXACTLY 6 fixed level-ordered slots [L1,L1,L2,L2,L3,L4]. Each slot shows one
// of three states: a portrait (the opponent has picked there AND your doctrine reveals it), an eye (your
// doctrine watches that slot but the opponent hasn't filled it yet), or a "?" (not revealed by your doctrine).
// `opponentPicked` is a slot-ALIGNED array (length = ARMY_LAYOUT.length): the creature id at each watched slot
// the opponent has filled, and 0 elsewhere — so a creature stays at its true positional slot (a bundle L2 at
// index 2 vs a separately-picked L2 at index 3) instead of being bucket-filled left-to-right. `watchedSlots`
// is the set of slot indices (0..5) your scouting doctrine watches — a watched-but-empty slot shows the eye.
const OpponentDraftBar: React.FC<{
    opponentPicked: number[];
    opponentLabel: string;
    // Opponent slot indices (0..5) this player's scouting doctrine actually watches — server-authoritative
    // (SSE `ws` / slotsSeen), seeded at doctrine selection: all six for Spymaster, the three tier-block-random
    // slots for Scout, none for Blind Fury.
    watchedSlots: number[];
    onInspect?: (creatureId: number) => void;
}> = ({ opponentPicked, watchedSlots, onInspect }) => {
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
                flex: "1 1 420px",
                maxWidth: 560,
                display: "flex",
                justifyContent: "center",
            }}
        >
            <Sheet
                variant="soft"
                sx={{
                    pointerEvents: "auto",
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    px: 1.75,
                    py: 0.25,
                    maxWidth: "94%",
                    flexWrap: "wrap",
                    justifyContent: "center",
                    borderRadius: "14px",
                    bgcolor: "#241416",
                    border: "1px solid rgba(138,43,43,0.6)",
                    width: "100%",
                    color: "#f0e7e9",
                }}
            >
                <Typography sx={{ color: "#ff9d9d", fontWeight: 700, fontSize: 17, whiteSpace: "nowrap" }}>
                    Opponent
                </Typography>
                <BarDivider />
                <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap" }}>
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
                                        sx={{
                                            width: 44,
                                            height: 44,
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

const StainedGlassWindow: React.FC<StainedGlassProps> = ({ userTeam, opponentLabel = "Opponent" }) => {
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
    // Creature currently hovered anywhere in the draft — its stats + abilities show in the left detail panel.
    const [inspectedId, setInspectedId] = useState<number>(0);
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
                setPickError(msg || "Pick rejected — choose another.");
            }
        } finally {
            setBusy(false);
        }
    };

    const disabled = !isYourTurn || busy;
    const selectedValue = selection && selection.phase === pickPhase ? selection.value : -1;
    const hint = PHASE_HINT[pickPhase] ?? "";
    // "Taken" units are the opponent picks we legitimately know about: the ones we've collided on locally
    // (a 409 re-pick) PLUS the ones the server has already revealed to us through our scouting doctrine /
    // reveal perks. Those arrive in `opponentPicked` (the `op` field) — a slot-aligned array carrying the
    // creature id at each watched-and-filled slot and 0 (NO_CREATURE) elsewhere, so we drop the empties.
    // Mirrors getKnownOpponentCreatures() in the pick sim (and the LocalModelDraftOpponent path) so the grid
    // greys out units we already know are gone instead of letting us pick into a guaranteed collision.
    const knownOpponentPicked = opponentPicked.filter((id) => !!id && id !== CreatureVals.NO_CREATURE);
    const opponentTaken = Array.from(new Set([...collided, ...knownOpponentPicked]));
    const isHandoff = pickPhase === PickPhaseVals.AUGMENTS || pickPhase === PickPhaseVals.AUGMENTS_SCOUT;
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
    if (pickPhase === PickPhaseVals.PERK) {
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
                onInspect={setInspectedId}
                onInspectEnd={() => setInspectedId(0)}
            />
        );
    } else if (pickPhase === PickPhaseVals.PICK) {
        panel = (
            <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                {pickError && (
                    <Chip size="sm" color="danger" variant="soft">
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
                    onInspect={setInspectedId}
                    onInspectEnd={() => setInspectedId(0)}
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
                <Typography level="title-md">Preparing placement…</Typography>
            </Box>
        );
    }

    return (
        <Sheet
            variant="solid"
            sx={{
                width: "100%",
                height: "100vh",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "clamp(10px, 1.6vh, 30px)",
                p: "clamp(10px, 2vh, 36px) 40px clamp(10px, 1.6vh, 36px)",
                maxWidth: 1720,
                mx: "auto",
                background: "radial-gradient(120% 80% at 50% 0%, #171a23 0%, #0b0d12 60%)",
                color: "#e9e6df",
                overflow: "hidden",
                position: "relative",
            }}
        >
            <Tooltip title="Open the full How-to-Play guide in a new tab" variant="soft" placement="left">
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

            <Box
                sx={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 0.5,
                    minHeight: "clamp(44px, 7vh, 96px)",
                    flex: "0 1 auto",
                    py: "clamp(4px, 1.4vh, 26px)",
                }}
            >
                <Typography
                    sx={{
                        fontSize: "clamp(30px, 3.4vw, 62px)",
                        fontWeight: 600,
                        lineHeight: 1.1,
                        color: "#efe4cc",
                        textAlign: "center",
                    }}
                >
                    {title(pickPhase, requiredLevel)}
                </Typography>
                {hint && !isCommitPhase && (
                    <Typography level="body-sm" sx={{ opacity: 0.7, textAlign: "center", maxWidth: 560 }}>
                        {hint}
                    </Typography>
                )}
            </Box>

            <Box
                sx={{
                    display: isCommitPhase ? "none" : "flex",
                    alignItems: "center",
                    gap: 1.5,
                }}
            >
                <Chip color={isYourTurn ? "success" : "warning"} variant="soft">
                    {isYourTurn ? "Your turn" : `${opponentLabel}'s turn`}
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
                {/* Reads "Map: ?" until the server reveals the map right before the L3 picks, then the name. */}
                <MapBadge mapType={mapType} />
            </Box>

            {/* Imperative "what to do now" so first-time players always know the expected action. */}
            {isYourTurn && !isHandoff && !isCommitPhase && phaseAction(pickPhase, requiredLevel) && (
                <Typography level="title-sm" sx={{ color: "#7CFC9B", fontWeight: 700, textAlign: "center", mt: -0.5 }}>
                    👉 {phaseAction(pickPhase, requiredLevel)}
                </Typography>
            )}

            {/* Purely a hover read-out: it floats over the title, takes no layout space and clears the moment
                the cursor leaves a portrait. */}
            <CreatureDetailPanel creatureId={inspectedId} />

            {pickPhase !== PickPhaseVals.INITIAL_PICK && pickPhase !== PickPhaseVals.PERK && (
                <>
                    {/* Both armies sit ABOVE the grid, side by side: yours (doctrine, six level slots, artifacts) and
                the opponent's (hidden / watched / revealed), so the draft state reads before the choices. */}
                    <Box
                        sx={{
                            display: "flex",
                            gap: 2,
                            width: "100%",
                            justifyContent: "center",
                            alignItems: "stretch",
                            flexWrap: "wrap",
                        }}
                    >
                        <MyDraftBar
                            perk={perk}
                            picked={picked}
                            artifactTier1={artifactTier1}
                            artifactTier2={artifactTier2}
                            onInspect={setInspectedId}
                        />
                        <OpponentDraftBar
                            opponentPicked={opponentPicked}
                            opponentLabel={opponentLabel}
                            watchedSlots={watchedSlots}
                            onInspect={setInspectedId}
                        />
                    </Box>
                </>
            )}

            {/* The hover stat bar is absolutely positioned against this wrapper, so it floats just above the
                pick grid instead of pinning itself to the viewport's left edge. */}
            <Box
                sx={{
                    position: "relative",
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    width: "100%",
                    flex: "1 1 auto",
                    minHeight: 0,
                    overflowY: "auto",
                }}
            >
                {userTeam ? panel : null}
            </Box>

            {userTeam && isCommitPhase && (
                <PickCommitButton
                    label={
                        !isYourTurn
                            ? "Opponent's turn"
                            : pickPhase === PickPhaseVals.ARTIFACT_2
                              ? pendingArtifact > 0
                                  ? `Confirm ${Artifact.getTier2ArtifactProperties(pendingArtifact as Artifact.Tier2Artifact).name}`
                                  : "Pick an artifact"
                              : pickPhase === PickPhaseVals.INITIAL_PICK
                                ? pendingBundle >= 0
                                    ? "Confirm bundle"
                                    : "Pick a bundle"
                                : pendingPick > 0
                                  ? `Confirm ${creatureName(pendingPick)}`
                                  : "Pick a creature"
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
            {!isYourTurn && !isHandoff && (
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, opacity: 0.7 }}>
                    <CircularProgress size="sm" />
                    <Typography level="body-sm">
                        {selectedValue >= 0 ? "Locked in — waiting for your opponent…" : "Waiting for your opponent…"}
                    </Typography>
                </Box>
            )}

            {/* Fires once, right before the L3 picks, the moment the server reveals the map type. */}
            <MapRevealModal mapType={mapType} />

            {/* The rail sits at the bottom of the screen: the step you are on is the screen itself, the rail
                is only there to show how far the draft has come. */}
            <Box sx={{ mt: "auto", pt: 3, width: "100%", display: "flex", justifyContent: "center" }}>
                <DraftStepper step={currentStep(pickPhase, requiredLevel)} />
            </Box>
        </Sheet>
    );
};

const PHASE_NAME: Record<number, string> = {
    [PickPhaseVals.PERK]: "Choose your doctrine",
    [PickPhaseVals.INITIAL_PICK]: "Choose your starting bundle",
    [PickPhaseVals.PICK]: "Pick a creature",
    [PickPhaseVals.ARTIFACT_2]: "Choose a Tier-2 artifact",
    [PickPhaseVals.AUGMENTS]: "Preparing placement…",
    [PickPhaseVals.AUGMENTS_SCOUT]: "Preparing placement…",
};

function title(phase: number, level = 0): string {
    if (phase === PickPhaseVals.PICK && level >= 1) {
        return `Pick a Level ${level} creature`;
    }
    return PHASE_NAME[phase] ?? "Pick phase";
}

export default StainedGlassWindow;
