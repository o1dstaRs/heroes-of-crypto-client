import { TeamVals, type GameAction, type TeamType } from "@heroesofcrypto/common";
import { Alert, Box, Button, Chip, CircularProgress, Sheet, Stack, Typography } from "@mui/joy";
import CssBaseline from "@mui/joy/CssBaseline";
import { CssVarsProvider } from "@mui/joy/styles";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";

import { createPlayActionFromGameAction } from "../api/game_action_play_codec";
import {
    fetchRankedPlayReplay,
    fetchRankedPlaySnapshot,
    parseRankedPlaySseFrame,
    playEventsUrl,
    rankedEventHeaders,
    sendRankedPlayAction,
    toAuthoritativeGameSnapshot,
} from "../api/ranked_play_client";
import { PlayActionType, PlayPhase } from "../api/play_protocol";
import type { PlayAction, PlaySnapshot, PlayUnitState } from "../api/play_protocol";
import type { SceneGameActionTransport } from "../game_action_transport";
import { usePixiManager } from "../pixi/PixiGameManager";
import type { SceneEntry } from "../pixi/PixiScene";
import { RankedPlayScene } from "../scenes/RankedPlayScene";
import type { IWindowSize } from "../scenes/VisibleState";
import DraggableToolbar from "./DraggableToolbar";
import { FightFinishedOverlay } from "./FightFinishedOverlay";
import LeftSideBar from "./LeftSideBar";
import { Main } from "./Main";
import Popover from "./Popover";
import RightSideBar from "./RightSideBar";
import { UpNextOverlay } from "./UpNextOverlay";
import { WalletLinker } from "./WalletLinker";
import { ButtonProvider } from "./context/ButtonContext";
import { hocColors, hocPanelSx, hocPrimaryButtonSx, hocSoftButtonSx } from "./hocTheme";

export { fetchRankedPlaySnapshot } from "../api/ranked_play_client";

const RANKED_SCENE_ENTRY: SceneEntry = {
    group: "Heroes",
    name: "Ranked Play",
    SceneClass: RankedPlayScene,
};

const phaseLabel = (phase: number): string => {
    if (phase === PlayPhase.PLACEMENT) return "Placement";
    if (phase === PlayPhase.PLAY) return "Fight";
    if (phase === PlayPhase.FINISHED) return "Finished";
    if (phase === PlayPhase.ABANDONED) return "Abandoned";
    return "Loading";
};

const teamLabel = (team: number): string => {
    if (team === TeamVals.LOWER) return "Red";
    if (team === TeamVals.UPPER) return "Green";
    return "Neutral";
};

type Props = {
    gameId: string;
    userTeam: TeamType;
    windowSize: IWindowSize;
};

