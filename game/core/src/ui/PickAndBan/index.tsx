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
import {
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    CircularProgress,
    Divider,
    Modal,
    ModalDialog,
    Sheet,
    Tooltip,
    Typography,
} from "@mui/joy";
import React, { useEffect, useState } from "react";

import { images as rawImages } from "../../generated/image_imports";
import { usePickBanEvents } from "../context/PickBanContext";
import { useAuthContext } from "../auth/context/auth_context";
import { UNIT_ID_TO_IMAGE, UNIT_ID_TO_NAME } from "../unit_ui_constants";
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

const StatCell: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
    <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}>
        <Typography level="body-xs" sx={{ opacity: 0.6 }}>
            {label}
        </Typography>
        <Typography level="body-xs" sx={{ fontWeight: 700 }}>
            {value}
        </Typography>
    </Box>
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
                position: "fixed",
                left: 16,
                top: 96,
                zIndex: 6,
                width: 248,
                maxHeight: "calc(100vh - 120px)",
                overflowY: "auto",
                p: 1.5,
                borderRadius: "14px",
                bgcolor: "rgba(8,10,18,0.94)",
                border: "1px solid rgba(255,255,255,0.14)",
                boxShadow: "0 8px 28px rgba(0,0,0,0.5)",
                color: "#e7e9f0",
                display: { xs: "none", md: "block" },
            }}
        >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                {img && (
                    <Box
                        component="img"
                        src={img}
                        alt={c.name}
                        sx={{ width: 48, height: 48, borderRadius: "8px", objectFit: "cover" }}
                    />
                )}
                <Box>
                    <Typography level="title-sm">{c.name}</Typography>
                    <Typography level="body-xs" sx={{ opacity: 0.65 }}>
                        {entry.faction} · Lvl {c.level} · {c.size === 2 ? "2×2" : "1×1"}
                    </Typography>
                </Box>
            </Box>
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: 1.5, rowGap: 0.25, mb: 1 }}>
                <StatCell label="HP" value={c.hp} />
                <StatCell label="Armor" value={c.armor} />
                <StatCell label="Attack" value={c.attack} />
                <StatCell label="Damage" value={`${c.attack_damage_min}–${c.attack_damage_max}`} />
                <StatCell label="Speed" value={c.speed} />
                <StatCell label="Move" value={Math.round(c.steps)} />
                <StatCell label="Type" value={isRanged ? "Ranged" : "Melee"} />
                <StatCell label="Resist" value={`${c.magic_resist}%`} />
                {isRanged && <StatCell label="Shots" value={c.range_shots} />}
                {isRanged && <StatCell label="Range" value={c.shot_distance} />}
            </Box>
            <Divider sx={{ my: 0.75 }} />
            <Typography level="body-xs" sx={{ opacity: 0.6, textTransform: "uppercase", letterSpacing: 0.5, mb: 0.5 }}>
                Abilities
            </Typography>
            {abilities.length === 0 ? (
                <Typography level="body-xs" sx={{ opacity: 0.55 }}>
                    No special abilities.
                </Typography>
            ) : (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                    {abilities.map((ability) => {
                        const desc = abilityDescription(ability);
                        return (
                            <Box key={ability}>
                                <Typography level="body-xs" sx={{ fontWeight: 700, color: "#9fd0ff" }}>
                                    {ability}
                                </Typography>
                                {desc && (
                                    <Typography level="body-xs" sx={{ opacity: 0.8, lineHeight: 1.25 }}>
                                        {desc}
                                    </Typography>
                                )}
                            </Box>
                        );
                    })}
                </Box>
            )}
        </Sheet>
    );
};

