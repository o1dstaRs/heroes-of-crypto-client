import {
    Artifact,
    CreatureVals,
    getCreaturesByLevel,
    Perk,
    PickPhaseVals,
    type TeamType,
} from "@heroesofcrypto/common";
import { Box, Button, Card, CardContent, Chip, CircularProgress, Divider, Sheet, Tooltip, Typography } from "@mui/joy";
import React, { useEffect, useState } from "react";

import { images as rawImages } from "../../generated/image_imports";
import { usePickBanEvents } from "../context/PickBanContext";
import { useAuthContext } from "../auth/context/auth_context";
import { UNIT_ID_TO_IMAGE, UNIT_ID_TO_NAME } from "../unit_ui_constants";
import { Timer } from "./Timer";

const images = rawImages as Record<string, string>;

const creatureName = (creatureId: number): string => UNIT_ID_TO_NAME[creatureId] ?? `Creature ${creatureId}`;
const creatureImage = (creatureId: number): string | undefined => UNIT_ID_TO_IMAGE[creatureId];

// Emoji cue per perk (Scout / Spymaster / Blind Fury) so the vision trade-off reads at a glance.
const PERK_ICON: Record<number, string> = {
    [Perk.Perk.THREE_REVEALS]: "🔍",
    [Perk.Perk.SEE_ALL]: "👁️",
    [Perk.Perk.SEE_NONE]: "🚫",
};