export const RankedGameView: React.FC<Props> = ({ gameId, userTeam, windowSize }) => {
    const manager = usePixiManager();
    const [snapshot, setSnapshot] = useState<PlaySnapshot | null>(null);
    const [selectedUnitId, setSelectedUnitId] = useState("");
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState("Connecting");
    const [error, setError] = useState("");
    const [pixiReady, setPixiReady] = useState(!manager.isLoading);
    const abortRef = useRef<AbortController | null>(null);
    const latestSequenceRef = useRef(0);
    const replayTimersRef = useRef<number[]>([]);

    const applySnapshot = useCallback((nextSnapshot: PlaySnapshot) => {
        latestSequenceRef.current = Math.max(latestSequenceRef.current, nextSnapshot.latestSequence);
        setSnapshot(nextSnapshot);
    }, []);

    const refreshSnapshot = useCallback(async () => {
        const nextSnapshot = await fetchRankedPlaySnapshot(gameId);
        applySnapshot(nextSnapshot);
    }, [applySnapshot, gameId]);

    const clearReplayTimers = useCallback(() => {
        replayTimersRef.current.forEach(window.clearTimeout);
        replayTimersRef.current = [];
    }, []);

    useEffect(() => {
        const connection = manager.onLoadingChanged.connect((loading) => {
            setPixiReady(!loading);
        });
        return () => {
            connection.disconnect();
        };
    }, [manager]);

    useEffect(
        () => () => {
            clearReplayTimers();
        },
        [clearReplayTimers],
    );

    useEffect(() => {
        if (!snapshot || !pixiReady) {
            return;
        }
        manager.ApplyAuthoritativeSnapshot(toAuthoritativeGameSnapshot(snapshot));
    }, [manager, pixiReady, snapshot]);

    useEffect(() => {
        let cancelled = false;

        refreshSnapshot()
            .then(() => {
                if (!cancelled) {
                    setStatus("Connected");
                    setError("");
                }
            })
            .catch((err: unknown) => {
                if (!cancelled) {
                    setStatus("Snapshot failed");
                    setError((err as Error).message || "Unable to load play snapshot");
                }
            });

        return () => {
            cancelled = true;
        };
    }, [refreshSnapshot]);

    useEffect(() => {
        let closed = false;
        let retryTimer: number | undefined;

        const connect = async () => {
            abortRef.current?.abort();
            const controller = new AbortController();
            abortRef.current = controller;

            try {
                setStatus("Connecting");
                const response = await fetch(playEventsUrl(gameId, latestSequenceRef.current), {
                    cache: "no-cache",
                    headers: rankedEventHeaders(),
                    mode: "cors",
                    signal: controller.signal,
                });

                if (!response.ok || !response.body) {
                    throw new Error(`Event stream failed: ${response.status}`);
                }

                setStatus("Connected");
                setError("");
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = "";

                while (!closed) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const frames = buffer.split("\n\n");
                    buffer = frames.pop() ?? "";
                    for (const frame of frames) {
                        const event = parseRankedPlaySseFrame(frame);
                        if (!event) continue;

                        latestSequenceRef.current = Math.max(latestSequenceRef.current, event.sequence);
                        if (event.snapshot) {
                            applySnapshot(event.snapshot);
                        }
                        if (event.rejectionReason || event.message) {
                            setError(event.rejectionReason || event.message);
                        }
                    }
                }
            } catch (err: unknown) {
                if (!closed && (err as Error).name !== "AbortError") {
                    setStatus("Reconnecting");
                    setError((err as Error).message || "Event stream disconnected");
                    retryTimer = window.setTimeout(connect, 1200);
                }
            }
        };

        void connect();

        return () => {
            closed = true;
            if (retryTimer) {
                window.clearTimeout(retryTimer);
            }
            abortRef.current?.abort();
        };
    }, [applySnapshot, gameId]);

    const myPlayer = useMemo(() => snapshot?.players.find((player) => player.team === userTeam), [snapshot, userTeam]);
    const selectedUnit = useMemo(
        () => snapshot?.units.find((unit) => unit.id === selectedUnitId),
        [selectedUnitId, snapshot],
    );
    const currentUnit = useMemo(() => snapshot?.units.find((unit) => unit.id === snapshot.currentUnitId), [snapshot]);
    const myUnits = useMemo(
        () => (snapshot?.units ?? []).filter((unit) => unit.team === userTeam),
        [snapshot, userTeam],
    );
    const unplacedUnits = useMemo(() => myUnits.filter((unit) => !unit.placed), [myUnits]);
    const ready = !!myPlayer && !!snapshot?.readyPlayerIds.includes(myPlayer.playerId);
    const canSubmit = !!snapshot && !!myPlayer && !busy;
    const gameStarted =
        !!snapshot &&
        (snapshot.fightStarted || snapshot.phase === PlayPhase.PLAY || snapshot.phase === PlayPhase.FINISHED);

    const sendPlayAction = useCallback(
        async (payload: PlayAction) => {
            setBusy(true);
            setError("");
            try {
                const result = await sendRankedPlayAction(gameId, payload);
                if (result.event?.snapshot) {
                    applySnapshot(result.event.snapshot);
                } else {
                    await refreshSnapshot();
                }
                if (!result.accepted) {
                    setError(result.rejectionReason || result.message || "Action rejected");
                }
            } catch (err: unknown) {
                setError((err as Error).message || "Unable to submit action");
            } finally {
                setBusy(false);
            }
        },
        [applySnapshot, gameId, refreshSnapshot],
    );

    const buildActionEnvelope = useCallback(() => {
        if (!snapshot || !myPlayer) {
            return undefined;
        }
        return {
            actionId: uuidv4(),
            gameId,
            playerId: myPlayer.playerId,
            expectedSequence: snapshot.latestSequence,
            team: userTeam,
        };
    }, [gameId, myPlayer, snapshot, userTeam]);

    const submitProtocolAction = useCallback(
        async (action: Partial<PlayAction>) => {
            const envelope = buildActionEnvelope();
            if (!envelope) return;

            await sendPlayAction({
                ...envelope,
                type: PlayActionType.UNKNOWN,
                ...action,
            });
        },
        [buildActionEnvelope, sendPlayAction],
    );

    const submitGameAction = useCallback(
        async (action: GameAction) => {
            const envelope = buildActionEnvelope();
            if (!envelope) return;

            await sendPlayAction(createPlayActionFromGameAction(action, envelope));
        },
        [buildActionEnvelope, sendPlayAction],
    );

    const transport = useCallback<SceneGameActionTransport>(
        (action) => {
            void submitGameAction(action);
            return { handled: true, completed: true, message: "Submitted to ranked server" };
        },
        [submitGameAction],
    );

    const replayRankedFight = useCallback(async () => {
        clearReplayTimers();
        setBusy(true);
        setStatus("Loading replay");
        setError("");

        try {
            const replay = await fetchRankedPlayReplay(gameId);
            const bySequence = new Map<number, PlaySnapshot>();
            if (replay.initialSnapshot) {
                bySequence.set(replay.initialSnapshot.latestSequence, replay.initialSnapshot);
            }
            for (const event of replay.events) {
                if (event.snapshot) {
                    bySequence.set(event.snapshot.latestSequence, event.snapshot);
                }
            }
            if (replay.currentSnapshot) {
                bySequence.set(replay.currentSnapshot.latestSequence, replay.currentSnapshot);
            }

            const replaySnapshots = [...bySequence.values()].sort((a, b) => a.latestSequence - b.latestSequence);
            if (!replaySnapshots.length) {
                throw new Error("Replay has no snapshots to play");
            }

            setStatus("Replaying");
            const stepDelayMs = 550;
            replaySnapshots.forEach((replaySnapshot, index) => {
                const playSnapshot = () => {
                    manager.ApplyAuthoritativeReplaySnapshot(toAuthoritativeGameSnapshot(replaySnapshot));
                    if (index === replaySnapshots.length - 1) {
                        setStatus("Connected");
                    }
                };

                if (index === 0) {
                    playSnapshot();
                    return;
                }

                replayTimersRef.current.push(window.setTimeout(playSnapshot, index * stepDelayMs));
            });
        } catch (err: unknown) {
            setStatus("Replay failed");
            setError((err as Error).message || "Unable to load replay");
        } finally {
            setBusy(false);
        }
    }, [clearReplayTimers, gameId, manager]);

    useEffect(() => {
        manager.SetGameActionTransport(transport);
        return () => manager.SetGameActionTransport(undefined);
    }, [manager, transport]);

    const selectUnit = useCallback(
        (unit: PlayUnitState) => {
            setSelectedUnitId(unit.id);
            manager.SelectAuthoritativeUnit(unit.id);
        },
        [manager],
    );

    if (!snapshot) {
        return (
            <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", bgcolor: "#07090d", color: "#fff" }}>
                <Stack spacing={2} alignItems="center">
                    <CircularProgress />
                    <Typography>Loading ranked fight</Typography>
                    {error && <Alert color="danger">{error}</Alert>}
                </Stack>
            </Box>
        );
    }

    return (
        <ButtonProvider>
            <div className="container" style={{ display: "flex", position: "relative" }}>
                <CssVarsProvider>
                    <CssBaseline />
                    {gameStarted && <LeftSideBar gameStarted={gameStarted} windowSize={windowSize} />}
                    {gameStarted && <RightSideBar gameStarted={gameStarted} windowSize={windowSize} />}
                    {gameStarted && <UpNextOverlay />}
                    {gameStarted && (
                        <FightFinishedOverlay
                            canReplay={snapshot.phase === PlayPhase.FINISHED || snapshot.fightFinished}
                            mode="ranked"
                            onReplay={replayRankedFight}
                        />
                    )}
                    {gameStarted && <DraggableToolbar />}
                </CssVarsProvider>
                <Main entry={RANKED_SCENE_ENTRY} />
                <Popover />
                <RankedOverlay
                    busy={busy}
                    canSubmit={canSubmit}
                    currentUnit={currentUnit}
                    error={error}
                    gameStarted={gameStarted}
                    ready={ready}
                    selectedUnit={selectedUnit}
                    selectUnit={selectUnit}
                    snapshot={snapshot}
                    status={status}
                    submitGameAction={submitGameAction}
                    submitProtocolAction={submitProtocolAction}
                    unplacedUnits={unplacedUnits}
                    userTeam={userTeam}
                />
            </div>
        </ButtonProvider>
    );
};

