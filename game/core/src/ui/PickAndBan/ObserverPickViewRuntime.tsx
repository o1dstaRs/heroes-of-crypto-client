import { Artifact } from "@heroesofcrypto/common";
import Box from "@mui/joy/Box";
import Button from "@mui/joy/Button";
import Sheet from "@mui/joy/Sheet";
import Stack from "@mui/joy/Stack";
import Typography from "@mui/joy/Typography";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { fetchPickObserveSnapshot, type PickObserveSnapshot, type PickObserveTeam } from "../../api/ranked_play_client";
import { fetchRankedStanding } from "../../api/social_client";
import { images as rawImages } from "../../generated/image_imports";
import { t, tf, useTranslation } from "../../i18n/i18n";
import { useAuthContext } from "../auth/context/auth_context";
import { CreaturePortraitImage } from "../CreaturePortraitImage";
import { LivePredictionMarkets } from "../PlayerPortal/LivePredictionMarkets";
import { UNIT_ID_TO_NAME } from "../unit_ui_constants";
import { useStopWatching } from "../useStopWatching";
import { startVisibleInterval } from "../visibleInterval";
import { observedDraftArtifactSlots, type ObservedDraftArtifactSlot } from "./observerPickArtifacts";
import { ObserverRecentGames } from "./ObserverRecentGames";

const images = rawImages as Record<string, string>;

/**
 * Read-only spectator view of a game still in its draft. Polls the public pick-observe snapshot, which
 * carries only what both seats already know — seats, bans, the phase and its countdown — so a player cannot
 * scout their own draft through it. Creature picks and artifacts arrive only for an all-AI game. When the
 * draft hands off to the fight, the surrounding GameRoute's play-snapshot poll flips this view into the
 * fight observer.
 */

const POLL_MS = 3_000;
const SLOT_LEVELS = ["L1", "L1", "L2", "L2", "L3", "L4"] as const;

const PHASE_LABELS: Record<string, string> = {
    DOCTRINE: "Choosing doctrines",
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
    const label = PHASE_LABELS[raw];
    return label ? t(label) : raw.replaceAll("_", " ").toLowerCase();
};

