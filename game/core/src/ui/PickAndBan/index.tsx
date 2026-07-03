import {
    Artifact,
    CreatureVals,
    getCreaturesByLevel,
    Perk,
    PickPhaseVals,
    type TeamType,
} from "@heroesofcrypto/common";
import { Box, Button, Card, CardContent, Chip, Sheet, Tooltip, Typography } from "@mui/joy";
import React, { useState } from "react";

import { images as rawImages } from "../../generated/image_imports";
import { usePickBanEvents } from "../context/PickBanContext";
import { useAuthContext } from "../auth/context/auth_context";
import { UNIT_ID_TO_IMAGE, UNIT_ID_TO_NAME } from "../unit_ui_constants";
import { Timer } from "./Timer";

const images = rawImages as Record<string, string>;

const creatureName = (creatureId: number): string => UNIT_ID_TO_NAME[creatureId] ?? `Creature ${creatureId}`;
const creatureImage = (creatureId: number): string | undefined => UNIT_ID_TO_IMAGE[creatureId];

const PHASE_TITLE: Record<number, string> = {
    [PickPhaseVals.PERK]: "Choose your doctrine",
    [PickPhaseVals.INITIAL_PICK]: "Choose your starting bundle",
    [PickPhaseVals.PICK]: "Pick a creature",
    [PickPhaseVals.ARTIFACT_2]: "Choose a Tier 2 artifact",
    [PickPhaseVals.AUGMENTS]: "Preparing placement…",
    [PickPhaseVals.AUGMENTS_SCOUT]: "Preparing placement…",
};

// ---- Shared portrait tile -------------------------------------------------

type PortraitState = "available" | "picked" | "taken" | "banned";

const CreaturePortrait: React.FC<{
    creatureId: number;
    state: PortraitState;
    disabled?: boolean;
    onClick?: () => void;
}> = ({ creatureId, state, disabled, onClick }) => {
    const src = creatureImage(creatureId);
    const selectable = state === "available" && !disabled;
    const ring =
        state === "picked" ? "#3B9B5C" : state === "banned" || state === "taken" ? "#8a2b2b" : "rgba(255,255,255,0.15)";
    return (
        <Tooltip title={creatureName(creatureId)} variant="soft" placement="top">
            <Box
                onClick={selectable ? onClick : undefined}
                sx={{
                    position: "relative",
                    width: 72,
                    height: 72,
                    borderRadius: "10px",
                    overflow: "hidden",
                    border: `2px solid ${ring}`,
                    cursor: selectable ? "pointer" : "default",
                    opacity: state === "available" ? 1 : 0.55,
                    filter: state === "banned" || state === "taken" ? "grayscale(1)" : "none",
                    transition: "transform 120ms ease, box-shadow 120ms ease",
                    "&:hover": selectable
                        ? { transform: "translateY(-3px)", boxShadow: "0 0 14px rgba(120,220,150,0.55)" }
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
                            fontSize: 34,
                            fontWeight: 700,
                        }}
                    >
                        ✕
                    </Box>
                )}
                {state === "picked" && (
                    <Box sx={{ position: "absolute", bottom: 2, right: 4, color: "#7CFC9B", fontSize: 22 }}>✓</Box>
                )}
            </Box>
        </Tooltip>
    );
};

// ---- Stage panels ---------------------------------------------------------

const PerkPanel: React.FC<{ disabled: boolean; onSelect: (perkId: number) => void }> = ({ disabled, onSelect }) => (
    <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", justifyContent: "center" }}>
        {Perk.PERK_LIST.map((p) => (
            <Card key={p.id} variant="outlined" sx={{ width: 240, bgcolor: "rgba(0,0,0,0.35)" }}>
                <CardContent sx={{ gap: 1 }}>
                    <Typography level="title-md">{p.name}</Typography>
                    <Chip size="sm" color="primary" variant="soft">
                        {p.upgradePoints} upgrade points
                    </Chip>
                    <Typography level="body-sm">{p.description}</Typography>
                    <Button disabled={disabled} onClick={() => onSelect(p.id)} sx={{ mt: 1 }}>
                        Choose
                    </Button>
                </CardContent>
            </Card>
        ))}
    </Box>
);

const BundlePanel: React.FC<{
    bundles: [number, number, number][];
    disabled: boolean;
    onSelect: (index: number) => void;
}> = ({ bundles, disabled, onSelect }) => (
    <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap", justifyContent: "center" }}>
        {bundles.map((bundle, index) => {
            const [l1, l2, artifactId] = bundle;
            const artifact = Artifact.getTier1ArtifactProperties(artifactId as Artifact.Tier1Artifact);
            const artifactImg = images[artifact.imageKey];
            return (
                <Card key={index} variant="outlined" sx={{ width: 260, bgcolor: "rgba(0,0,0,0.35)" }}>
                    <CardContent sx={{ alignItems: "center", gap: 1.5 }}>
                        <Typography level="title-md">Bundle {index + 1}</Typography>
                        <Box sx={{ display: "flex", gap: 1 }}>
                            <CreaturePortrait creatureId={l1} state="available" disabled />
                            <CreaturePortrait creatureId={l2} state="available" disabled />
                        </Box>
                        <Tooltip title={`${artifact.name}: ${artifact.description}`} variant="soft">
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                {artifactImg && (
                                    <img
                                        src={artifactImg}
                                        alt={artifact.name}
                                        style={{ width: 36, height: 36, objectFit: "contain" }}
                                    />
                                )}
                                <Typography level="body-sm">{artifact.name}</Typography>
                            </Box>
                        </Tooltip>
                        <Button disabled={disabled} onClick={() => onSelect(index)} fullWidth>
                            Pick bundle
                        </Button>
                    </CardContent>
                </Card>
            );
        })}
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
    return (
        <Box sx={{ display: "flex", gap: 1.25, flexWrap: "wrap", justifyContent: "center", maxWidth: 640 }}>
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
    );
};