const PHASE_HINT: Record<number, string> = {
    [PickPhaseVals.PERK]:
        "Choose your doctrine AND a starting bundle. Doctrine lasts the whole draft; each bundle gives two creatures and a Tier-1 artifact.",
    [PickPhaseVals.INITIAL_PICK]: "Each bundle gives you two creatures and a Tier-1 artifact. Pick one.",
    [PickPhaseVals.PICK]: "Greyed portraits are banned or already taken by your opponent.",
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
            return "Pick one doctrine and one starting bundle to continue.";
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

// Doctrine + Bundle are chosen together in one combined first step.
const STEP_LABELS = ["Doctrine + Bundle", "Lvl 1", "Lvl 2", "Lvl 3", "Artifact", "Lvl 4", "Place"];

const currentStep = (phase: number, level: number): number => {
    switch (phase) {
        case PickPhaseVals.PERK: // combined doctrine + bundle
            return 0;
        case PickPhaseVals.ARTIFACT_2:
            return 4;
        case PickPhaseVals.AUGMENTS:
        case PickPhaseVals.AUGMENTS_SCOUT:
            return 6;
        case PickPhaseVals.PICK:
            return level === 4 ? 5 : level; // L1->1, L2->2, L3->3, L4->5
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
}> = ({ creatureId, state, disabled, size = 104, onClick }) => {
    const src = creatureImage(creatureId);
    const selectable = state === "available" && !disabled && !!onClick;
    const ring =
        state === "picked" ? "#3B9B5C" : state === "banned" || state === "taken" ? "#8a2b2b" : "rgba(255,255,255,0.18)";
    const tip = STATE_HINT[state] ? `${creatureName(creatureId)} — ${STATE_HINT[state]}` : creatureName(creatureId);
    return (
        <Tooltip title={tip} variant="soft" placement="top">
            <Box
                onClick={selectable ? onClick : undefined}
                sx={{
                    position: "relative",
                    width: size,
                    height: size,
                    borderRadius: "10px",
                    overflow: "hidden",
                    border: `2px solid ${ring}`,
                    cursor: selectable ? "pointer" : "default",
                    opacity: state === "available" ? 1 : 0.5,
                    filter: state === "banned" || state === "taken" ? "grayscale(1)" : "none",
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
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                ) : (
                    <Typography level="body-xs" sx={{ p: 1 }}>
                        {creatureName(creatureId)}
                    </Typography>
                )}
                {(state === "banned" || state === "taken") && (
                    <Box
                        sx={{
                            position: "absolute",
                            inset: 0,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#ff6b6b",
                            fontSize: size * 0.45,
                            fontWeight: 700,
                        }}
                    >
                        ✕
                    </Box>
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
}> = ({ bundles, disabled, selected, onSelect }) => (
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
                                    <CreaturePortrait creatureId={id} state="available" disabled />
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
            ✕ Taken / banned
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
}> = ({ level, banned, picked, opponentTaken, disabled, onSelect }) => {
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

// Sticky bottom-center summary of the player's own draft so far — chosen doctrine (perk), picked units, and
// picked artifacts. Stays pinned as the draft advances so the player always sees the army they're building.
const MyDraftBar: React.FC<{
    perk: number;
    picked: number[];
    artifactTier1: number;
    artifactTier2: number;
}> = ({ perk, picked, artifactTier1, artifactTier2 }) => {
    const units = picked.filter((id) => id && id !== CreatureVals.NO_CREATURE);
    const t1 = artifactTier1 ? Artifact.getTier1ArtifactProperties(artifactTier1 as Artifact.Tier1Artifact) : undefined;
    const t2 = artifactTier2 ? Artifact.getTier2ArtifactProperties(artifactTier2 as Artifact.Tier2Artifact) : undefined;
    const artifacts = [t1, t2].filter((a): a is Artifact.ArtifactProperties => !!a);
    if (!perk && !units.length && !artifacts.length) {
        return null;
    }
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
                {units.length > 0 && (
                    <>
                        <BarDivider />
                        <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                            {units.map((id, i) => {
                                const src = creatureImage(id);
                                return (
                                    <Tooltip key={`${id}-${i}`} title={creatureName(id)} variant="soft">
                                        <Box
                                            sx={{
                                                width: 34,
                                                height: 34,
                                                borderRadius: "7px",
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
                            })}
                        </Box>
                    </>
                )}
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
    height?: number;
}

const StainedGlassWindow: React.FC<StainedGlassProps> = ({ userTeam }) => {
    const {
        pickPhase,
        isYourTurn,
        secondsRemaining,
        initialBundles,
        tier2Offers,
        requiredLevel,
        banned,
        picked,
        opponentPicked,
        perk,
        upgradePoints,
        artifactTier1,
        artifactTier2,
    } = usePickBanEvents();
    const { perk: sendPerk, pickPair, pick, artifact } = useAuthContext();
    const [busy, setBusy] = useState(false);
    // Remember what the player chose this phase so the UI can confirm it while the opponent acts.
    const [selection, setSelection] = useState<{ phase: number; value: number } | null>(null);
    // Combined PERK phase does TWO independent actions on one screen, so it needs its own local choices
    // (the single `selection` can't hold both). Locks are derived from authoritative server state below.
    const [setupBundleChoice, setSetupBundleChoice] = useState<number>(-1);

    // Clear the local selections whenever the phase advances.
    useEffect(() => {
        setSelection((prev) => (prev && prev.phase === pickPhase ? prev : null));
        setSetupBundleChoice(-1);
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

    const disabled = !isYourTurn || busy;
    const selectedValue = selection && selection.phase === pickPhase ? selection.value : -1;
    const hint = PHASE_HINT[pickPhase] ?? "";
    const opponentTaken = opponentPicked.filter((id) => id && id !== CreatureVals.NO_CREATURE);
    const isHandoff = pickPhase === PickPhaseVals.AUGMENTS || pickPhase === PickPhaseVals.AUGMENTS_SCOUT;
    const isCombinedSetup = pickPhase === PickPhaseVals.PERK;
    // Authoritative per-dimension locks for the combined phase: the server echoes the player's own perk
    // (perk > 0) and their bundle (picked.length > 0), so both survive reload and disable their panel.
    const perkLocked = isCombinedSetup && perk > 0;
    const bundleLocked = isCombinedSetup && picked.length > 0;
    // Which bundle was chosen — local index if just picked, else recover it from the picked creatures.
    const bundleChosenIndex =
        setupBundleChoice >= 0
            ? setupBundleChoice
            : bundleLocked
              ? initialBundles.findIndex((b) => b[0] === picked[0] && b[1] === picked[1])
              : -1;
    const setupBothLocked = perkLocked && bundleLocked;

    let panel: React.ReactNode = <CircularProgress />;
    if (isCombinedSetup) {
        // Combined first step: choose a doctrine AND a starting bundle on one screen, each locking independently.
        panel = (
            <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2.5, width: "100%" }}>
                <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                    <Chip size="sm" variant="soft" color={perkLocked ? "success" : "primary"}>
                        1 · Doctrine {perkLocked ? "✓" : ""}
                    </Chip>
                    <PerkPanel
                        disabled={busy || perkLocked}
                        selected={perkLocked ? perk : selectedValue}
                        onSelect={(id) => void send(id, () => sendPerk(id))}
                    />
                </Box>
                <Divider sx={{ width: "80%" }} />
                <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                    <Chip size="sm" variant="soft" color={bundleLocked ? "success" : "primary"}>
                        2 · Starting bundle {bundleLocked ? "✓" : ""}
                    </Chip>
                    <BundlePanel
                        bundles={initialBundles}
                        disabled={busy || bundleLocked}
                        selected={bundleChosenIndex}
                        onSelect={(i) => {
                            setSetupBundleChoice(i);
                            void send(i, () => pickPair(i));
                        }}
                    />
                </Box>
            </Box>
        );
    } else if (pickPhase === PickPhaseVals.INITIAL_PICK) {
        // Legacy in-flight picks only — new picks fold the bundle into the combined PERK phase above.
        panel = (
            <BundlePanel
                bundles={initialBundles}
                disabled={disabled}
                selected={selectedValue}
                onSelect={(i) => void send(i, () => pickPair(i))}
            />
        );
    } else if (pickPhase === PickPhaseVals.PICK) {
        panel = (
            <PickPanel
                level={requiredLevel}
                banned={banned}
                picked={picked}
                opponentTaken={opponentTaken}
                disabled={disabled}
                onSelect={(id) => void send(id, () => pick(id))}
            />
        );
    } else if (pickPhase === PickPhaseVals.ARTIFACT_2) {
        panel = (
            <ArtifactPanel
                disabled={disabled}
                selected={selectedValue}
                offered={tier2Offers}
                onSelect={(id) => void send(id, () => artifact(id, 2))}
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
                    {isYourTurn ? "Your turn" : "Opponent's turn"}
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

            {/* In the combined phase both players are actors, so gate the wait on having locked BOTH choices. */}
            {((!isYourTurn && !isHandoff) || setupBothLocked) && (
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, opacity: 0.7 }}>
                    <CircularProgress size="sm" />
                    <Typography level="body-sm">
                        {setupBothLocked || selectedValue >= 0
                            ? "Locked in — waiting for your opponent…"
                            : "Waiting for your opponent…"}
                    </Typography>
                </Box>
            )}

            <MyDraftBar perk={perk} picked={picked} artifactTier1={artifactTier1} artifactTier2={artifactTier2} />
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
