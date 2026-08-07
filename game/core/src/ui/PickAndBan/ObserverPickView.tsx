import Box from "@mui/joy/Box";
import Sheet from "@mui/joy/Sheet";
import Stack from "@mui/joy/Stack";
import Typography from "@mui/joy/Typography";
import React, { useEffect, useMemo, useRef, useState } from "react";

import { fetchPickObserveSnapshot, type PickObserveSnapshot, type PickObserveTeam } from "../../api/ranked_play_client";
import { images as rawImages } from "../../generated/image_imports";
import { UNIT_ID_TO_IMAGE, UNIT_ID_TO_NAME } from "../unit_ui_constants";

const images = rawImages as Record<string, string>;

/**
 * Read-only spectator view of a game still in its draft. Polls the public, spoiler-safe
 * pick-observe snapshot: each team shows exactly the picks its OPPONENT has already seen (slot
 * reveals), plus the shared bans and the live phase countdown. When the draft hands off to the
 * fight, the surrounding GameRoute's play-snapshot poll flips this view into the fight observer.
 */

const POLL_MS = 3_000;
const SLOT_LEVELS = ["L1", "L1", "L2", "L2", "L3", "L4"] as const;

const PHASE_LABELS: Record<string, string> = {
    PERK: "Choosing doctrines",
    INITIAL_PICK: "Opening bundles",
    PICK: "Picking creatures",
    BAN: "Banning creatures",
    ARTIFACT_1: "Tier 1 artifacts",
    ARTIFACT_2: "Tier 2 artifacts",
    REVEAL: "Scouting reveals",
    AUGMENTS: "Setting up augments",
    AUGMENTS_SCOUT: "Setting up augments",
};

const phaseLabel = (snapshot: PickObserveSnapshot): string => {
    const raw = snapshot.phaseName ?? "";
    return PHASE_LABELS[raw] ?? raw.replaceAll("_", " ").toLowerCase() ?? "Drafting";
};

const CreatureSlot: React.FC<{ creatureId: number; levelLabel: string }> = ({ creatureId, levelLabel }) => {
    const img = creatureId ? UNIT_ID_TO_IMAGE[creatureId] : undefined;
    const name = creatureId ? (UNIT_ID_TO_NAME[creatureId] ?? `#${creatureId}`) : "Hidden";
    return (
        <Stack spacing={0.5} alignItems="center" sx={{ width: 92 }}>
            {img ? (
                <Box
                    component="img"
                    src={img}
                    alt={name}
                    sx={{
                        width: 72,
                        height: 72,
                        borderRadius: "50%",
                        objectFit: "cover",
                        border: "3px solid rgba(220,177,88,0.75)",
                    }}
                />
            ) : (
                <Box
                    sx={{
                        width: 72,
                        height: 72,
                        borderRadius: "50%",
                        border: "2px dashed rgba(159,182,212,0.4)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "rgba(159,182,212,0.6)",
                        fontSize: 26,
                        fontWeight: 700,
                    }}
                >
                    ?
                </Box>
            )}
            <Typography level="body-xs" sx={{ color: "#9fb6d4" }}>
                {levelLabel}
            </Typography>
            <Typography
                level="body-xs"
                sx={{ color: creatureId ? "#efe4cc" : "rgba(159,182,212,0.5)", textAlign: "center", lineHeight: 1.1 }}
            >
                {name}
            </Typography>
        </Stack>
    );
};

const TeamColumn: React.FC<{ team?: PickObserveTeam; fallbackLabel: string }> = ({ team, fallbackLabel }) => (
    <Sheet
        variant="soft"
        sx={{
            p: 2,
            borderRadius: "18px",
            bgcolor: "rgba(11,13,18,0.92)",
            border: "1px solid rgba(159,182,212,0.35)",
            minWidth: 320,
        }}
    >
        <Stack spacing={1.25} alignItems="center">
            <Stack direction="row" spacing={1} alignItems="center">
                <Typography sx={{ fontSize: 20, fontWeight: 700, color: "#efe4cc" }}>
                    {team?.username ?? fallbackLabel}
                </Typography>
                {team?.isBot && (
                    <Typography
                        level="body-xs"
                        sx={{
                            px: 0.75,
                            py: 0.25,
                            borderRadius: "8px",
                            bgcolor: "rgba(220,177,88,0.15)",
                            border: "1px solid rgba(220,177,88,0.5)",
                            color: "#dcb158",
                        }}
                    >
                        AI {team.aiVersion ?? ""}
                    </Typography>
                )}
            </Stack>
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1.25 }}>
                {SLOT_LEVELS.map((levelLabel, index) => (
                    <CreatureSlot
                        key={`${levelLabel}-${index}`}
                        creatureId={team?.revealedCreatureSlots?.[index] ?? 0}
                        levelLabel={levelLabel}
                    />
                ))}
            </Box>
        </Stack>
    </Sheet>
);

interface IObserverPickViewProps {
    gameId: string;
    /** Forwards the live phase so GameRoute can speed up its pick->play handoff poll. */
    onPickPhaseChange?: (phase: number) => void;
}