// Confirmation modal shown when a player clicks a creature to pick: a centered portrait + stats + abilities
// (the same detail the hover panel shows on the left) with Confirm / Cancel buttons. The pick only fires on
// Confirm, so the player can review the unit before committing (instead of the previous instant-pick-on-click).
const PickConfirmModal: React.FC<{
    open: boolean;
    creatureId: number;
    busy: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}> = ({ open, creatureId, busy, onConfirm, onCancel }) => {
    const entry = creatureFullConfig(creatureId);
    const img = creatureImage(creatureId);
    return (
        <Modal open={open} onClose={onCancel}>
            <ModalDialog
                sx={{
                    bgcolor: "rgba(8,10,18,0.97)",
                    border: "1px solid rgba(255,255,255,0.16)",
                    color: "#e7e9f0",
                    borderRadius: "14px",
                    maxWidth: 360,
                    width: "90vw",
                }}
            >
                {entry ? (
                    <>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1 }}>
                            {img && (
                                <Box
                                    component="img"
                                    src={img}
                                    alt={entry.config.name}
                                    sx={{ width: 64, height: 64, borderRadius: "10px", objectFit: "cover" }}
                                />
                            )}
                            <Box>
                                <Typography level="title-md">{entry.config.name}</Typography>
                                <Typography level="body-xs" sx={{ opacity: 0.65 }}>
                                    {entry.faction} · Lvl {entry.config.level} ·{" "}
                                    {entry.config.size === 2 ? "2×2" : "1×1"}
                                </Typography>
                            </Box>
                        </Box>
                        <Box
                            sx={{
                                display: "grid",
                                gridTemplateColumns: "1fr 1fr",
                                columnGap: 1.5,
                                rowGap: 0.25,
                                mb: 1,
                            }}
                        >
                            <StatCell label="HP" value={entry.config.hp} />
                            <StatCell label="Armor" value={entry.config.armor} />
                            <StatCell label="Attack" value={entry.config.attack} />
                            <StatCell
                                label="Damage"
                                value={`${entry.config.attack_damage_min}–${entry.config.attack_damage_max}`}
                            />
                            <StatCell label="Speed" value={entry.config.speed} />
                            <StatCell label="Move" value={Math.round(entry.config.steps)} />
                            <StatCell label="Type" value={entry.config.attack_type === "RANGE" ? "Ranged" : "Melee"} />
                            <StatCell label="Resist" value={`${entry.config.magic_resist}%`} />
                        </Box>
                        <Divider sx={{ my: 0.5 }} />
                        <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1, mt: 1 }}>
                            <Button variant="soft" color="neutral" onClick={onCancel} disabled={busy}>
                                Cancel
                            </Button>
                            <Button variant="solid" color="success" onClick={onConfirm} loading={busy}>
                                Confirm pick
                            </Button>
                        </Box>
                    </>
                ) : (
                    <>
                        <Typography level="title-md">{creatureName(creatureId)}</Typography>
                        <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1, mt: 2 }}>
                            <Button variant="soft" color="neutral" onClick={onCancel} disabled={busy}>
                                Cancel
                            </Button>
                            <Button variant="solid" color="success" onClick={onConfirm} loading={busy}>
                                Confirm pick
                            </Button>
                        </Box>
                    </>
                )}
            </ModalDialog>
        </Modal>
    );
};

// Confirmation modal for a Tier-2 artifact pick: shows the artifact icon + name + description with Confirm /
// Cancel buttons. Mirrors PickConfirmModal — the pick only fires on Confirm, so the player reviews the effect
// before committing.
const ArtifactConfirmModal: React.FC<{
    open: boolean;
    artifactId: number;
    busy: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}> = ({ open, artifactId, busy, onConfirm, onCancel }) => {
    const a = artifactId ? Artifact.getTier2ArtifactProperties(artifactId as Artifact.Tier2Artifact) : undefined;
    const img = a ? images[a.imageKey] : undefined;
    return (
        <Modal open={open} onClose={onCancel}>
            <ModalDialog
                sx={{
                    bgcolor: "rgba(8,10,18,0.97)",
                    border: "1px solid rgba(255,255,255,0.16)",
                    color: "#e7e9f0",
                    borderRadius: "14px",
                    maxWidth: 360,
                    width: "90vw",
                }}
            >
                {a ? (
                    <>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1 }}>
                            {img && (
                                <Box
                                    component="img"
                                    src={img}
                                    alt={a.name}
                                    sx={{ width: 56, height: 56, objectFit: "contain" }}
                                />
                            )}
                            <Typography level="title-md">{a.name}</Typography>
                        </Box>
                        <Typography
                            level="body-xs"
                            sx={{ opacity: 0.6, textTransform: "uppercase", letterSpacing: 0.5, mb: 0.5 }}
                        >
                            Tier-2 artifact
                        </Typography>
                        <Typography level="body-sm" sx={{ opacity: 0.9 }}>
                            {Artifact.formatArtifactDescription(a)}
                        </Typography>
                        <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1, mt: 2 }}>
                            <Button variant="soft" color="neutral" onClick={onCancel} disabled={busy}>
                                Cancel
                            </Button>
                            <Button variant="solid" color="success" onClick={onConfirm} loading={busy}>
                                Confirm pick
                            </Button>
                        </Box>
                    </>
                ) : (
                    <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1, mt: 2 }}>
                        <Button variant="soft" color="neutral" onClick={onCancel} disabled={busy}>
                            Cancel
                        </Button>
                    </Box>
                )}
            </ModalDialog>
        </Modal>
    );
};