const CreatureSlot: React.FC<{ creatureId: number; levelLabel: string }> = ({ creatureId, levelLabel }) => {
    const name = creatureId ? (UNIT_ID_TO_NAME[creatureId] ?? `#${creatureId}`) : t("Hidden");
    return (
        <Stack spacing={0.5} alignItems="center" sx={{ width: 92 }}>
            {creatureId ? (
                <CreaturePortraitImage
                    creatureId={creatureId}
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

const ArtifactSlot: React.FC<{ slot: ObservedDraftArtifactSlot }> = ({ slot }) => {
    const { artifact, tier } = slot;
    const image = artifact ? images[artifact.imageKey] : undefined;
    return (
        <Stack
            direction="row"
            spacing={0.75}
            alignItems="center"
            title={artifact ? `${artifact.name} — ${Artifact.formatArtifactDescription(artifact)}` : undefined}
            sx={{ width: 132, minWidth: 0 }}
        >
            {image ? (
                <Box
                    component="img"
                    src={image}
                    alt={artifact?.name ?? `Tier-${tier} artifact`}
                    sx={{
                        width: 44,
                        height: 44,
                        flex: "0 0 auto",
                        borderRadius: "9px",
                        objectFit: "contain",
                        bgcolor: "rgba(220,177,88,0.08)",
                        border: "1px solid rgba(220,177,88,0.6)",
                    }}
                />
            ) : (
                <Box
                    sx={{
                        width: 44,
                        height: 44,
                        flex: "0 0 auto",
                        borderRadius: "9px",
                        border: "1px dashed rgba(159,182,212,0.35)",
                        display: "grid",
                        placeItems: "center",
                        color: "rgba(159,182,212,0.5)",
                        fontSize: 12,
                        fontWeight: 700,
                    }}
                >
                    T{tier}
                </Box>
            )}
            <Stack spacing={0.1} sx={{ minWidth: 0 }}>
                <Typography level="body-xs" sx={{ color: "#dcb158", fontWeight: 700 }}>
                    {tf("Tier {tier}", { tier })}
                </Typography>
                <Typography
                    level="body-xs"
                    sx={{
                        color: artifact ? "#efe4cc" : "rgba(159,182,212,0.5)",
                        lineHeight: 1.1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                    }}
                >
                    {artifact?.name ?? t("Hidden")}
                </Typography>
            </Stack>
        </Stack>
    );
};

const TeamColumn: React.FC<{ team?: PickObserveTeam; fallbackLabel: string }> = ({ team, fallbackLabel }) => {
    const artifactSlots = observedDraftArtifactSlots(team);
    return (
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
                            {t("AI")} {team.aiVersion ?? ""}
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
                <Box
                    sx={{
                        width: "100%",
                        pt: 1.1,
                        borderTop: "1px solid rgba(159,182,212,0.2)",
                    }}
                >
                    <Typography
                        level="body-xs"
                        sx={{ color: "#9fb6d4", textTransform: "uppercase", letterSpacing: 0.7, mb: 0.75 }}
                    >
                        {t("Selected artifacts")}
                    </Typography>
                    <Stack direction="row" spacing={1} justifyContent="space-between">
                        {artifactSlots.map((slot) => (
                            <ArtifactSlot key={slot.tier} slot={slot} />
                        ))}
                    </Stack>
                </Box>
                {team && <ObserverRecentGames playerId={team.playerId} isBot={team.isBot} />}
            </Stack>
        </Sheet>
    );
};

interface IObserverPickViewProps {
    gameId: string;
    /** Forwards the live phase so GameRoute can speed up its pick->play handoff poll. */
    onPickPhaseChange?: (phase: number) => void;
    /**
     * The snapshot reports the draft is over ("play" or "finished"). The server flips the game to PLAY in the
     * same write that enters AUGMENTS, so this view practically never sees that phase; without this signal
     * GameRoute stayed on its slow 15s handoff poll.
     */
    onDraftEnded?: () => void;
    /**
     * The viewer is a PLAYER in this draft whose own draft stream would not connect (the server refuses a second
     * tab or device), so they watch it here. Replaces "Stop watching" with a way back to drafting.
     */
    draftOpenElsewhere?: boolean;
    onDraftHere?: () => void;
}

export const ObserverPickView: React.FC<IObserverPickViewProps> = ({
    gameId,
    onPickPhaseChange,
    onDraftEnded,
    draftOpenElsewhere = false,
    onDraftHere,
}) => {
    // Re-render on a language switch: every label below reads t().
    useTranslation();
    const stopWatching = useStopWatching();
    const [snapshot, setSnapshot] = useState<PickObserveSnapshot | undefined>(undefined);
    // The game this view saw end WITHOUT a fight. Keyed by game id, so a different game polls again.
    const [closedGameId, setClosedGameId] = useState<string | undefined>(undefined);
    const draftClosed = closedGameId === gameId;
    const [now, setNow] = useState(() => Date.now());
    // Server/browser clock drift so the countdown tracks the authoritative deadline.
    const driftRef = useRef(0);
    // A signed-in spectator with season gold may back a side while the draft runs. The market card applies
    // the server's own rules (ranked draft only, never a player's own game, one bet per game).
    const { authenticated, user } = useAuthContext();
    const [viewerGold, setViewerGold] = useState<number | undefined>(undefined);
    const refreshViewerGold = useCallback(async (): Promise<void> => {
        if (!authenticated) {
            setViewerGold(undefined);
            return;
        }
        try {
            setViewerGold((await fetchRankedStanding()).gold);
        } catch {
            setViewerGold(undefined);
        }
    }, [authenticated]);
    useEffect(() => {
        void refreshViewerGold();
    }, [refreshViewerGold]);

    useEffect(() => {
        if (draftClosed) {
            return undefined;
        }
        let cancelled = false;
        const poll = async () => {
            try {
                const next = await fetchPickObserveSnapshot(gameId);
                if (cancelled || !next) {
                    return;
                }
                if (next.stage === "play") {
                    // Keep the finished draft on screen: a stage-only snapshot carries no teams and rendered
                    // as blank "Left team / Right team" cards until the fight view took over.
                    onDraftEnded?.();
                    return;
                }
                if (next.stage === "finished" || next.abandoned) {
                    // No fight to hand off to — an abandoned draft reads "finished" once the game leaves PICK.
                    // Handing off here polled play-snapshot every 750ms forever; say so and stop instead.
                    setClosedGameId(gameId);
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
        const stopPolling = startVisibleInterval(() => void poll(), POLL_MS);
        return () => {
            cancelled = true;
            stopPolling();
        };
    }, [gameId, draftClosed, onPickPhaseChange, onDraftEnded]);

    useEffect(() => {
        return startVisibleInterval(() => setNow(Date.now()), 500);
    }, []);

    const secondsLeft = useMemo(() => {
        if (!snapshot?.phaseEndsAt) {
            return undefined;
        }
        return Math.max(0, Math.floor((snapshot.phaseEndsAt - (now + driftRef.current)) / 1000));
    }, [snapshot, now]);

    const left = snapshot?.teams?.find((team) => team.team === "lower");
    const right = snapshot?.teams?.find((team) => team.team === "upper");
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
                        {t("Spectating the draft")}
                    </Typography>
                    <Stack direction="row" spacing={1.5} alignItems="center">
                        <Typography sx={{ color: "#9fb6d4", fontSize: 16 }}>
                            {draftClosed
                                ? t("This match ended before the fight")
                                : snapshot
                                  ? phaseLabel(snapshot)
                                  : t("Connecting to the draft")}
                            {!draftClosed && snapshot?.phaseCount
                                ? tf(" — phase {current}/{total}", {
                                      current: Math.min((snapshot.phaseSeq ?? 0) + 1, snapshot.phaseCount),
                                      total: snapshot.phaseCount,
                                  })
                                : ""}
                        </Typography>
                        {!draftClosed && secondsLeft !== undefined && (
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
                        {t("Creature picks and artifacts stay hidden until the fight starts.")}
                    </Typography>
                    {draftOpenElsewhere ? (
                        <Stack spacing={0.75} alignItems="center" sx={{ pt: 0.75 }}>
                            <Typography level="body-sm" sx={{ color: "#dcb158", textAlign: "center", maxWidth: 520 }}>
                                {t(
                                    "Your draft is open in another tab or on another device, so you're watching it here.",
                                )}
                            </Typography>
                            {onDraftHere && (
                                <Button size="sm" variant="solid" onClick={onDraftHere}>
                                    {t("Draft here")}
                                </Button>
                            )}
                        </Stack>
                    ) : (
                        <Button size="sm" variant="plain" onClick={stopWatching} sx={{ mt: 0.5, color: "#9fb6d4" }}>
                            {t("Stop watching")}
                        </Button>
                    )}
                </Stack>

                <Stack direction={{ xs: "column", md: "row" }} spacing={2.5} alignItems="stretch">
                    <TeamColumn team={left} fallbackLabel={t("Left team")} />
                    <Stack alignItems="center" justifyContent="center">
                        <Typography sx={{ color: "#dcb158", fontSize: 22, fontWeight: 700 }}>{t("VS")}</Typography>
                    </Stack>
                    <TeamColumn team={right} fallbackLabel={t("Right team")} />
                </Stack>

                {!draftClosed && authenticated && !!user?.username && viewerGold !== undefined && (
                    <Box sx={{ width: "100%", maxWidth: 520 }}>
                        <LivePredictionMarkets
                            gameId={gameId}
                            viewerUsername={user.username}
                            gold={viewerGold}
                            onBetPlaced={refreshViewerGold}
                        />
                    </Box>
                )}

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
                                {t("Banned creatures")}
                            </Typography>
                            <Stack direction="row" spacing={1} flexWrap="wrap" justifyContent="center">
                                {bans.map((creatureId) => (
                                    <Stack key={creatureId} spacing={0.25} alignItems="center" sx={{ width: 64 }}>
                                        <Box sx={{ position: "relative", width: 44, height: 44 }}>
                                            {creatureId > 0 && (
                                                <CreaturePortraitImage
                                                    creatureId={creatureId}
                                                    alt={UNIT_ID_TO_NAME[creatureId] ?? `#${creatureId}`}
                                                    sx={{
                                                        width: 44,
                                                        height: 44,
                                                        borderRadius: "50%",
                                                        border: "2px solid rgba(178,66,66,0.7)",
                                                    }}
                                                    imageStyle={{ filter: "grayscale(0.8)" }}
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