const ArtifactPanel: React.FC<{ disabled: boolean; onSelect: (artifactId: number) => void }> = ({
    disabled,
    onSelect,
}) => (
    <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", justifyContent: "center", maxWidth: 640 }}>
        {Artifact.TIER2_ARTIFACT_LIST.map((a) => {
            const img = images[a.imageKey];
            return (
                <Tooltip key={a.id} title={`${a.name}: ${a.description}`} variant="soft" placement="top">
                    <Card
                        variant="outlined"
                        onClick={disabled ? undefined : () => onSelect(a.id)}
                        sx={{
                            width: 110,
                            bgcolor: "rgba(0,0,0,0.35)",
                            cursor: disabled ? "default" : "pointer",
                            "&:hover": disabled ? undefined : { boxShadow: "0 0 12px rgba(120,180,255,0.5)" },
                        }}
                    >
                        <CardContent sx={{ alignItems: "center", gap: 0.5, p: 1 }}>
                            {img && (
                                <img src={img} alt={a.name} style={{ width: 44, height: 44, objectFit: "contain" }} />
                            )}
                            <Typography level="body-xs" sx={{ textAlign: "center" }}>
                                {a.name}
                            </Typography>
                        </CardContent>
                    </Card>
                </Tooltip>
            );
        })}
    </Box>
);

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
        requiredLevel,
        banned,
        picked,
        opponentPicked,
        upgradePoints,
    } = usePickBanEvents();
    const { perk: sendPerk, pickPair, pick, artifact } = useAuthContext();
    const [busy, setBusy] = useState(false);

    const send = async (fn: () => Promise<void>): Promise<void> => {
        if (busy) return;
        setBusy(true);
        try {
            await fn();
        } catch (err) {
            console.warn("[pick] action rejected", (err as Error)?.message ?? err);
        } finally {
            setBusy(false);
        }
    };

    const disabled = !isYourTurn || busy;
    const title = PHASE_TITLE[pickPhase] ?? "Pick phase";
    const opponentTaken = opponentPicked.filter((id) => id && id !== CreatureVals.NO_CREATURE);

    let panel: React.ReactNode = <Typography level="body-md">Loading…</Typography>;
    if (pickPhase === PickPhaseVals.PERK) {
        panel = <PerkPanel disabled={disabled} onSelect={(id) => void send(() => sendPerk(id))} />;
    } else if (pickPhase === PickPhaseVals.INITIAL_PICK) {
        panel = (
            <BundlePanel bundles={initialBundles} disabled={disabled} onSelect={(i) => void send(() => pickPair(i))} />
        );
    } else if (pickPhase === PickPhaseVals.PICK) {
        panel = (
            <PickPanel
                level={requiredLevel}
                banned={banned}
                picked={picked}
                opponentTaken={opponentTaken}
                disabled={disabled}
                onSelect={(id) => void send(() => pick(id))}
            />
        );
    } else if (pickPhase === PickPhaseVals.ARTIFACT_2) {
        panel = <ArtifactPanel disabled={disabled} onSelect={(id) => void send(() => artifact(id, 2))} />;
    } else if (pickPhase === PickPhaseVals.AUGMENTS || pickPhase === PickPhaseVals.AUGMENTS_SCOUT) {
        panel = <Typography level="title-md">Preparing placement…</Typography>;
    }

    const turnColor = isYourTurn ? "success" : "warning";
    const turnLabel = isYourTurn ? "Your turn" : "Opponent's turn";

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
                bgcolor: "rgba(8,10,18,0.92)",
                color: "#e7e9f0",
                overflowY: "auto",
            }}
        >
            <Box sx={{ display: "flex", alignItems: "center", gap: 2, width: "100%", justifyContent: "center" }}>
                <Typography level="h3" sx={{ color: "#e7e9f0" }}>
                    {title}
                </Typography>
                <Chip color={turnColor} variant="soft">
                    {turnLabel}
                </Chip>
                {upgradePoints > 0 && (
                    <Chip color="primary" variant="soft">
                        {upgradePoints} upgrade pts
                    </Chip>
                )}
            </Box>

            {secondsRemaining >= 0 && <Timer localSeconds={secondsRemaining} isYourTurn={!!isYourTurn} />}

            <Box sx={{ mt: 2, display: "flex", justifyContent: "center", width: "100%" }}>
                {userTeam ? panel : null}
            </Box>

            {!isYourTurn && pickPhase !== PickPhaseVals.AUGMENTS && pickPhase !== PickPhaseVals.AUGMENTS_SCOUT && (
                <Typography level="body-sm" sx={{ opacity: 0.7 }}>
                    Waiting for your opponent…
                </Typography>
            )}
        </Sheet>
    );
};

export default StainedGlassWindow;