// Emoji cue per perk (Scout / Spymaster / Blind Fury) so the vision trade-off reads at a glance.
const PERK_ICON: Record<number, string> = {
    [Perk.Perk.THREE_REVEALS]: "🔍",
    [Perk.Perk.SEE_ALL]: "👁️",
    [Perk.Perk.SEE_NONE]: "🚫",
};

const PHASE_HINT: Record<number, string> = {
    [PickPhaseVals.PERK]:
        "Choose your scouting doctrine. It lasts the whole draft and decides which of the opponent's army slots you can watch.",
    [PickPhaseVals.INITIAL_PICK]: "Each bundle gives you two creatures and a Tier-1 artifact. Pick one.",
    [PickPhaseVals.PICK]:
        "Greyed portraits are banned. Opponent picks are hidden — if you pick one they already took, you'll re-pick.",
    [PickPhaseVals.ARTIFACT_2]: "Choose one Tier-2 artifact for your whole army.",
    [PickPhaseVals.AUGMENTS]: "Get ready to place your army.",
    [PickPhaseVals.AUGMENTS_SCOUT]: "Get ready to place your army.",
};

// The full "How to Play" guide (covers the whole draft). Opened in a new tab from the Rules link.
const RULES_URL = "https://heroesofcrypto.io/rules";

// One imperative line telling the player exactly what to do THIS stage (distinct from the contextual hint).
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

// ---- Draft progress stepper ----------------------------------------------

// Doctrine and the starting bundle are now separate first steps.
const STEP_LABELS = ["Doctrine", "Bundle", "Lvl 1", "Lvl 2", "Lvl 3", "Artifact", "Lvl 4", "Place"];

const currentStep = (phase: number, level: number): number => {
    switch (phase) {
        case PickPhaseVals.PERK: // doctrine
            return 0;
        case PickPhaseVals.INITIAL_PICK: // starting bundle
            return 1;
        case PickPhaseVals.ARTIFACT_2:
            return 5;
        case PickPhaseVals.AUGMENTS:
        case PickPhaseVals.AUGMENTS_SCOUT:
            return 7;
        case PickPhaseVals.PICK:
            // L1->2, L2->3, L3->4, L4->6 (artifact sits at 5 between L3 and L4).
            return level === 4 ? 6 : level + 1;
        default:
            return -1;
    }
};

const Stepper: React.FC<{ step: number }> = ({ step }) => (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexWrap: "wrap", justifyContent: "center" }}>
        {STEP_LABELS.map((label, i) => {
            const done = i < step;
            const active = i === step;
            return (
                <React.Fragment key={label}>
                    <Chip
                        size="sm"
                        variant={active ? "solid" : "soft"}
                        color={active ? "primary" : done ? "success" : "neutral"}
                        sx={{ opacity: active || done ? 1 : 0.5 }}
                    >
                        {done ? "✓ " : ""}
                        {label}
                    </Chip>
                    {i < STEP_LABELS.length - 1 && (
                        <Box sx={{ width: 10, height: 2, bgcolor: i < step ? "success.500" : "neutral.700" }} />
                    )}
                </React.Fragment>
            );
        })}
    </Box>
);

// ---- Shared portrait tile -------------------------------------------------