interface RankedOverlayProps {
    busy: boolean;
    canSubmit: boolean;
    currentUnit?: PlayUnitState;
    error: string;
    gameStarted: boolean;
    ready: boolean;
    selectedUnit?: PlayUnitState;
    selectUnit: (unit: PlayUnitState) => void;
    snapshot: PlaySnapshot;
    status: string;
    submitGameAction: (action: GameAction) => Promise<void>;
    submitProtocolAction: (action: Partial<PlayAction>) => Promise<void>;
    unplacedUnits: PlayUnitState[];
    userTeam: TeamType;
}

const RankedOverlay: React.FC<RankedOverlayProps> = ({
    busy,
    canSubmit,
    currentUnit,
    error,
    gameStarted,
    ready,
    selectedUnit,
    selectUnit,
    snapshot,
    status,
    submitGameAction,
    submitProtocolAction,
    unplacedUnits,
    userTeam,
}) => (
    <Sheet
        variant="outlined"
        sx={{
            position: "fixed",
            top: 12,
            right: 12,
            zIndex: 20,
            width: { xs: "calc(100vw - 24px)", sm: 340 },
            maxHeight: "calc(100vh - 24px)",
            overflow: "auto",
            p: 1.25,
            ...hocPanelSx,
            backdropFilter: "blur(10px)",
        }}
    >
        <Stack spacing={1}>
            <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap">
                <Typography level="title-md" textColor={hocColors.parchment}>
                    Ranked Fight
                </Typography>
                <Chip
                    size="sm"
                    variant="soft"
                    sx={{
                        bgcolor: hocColors.orangeSoft,
                        color: hocColors.gold,
                        border: `1px solid ${hocColors.orangeBorder}`,
                    }}
                >
                    {phaseLabel(snapshot.phase)}
                </Chip>
                <Chip size="sm" variant="soft" color={status === "Connected" ? "success" : "warning"}>
                    {status}
                </Chip>
                <Chip size="sm" variant="soft" color="neutral">
                    Seq {snapshot.latestSequence}
                </Chip>
            </Stack>

            <WalletLinker compact />

            <Typography level="body-sm" textColor={hocColors.mutedStrong}>
                You: {teamLabel(userTeam)}
                {currentUnit ? ` | Active: ${currentUnit.name} (${teamLabel(currentUnit.team)})` : ""}
            </Typography>

            {snapshot.phase === PlayPhase.PLACEMENT && (
                <Stack spacing={0.75}>
                    <Button
                        variant="solid"
                        disabled={!canSubmit || ready}
                        onClick={() => void submitProtocolAction({ type: PlayActionType.READY_PLACEMENT })}
                        sx={ready ? hocSoftButtonSx : hocPrimaryButtonSx}
                    >
                        {ready ? "Ready" : "Ready Placement"}
                    </Button>
                    {selectedUnit?.placed && selectedUnit.team === userTeam && (
                        <Button
                            variant="soft"
                            color="danger"
                            disabled={!canSubmit}
                            onClick={() => void submitGameAction({ type: "delete_unit", unitId: selectedUnit.id })}
                        >
                            Remove Selected
                        </Button>
                    )}
                    <Typography level="body-xs" textColor={hocColors.muted}>
                        Pick a unit here, then place it on your highlighted side of the board.
                    </Typography>
                    <Stack spacing={0.5}>
                        {unplacedUnits.map((unit) => (
                            <Button
                                key={unit.id}
                                size="sm"
                                variant={selectedUnit?.id === unit.id ? "solid" : "soft"}
                                onClick={() => selectUnit(unit)}
                                sx={{
                                    justifyContent: "space-between",
                                    ...(selectedUnit?.id === unit.id ? hocPrimaryButtonSx : hocSoftButtonSx),
                                }}
                            >
                                <span>{unit.name}</span>
                                <span>x{unit.amountAlive}</span>
                            </Button>
                        ))}
                    </Stack>
                </Stack>
            )}

            {gameStarted && (
                <Typography level="body-xs" textColor={hocColors.muted}>
                    Use the board and combat toolbar for movement, attacks, spells, and turn actions.
                </Typography>
            )}

            {busy && (
                <Stack direction="row" spacing={1} alignItems="center">
                    <CircularProgress size="sm" />
                    <Typography level="body-sm" textColor={hocColors.mutedStrong}>
                        Submitting
                    </Typography>
                </Stack>
            )}
            {error && (
                <Alert variant="soft" color="danger">
                    {error}
                </Alert>
            )}
        </Stack>
    </Sheet>
);