export const ObserverPickView: React.FC<IObserverPickViewProps> = ({ gameId, onPickPhaseChange }) => {
    const [snapshot, setSnapshot] = useState<PickObserveSnapshot | undefined>(undefined);
    const [now, setNow] = useState(() => Date.now());
    // Server/browser clock drift so the countdown tracks the authoritative deadline.
    const driftRef = useRef(0);

    useEffect(() => {
        let cancelled = false;
        const poll = async () => {
            try {
                const next = await fetchPickObserveSnapshot(gameId);
                if (cancelled || !next) {
                    return;
                }
                if (typeof next.serverTimeMs === "number") {
                    driftRef.current = next.serverTimeMs - Date.now();
                }
                setSnapshot(next);
                if (typeof next.phase === "number") {
                    onPickPhaseChange?.(next.phase);
                }
            } catch {
                // Transient — keep the last snapshot and try again on the next tick.
            }
        };
        void poll();
        const pollId = window.setInterval(poll, POLL_MS);
        return () => {
            cancelled = true;
            window.clearInterval(pollId);
        };
    }, [gameId, onPickPhaseChange]);

    useEffect(() => {
        const tickId = window.setInterval(() => setNow(Date.now()), 500);
        return () => window.clearInterval(tickId);
    }, []);

    const secondsLeft = useMemo(() => {
        if (!snapshot?.phaseEndsAt) {
            return undefined;
        }
        return Math.max(0, Math.floor((snapshot.phaseEndsAt - (now + driftRef.current)) / 1000));
    }, [snapshot, now]);

    const lower = snapshot?.teams?.find((team) => team.team === "lower");
    const upper = snapshot?.teams?.find((team) => team.team === "upper");
    const bans = snapshot?.bans ?? [];

    return (
        <Box
            sx={{
                position: "fixed",
                inset: 0,
                overflow: "auto",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "radial-gradient(ellipse at top, #141a24 0%, #05070b 70%)",
                p: 3,
            }}
        >
            <Stack spacing={2.5} alignItems="center">
                <Stack spacing={0.5} alignItems="center">
                    <Typography sx={{ fontSize: 26, fontWeight: 700, color: "#efe4cc" }}>
                        Spectating the draft
                    </Typography>
                    <Stack direction="row" spacing={1.5} alignItems="center">
                        <Typography sx={{ color: "#9fb6d4", fontSize: 16 }}>
                            {snapshot ? phaseLabel(snapshot) : "Connecting to the draft"}
                            {snapshot?.phaseCount
                                ? ` — phase ${Math.min((snapshot.phaseSeq ?? 0) + 1, snapshot.phaseCount)}/${snapshot.phaseCount}`
                                : ""}
                        </Typography>
                        {secondsLeft !== undefined && (
                            <Typography
                                sx={{
                                    px: 1,
                                    py: 0.25,
                                    borderRadius: "8px",
                                    bgcolor: "rgba(255,255,255,0.06)",
                                    border: "1px solid rgba(255,255,255,0.14)",
                                    color: "#efe4cc",
                                    fontVariantNumeric: "tabular-nums",
                                }}
                            >
                                {`${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`}
                            </Typography>
                        )}
                    </Stack>
                    <Typography level="body-xs" sx={{ color: "rgba(159,182,212,0.6)" }}>
                        Spectators see what each side has revealed to its opponent — hidden picks stay hidden.
                    </Typography>
                </Stack>

                <Stack direction={{ xs: "column", md: "row" }} spacing={2.5} alignItems="stretch">
                    <TeamColumn team={lower} fallbackLabel="Lower team" />
                    <Stack alignItems="center" justifyContent="center">
                        <Typography sx={{ color: "#dcb158", fontSize: 22, fontWeight: 700 }}>VS</Typography>
                    </Stack>
                    <TeamColumn team={upper} fallbackLabel="Upper team" />
                </Stack>

                {bans.length > 0 && (
                    <Sheet
                        variant="soft"
                        sx={{
                            p: 1.5,
                            borderRadius: "14px",
                            bgcolor: "rgba(11,13,18,0.92)",
                            border: "1px solid rgba(178,66,66,0.45)",
                        }}
                    >
                        <Stack spacing={0.75} alignItems="center">
                            <Typography level="body-sm" sx={{ color: "#d99" }}>
                                Banned creatures
                            </Typography>
                            <Stack direction="row" spacing={1} flexWrap="wrap" justifyContent="center">
                                {bans.map((creatureId) => (
                                    <Stack key={creatureId} spacing={0.25} alignItems="center" sx={{ width: 64 }}>
                                        <Box sx={{ position: "relative", width: 44, height: 44 }}>
                                            {UNIT_ID_TO_IMAGE[creatureId] && (
                                                <Box
                                                    component="img"
                                                    src={UNIT_ID_TO_IMAGE[creatureId]}
                                                    alt={UNIT_ID_TO_NAME[creatureId] ?? `#${creatureId}`}
                                                    sx={{
                                                        width: 44,
                                                        height: 44,
                                                        borderRadius: "50%",
                                                        objectFit: "cover",
                                                        border: "2px solid rgba(178,66,66,0.7)",
                                                        filter: "grayscale(0.8)",
                                                    }}
                                                />
                                            )}
                                            {images.x_mark_2_512 && (
                                                <Box
                                                    component="img"
                                                    src={images.x_mark_2_512}
                                                    alt="banned"
                                                    sx={{
                                                        position: "absolute",
                                                        inset: 8,
                                                        width: 28,
                                                        height: 28,
                                                        opacity: 0.85,
                                                    }}
                                                />
                                            )}
                                        </Box>
                                        <Typography
                                            level="body-xs"
                                            sx={{
                                                color: "rgba(217,153,153,0.8)",
                                                textAlign: "center",
                                                lineHeight: 1.1,
                                            }}
                                        >
                                            {UNIT_ID_TO_NAME[creatureId] ?? `#${creatureId}`}
                                        </Typography>
                                    </Stack>
                                ))}
                            </Stack>
                        </Stack>
                    </Sheet>
                )}
            </Stack>
        </Box>
    );
};

export default ObserverPickView;