type PortraitState = "available" | "picked" | "taken" | "banned";

const STATE_HINT: Record<PortraitState, string> = {
    available: "",
    picked: "In your army",
    taken: "Taken by your opponent",
    banned: "Banned",
};

const CreaturePortrait: React.FC<{
    creatureId: number;
    state: PortraitState;
    disabled?: boolean;
    size?: number;
    onClick?: () => void;
    onInspect?: (creatureId: number) => void;
}> = ({ creatureId, state, disabled, size = 104, onClick, onInspect }) => {
    const src = creatureImage(creatureId);
    const selectable = state === "available" && !disabled && !!onClick;
    const ring =
        state === "picked" ? "#3B9B5C" : state === "banned" || state === "taken" ? "#8a2b2b" : "rgba(255,255,255,0.18)";
    const tip = STATE_HINT[state] ? `${creatureName(creatureId)} — ${STATE_HINT[state]}` : creatureName(creatureId);
    return (
        <Tooltip title={tip} variant="soft" placement="top">
            <Box
                onClick={selectable ? onClick : undefined}
                onMouseEnter={() => onInspect?.(creatureId)}
                sx={{
                    position: "relative",
                    width: size,
                    height: size,
                    borderRadius: "10px",
                    overflow: "hidden",
                    border: `2px solid ${ring}`,
                    cursor: selectable ? "pointer" : "default",
                    opacity: state === "available" ? 1 : 0.5,
                    // NOTE: the grayscale filter is applied to the <img> below, NOT to this wrapper. Putting it
                    // on the wrapper would also desaturate the red ban slash (CSS filters affect all descendants),
                    // turning the crimson Dota strike grey/black. Keep the wrapper filter-free so the slash stays red.
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
                    // Dota-style ban: a thick crimson diagonal band corner-to-corner across a greyscale
                    // portrait (the grayscale filter is applied on the portrait wrapper above). The band has
                    // a vertical light-to-dark gradient (highlight on top, deep crimson below), a thin
                    // near-black core stroke down the middle, and a wide red glow — mirroring the heavy red
                    // "X" strikethrough Dota paints over banned heroes.
                    <Box
                        aria-hidden
                        sx={{
                            position: "absolute",
                            top: "50%",
                            left: "50%",
                            width: size * 1.55,
                            height: Math.max(9, Math.round(size * 0.12)),
                            transform: "translate(-50%, -50%) rotate(45deg)",
                            background: "linear-gradient(180deg, #ff5a5a 0%, #e8202a 45%, #b8131c 100%)",
                            borderTop: "1px solid rgba(255,180,180,0.85)",
                            borderBottom: "2px solid rgba(0,0,0,0.55)",
                            boxShadow: "0 0 10px rgba(232,32,42,0.9), inset 0 0 4px rgba(0,0,0,0.45)",
                            pointerEvents: "none",
                            "&::after": {
                                // Thin dark center seam for the layered "embossed" look.
                                content: '""',
                                position: "absolute",
                                inset: 0,
                                borderTop: "1px solid rgba(0,0,0,0.35)",
                            },
                        }}
                    />
                )}
                {state === "picked" && (
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
}> = ({ bundles, disabled, selected, onSelect, onInspect }) => (
    <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap", justifyContent: "center" }}>
        {bundles.map((bundle, index) => {
            const [l1, l2, artifactId] = bundle;
            const artifact = Artifact.getTier1ArtifactProperties(artifactId as Artifact.Tier1Artifact);
            const artifactImg = images[artifact.imageKey];
            const isSelected = selected === index;
            return (
                <Card
                    key={index}
                    variant={isSelected ? "solid" : "outlined"}
                    color={isSelected ? "primary" : "neutral"}
                    sx={{ width: 280, bgcolor: isSelected ? undefined : "rgba(0,0,0,0.35)" }}
                >
                    <CardContent sx={{ alignItems: "center", gap: 1.5 }}>
                        <Typography level="title-md">Bundle {index + 1}</Typography>
                        <Box sx={{ display: "flex", gap: 2 }}>
                            {[
                                { id: l1, tag: "Lvl 1" },
                                { id: l2, tag: "Lvl 2" },
                            ].map(({ id, tag }) => (
                                <Box
                                    key={tag}
                                    sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0.5 }}
                                >
                                    <CreaturePortrait
                                        creatureId={id}
                                        state="available"
                                        disabled
                                        onInspect={onInspect}
                                    />
                                    <Typography level="body-xs" sx={{ opacity: 0.7 }}>
                                        {tag}: {creatureName(id)}
                                    </Typography>
                                </Box>
                            ))}
                        </Box>
                        <Divider sx={{ my: 0.5 }} />
                        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0.5 }}>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                {artifactImg && (
                                    <img
                                        src={artifactImg}
                                        alt={artifact.name}
                                        style={{ width: 34, height: 34, objectFit: "contain" }}
                                    />
                                )}
                                <Box>
                                    <Typography level="body-xs" sx={{ opacity: 0.7 }}>
                                        Tier-1 artifact
                                    </Typography>
                                    <Typography level="body-sm">{artifact.name}</Typography>
                                </Box>
                            </Box>
                            <Typography level="body-xs" sx={{ opacity: 0.85, textAlign: "center" }}>
                                {Artifact.formatArtifactDescription(artifact)}
                            </Typography>
                        </Box>
                        <Button
                            disabled={disabled}
                            variant={isSelected ? "soft" : "solid"}
                            onClick={() => onSelect(index)}
                            fullWidth
                        >
                            {isSelected ? "✓ Chosen" : "Pick bundle"}
                        </Button>
                    </CardContent>
                </Card>
            );
        })}
    </Box>
);

const Legend: React.FC = () => (
    <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", justifyContent: "center", opacity: 0.85 }}>
        <Chip size="sm" variant="soft" color="neutral">
            ◻ Available
        </Chip>
        <Chip size="sm" variant="soft" color="success">
            ✓ Yours
        </Chip>
        <Chip size="sm" variant="soft" color="danger">
            ⟋ Taken / banned
        </Chip>
    </Box>
);

const PickPanel: React.FC<{
    level: number;
    banned: number[];
    picked: number[];
    opponentTaken: number[];
    disabled: boolean;
    onSelect: (creatureId: number) => void;
    onInspect?: (creatureId: number) => void;
}> = ({ level, banned, picked, opponentTaken, disabled, onSelect, onInspect }) => {
    const bannedSet = new Set(banned);
    const pickedSet = new Set(picked);
    const takenSet = new Set(opponentTaken);
    const creatures = level >= 1 ? getCreaturesByLevel(level) : [];
    const available = creatures.filter((c) => !bannedSet.has(c) && !pickedSet.has(c) && !takenSet.has(c)).length;
    return (
        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1.5 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Chip color="primary" variant="soft">
                    Level {level}
                </Chip>
                <Typography level="body-sm" sx={{ opacity: 0.75 }}>
                    {available} available
                </Typography>
            </Box>
            <Legend />
            {/* Two balanced rows: ceil(N/2) columns puts half the creatures on each row (top row gets the
                extra when the count is odd) instead of a lopsided wrap. */}
            <Box
                sx={{
                    display: "grid",
                    gridTemplateColumns: `repeat(${Math.max(1, Math.ceil(creatures.length / 2))}, auto)`,
                    gap: 1.75,
                    justifyContent: "center",
                }}
            >
                {creatures.map((creatureId) => {
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
                            onClick={() => onSelect(creatureId)}
                            onInspect={onInspect}
                        />
                    );
                })}
            </Box>
        </Box>
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
        <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", justifyContent: "center", maxWidth: 640 }}>
            {offeredIds.map((id) => {
                const a = Artifact.getTier2ArtifactProperties(id as Artifact.Tier2Artifact);
                const img = images[a.imageKey];
                const isSelected = selected === a.id;
                return (
                    <Tooltip key={a.id} title={Artifact.formatArtifactDescription(a)} variant="soft" placement="top">
                        <Card
                            variant={isSelected ? "solid" : "outlined"}
                            color={isSelected ? "primary" : "neutral"}
                            onClick={disabled ? undefined : () => onSelect(a.id)}
                            sx={{
                                width: 200,
                                bgcolor: isSelected ? undefined : "rgba(0,0,0,0.35)",
                                cursor: disabled ? "default" : "pointer",
                                "&:hover": disabled ? undefined : { boxShadow: "0 0 12px rgba(120,180,255,0.55)" },
                            }}
                        >
                            <CardContent sx={{ alignItems: "center", gap: 0.5, p: 1.25 }}>
                                {img && (
                                    <img
                                        src={img}
                                        alt={a.name}
                                        style={{ width: 46, height: 46, objectFit: "contain" }}
                                    />
                                )}
                                <Typography level="body-sm" sx={{ textAlign: "center", fontWeight: 600 }}>
                                    {a.name}
                                </Typography>
                                <Typography level="body-xs" sx={{ textAlign: "center", opacity: 0.85 }}>
                                    {Artifact.formatArtifactDescription(a)}
                                </Typography>
                                {isSelected && (
                                    <Chip size="sm" color="primary" variant="soft">
                                        ✓ Chosen
                                    </Chip>
                                )}
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
                position: "sticky",
                bottom: 0,
                mt: "auto",
                width: "100%",
                display: "flex",
                justifyContent: "center",
                pt: 1.5,
                pointerEvents: "none",
            }}
        >
            <Sheet
                variant="soft"
                sx={{
                    pointerEvents: "auto",
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    px: 2,
                    py: 1,
                    maxWidth: "94%",
                    flexWrap: "wrap",
                    justifyContent: "center",
                    borderRadius: "14px",
                    bgcolor: "rgba(8,10,18,0.92)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    boxShadow: "0 -6px 24px rgba(0,0,0,0.5)",
                    color: "#e7e9f0",
                }}
            >
                <Typography level="body-xs" sx={{ opacity: 0.6, textTransform: "uppercase", letterSpacing: 0.6 }}>
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
}> = ({ opponentPicked, opponentLabel, watchedSlots, onInspect }) => {
    // Build the 6 fixed level-ordered slots directly from the slot-aligned reveal array (no bucketing), so each
    // creature lands at its real slot index — preserving bundle-vs-picked ordering within a level.
    const slots = ARMY_LAYOUT.map((level, i) => ({ id: opponentPicked[i] ?? 0, level }));
    // The exact slot indices your doctrine watches, straight from the server (NOT the first-N slots): the Scout
    // doctrine watches three tier-block-random slots the server seeded, so the eye lands on the SAME slot the
    // reveal flips — no longer a misleading fixed 1-2-3. A watched-but-not-yet-picked slot shows the eye.
    const watched = new Set(watchedSlots);
    return (
        <Box sx={{ width: "100%", display: "flex", justifyContent: "center", pt: 1.5, pointerEvents: "none" }}>
            <Sheet
                variant="soft"
                sx={{
                    pointerEvents: "auto",
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    px: 2,
                    py: 0.75,
                    maxWidth: "94%",
                    flexWrap: "wrap",
                    justifyContent: "center",
                    borderRadius: "14px",
                    bgcolor: "rgba(18,8,10,0.9)",
                    border: "1px solid rgba(255,120,120,0.22)",
                    color: "#f0e7e9",
                }}
            >
                <Typography level="body-xs" sx={{ opacity: 0.6, textTransform: "uppercase", letterSpacing: 0.6 }}>
                    {opponentLabel}&apos;s army
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
    // "Taken" units are ONLY the ones we've collided on locally — the server never reveals opponent picks.
    const opponentTaken = collided;
    const isHandoff = pickPhase === PickPhaseVals.AUGMENTS || pickPhase === PickPhaseVals.AUGMENTS_SCOUT;
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
        // Doctrine-only phase: choose one scouting doctrine.
        panel = (
            <PerkPanel
                disabled={disabled || perkLocked}
                selected={perkLocked ? perk : selectedValue}
                onSelect={(id) => void send(id, () => sendPerk(id))}
            />
        );
    } else if (pickPhase === PickPhaseVals.INITIAL_PICK) {
        // Starting-bundle phase: choose one bundle {L1 + L2 + Tier-1 artifact}.
        panel = (
            <BundlePanel
                bundles={initialBundles}
                disabled={disabled || bundleLocked}
                selected={bundleChosenIndex}
                onSelect={(i) => void send(i, () => pickPair(i))}
                onInspect={setInspectedId}
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
                    onSelect={(id) => setPendingPick(id)}
                    onInspect={setInspectedId}
                />
            </Box>
        );
    } else if (pickPhase === PickPhaseVals.ARTIFACT_2) {
        panel = (
            <ArtifactPanel
                disabled={disabled}
                selected={selectedValue}
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
                height: "100%",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 2,
                p: 3,
                bgcolor: "rgba(8,10,18,0.94)",
                color: "#e7e9f0",
                overflowY: "auto",
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

            <Stepper step={currentStep(pickPhase, requiredLevel)} />

            <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0.5 }}>
                <Typography level="h3" sx={{ color: "#e7e9f0" }}>
                    {title(pickPhase)}
                </Typography>
                {hint && (
                    <Typography level="body-sm" sx={{ opacity: 0.7, textAlign: "center", maxWidth: 560 }}>
                        {hint}
                    </Typography>
                )}
            </Box>

            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
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
                {secondsRemaining >= 0 && !isHandoff && (
                    <Timer localSeconds={secondsRemaining} isYourTurn={!!isYourTurn} />
                )}
                {/* Reads "Map: ?" until the server reveals the map right before the L3 picks, then the name. */}
                <MapBadge mapType={mapType} />
            </Box>

            {/* Imperative "what to do now" so first-time players always know the expected action. */}
            {isYourTurn && !isHandoff && phaseAction(pickPhase, requiredLevel) && (
                <Typography level="title-sm" sx={{ color: "#7CFC9B", fontWeight: 700, textAlign: "center", mt: -0.5 }}>
                    👉 {phaseAction(pickPhase, requiredLevel)}
                </Typography>
            )}

            <Box sx={{ mt: 1, display: "flex", justifyContent: "center", width: "100%" }}>
                {userTeam ? panel : null}
            </Box>

            {/* Each phase is a simultaneous both-teams choice; show "waiting" while the opponent hasn't acted. */}
            {!isYourTurn && !isHandoff && (
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, opacity: 0.7 }}>
                    <CircularProgress size="sm" />
                    <Typography level="body-sm">
                        {selectedValue >= 0 ? "Locked in — waiting for your opponent…" : "Waiting for your opponent…"}
                    </Typography>
                </Box>
            )}

            <CreatureDetailPanel creatureId={inspectedId} />

            <PickConfirmModal
                open={pendingPick > 0 && pickPhase === PickPhaseVals.PICK}
                creatureId={pendingPick}
                busy={busy}
                onConfirm={() => {
                    const id = pendingPick;
                    setPendingPick(0);
                    void pickCreature(id);
                }}
                onCancel={() => setPendingPick(0)}
            />
            <ArtifactConfirmModal
                open={pendingArtifact > 0 && pickPhase === PickPhaseVals.ARTIFACT_2}
                artifactId={pendingArtifact}
                busy={busy}
                onConfirm={() => {
                    const id = pendingArtifact;
                    setPendingArtifact(0);
                    void send(id, () => artifact(id, 2));
                }}
                onCancel={() => setPendingArtifact(0)}
            />
            {/* Fires once, right before the L3 picks, the moment the server reveals the map type. */}
            <MapRevealModal mapType={mapType} />

            {/* Both draft bars share ONE mt:auto wrapper so they stack together at the bottom (two separate
                mt:auto flex items would split the free space and float the opponent bar mid-screen). */}
            <Box sx={{ mt: "auto", width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
                <OpponentDraftBar
                    opponentPicked={opponentPicked}
                    opponentLabel={opponentLabel}
                    watchedSlots={watchedSlots}
                    onInspect={setInspectedId}
                />

                <MyDraftBar
                    perk={perk}
                    picked={picked}
                    artifactTier1={artifactTier1}
                    artifactTier2={artifactTier2}
                    onInspect={setInspectedId}
                />
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

function title(phase: number): string {
    return PHASE_NAME[phase] ?? "Pick phase";
}

export default StainedGlassWindow;
