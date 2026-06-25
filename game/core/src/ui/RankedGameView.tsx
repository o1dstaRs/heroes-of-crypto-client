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
import {
    collectRankedReplaySnapshots,
    createSandboxReplayFromRankedReplay,
    parseRankedReplayAction,
    type RankedReplayActionRecord,
} from "../replay/ranked_replay";
import { getLocalModelOpponentConfig, isLocalModelAction } from "../scenes/LocalModelOpponent";
import { authoritativeSnapshotToSandboxSceneState, RankedPlayScene } from "../scenes/RankedPlayScene";
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
    if (team === TeamVals.LOWER) return "Green";
    if (team === TeamVals.UPPER) return "Red";
    return "Neutral";
};

const controlledUnitIdForAction = (action: GameAction): string | undefined => {
    switch (action.type) {
        case "select_attack_type":
        case "move_unit":
        case "wait_turn":
        case "defend_turn":
        case "end_turn":
        case "delete_unit":
            return action.unitId;
        case "place_unit":
            return action.unitId;
        case "melee_attack":
        case "range_attack":
        case "obstacle_attack":
        case "area_throw_attack":
            return action.attackerId;
        case "cast_spell":
            return action.casterId;
        default:
            return undefined;
    }
};

const teamForAction = (snapshot: PlaySnapshot | null, action: GameAction): TeamType | undefined => {
    if (action.type === "place_unit") {
        return action.team as TeamType;
    }
    const controlledUnitId = controlledUnitIdForAction(action);
    if (!controlledUnitId) {
        return undefined;
    }
    return snapshot?.units.find((unit) => unit.id === controlledUnitId)?.team as TeamType | undefined;
};

const isTurnResolvingAction = (action: GameAction): boolean => {
    switch (action.type) {
        case "end_turn":
        case "wait_turn":
        case "defend_turn":
        case "melee_attack":
        case "range_attack":
        case "obstacle_attack":
        case "area_throw_attack":
        case "cast_spell":
            return true;
        default:
            return false;
    }
};

type Props = {
    gameId: string;
    userTeam: TeamType;
    windowSize: IWindowSize;
};

export const RankedGameView: React.FC<Props> = ({ gameId, userTeam, windowSize }) => {
    const manager = usePixiManager();
    const localModelConfig = useMemo(() => getLocalModelOpponentConfig(), []);
    const viewerTeam = userTeam === TeamVals.NO_TEAM ? undefined : userTeam;
    const [snapshot, setSnapshot] = useState<PlaySnapshot | null>(null);
    const [selectedUnitId, setSelectedUnitId] = useState("");
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState("Connecting");
    const [error, setError] = useState("");
    const [pixiReady, setPixiReady] = useState(!manager.isLoading);
    const abortRef = useRef<AbortController | null>(null);
    const latestSequenceRef = useRef(0);
    const snapshotRef = useRef<PlaySnapshot | null>(null);
    const actionQueueRef = useRef<Promise<void>>(Promise.resolve());
    const replayTimersRef = useRef<number[]>([]);
    const pendingTurnResolutionRef = useRef(false);
    const pendingAuthoritativeRecordsRef = useRef(new Map<number, RankedReplayActionRecord>());
    const playedAuthoritativeSequencesRef = useRef(new Set<number>());
    const authoritativePlaybackQueueRef = useRef<Promise<void>>(Promise.resolve());

    const applySnapshot = useCallback((nextSnapshot: PlaySnapshot) => {
        pendingTurnResolutionRef.current = false;
        latestSequenceRef.current = Math.max(latestSequenceRef.current, nextSnapshot.latestSequence);
        snapshotRef.current = nextSnapshot;
        setSnapshot(nextSnapshot);
    }, []);

    const rememberAuthoritativeRecord = useCallback((entry: PlaySnapshot["journalTail"][number] | undefined) => {
        if (!entry || playedAuthoritativeSequencesRef.current.has(entry.sequence)) {
            return;
        }
        const record = parseRankedReplayAction(entry);
        if (!record || !record.events.length) {
            return;
        }
        pendingAuthoritativeRecordsRef.current.set(record.sequence, record);
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

    useEffect(() => {
        const connection = manager.onSelectionCombined.connect(({ unit }) => {
            setSelectedUnitId(unit?.id ?? "");
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
        manager.ApplyAuthoritativeSnapshot(toAuthoritativeGameSnapshot(snapshot, viewerTeam));
        if (selectedUnitId && snapshot.units.some((unit) => unit.id === selectedUnitId && !unit.dead)) {
            manager.SelectAuthoritativeUnit(selectedUnitId);
        }
        const records = [...pendingAuthoritativeRecordsRef.current.entries()]
            .filter(([sequence]) => sequence <= snapshot.latestSequence)
            .sort(([a], [b]) => a - b);
        for (const [sequence, record] of records) {
            pendingAuthoritativeRecordsRef.current.delete(sequence);
            if (playedAuthoritativeSequencesRef.current.has(sequence)) {
                continue;
            }
            playedAuthoritativeSequencesRef.current.add(sequence);
            authoritativePlaybackQueueRef.current = authoritativePlaybackQueueRef.current
                .catch(() => undefined)
                .then(async () => {
                    await manager.PlayAuthoritativeActionRecord(record.action, record.events);
                });
        }
    }, [manager, pixiReady, selectedUnitId, snapshot, viewerTeam]);

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
                        rememberAuthoritativeRecord(event.journalEntry);
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
    }, [applySnapshot, gameId, rememberAuthoritativeRecord]);

    const myPlayer = useMemo(() => snapshot?.players.find((player) => player.team === userTeam), [snapshot, userTeam]);
    const isObserver = userTeam === TeamVals.NO_TEAM || !myPlayer;
    const selectedUnit = useMemo(
        () => snapshot?.units.find((unit) => unit.id === selectedUnitId),
        [selectedUnitId, snapshot],
    );
    const currentUnit = useMemo(() => snapshot?.units.find((unit) => unit.id === snapshot.currentUnitId), [snapshot]);
    const ready = !isObserver && !!myPlayer && !!snapshot?.readyPlayerIds.includes(myPlayer.playerId);
    const canSubmit = !!snapshot && !isObserver && !!myPlayer && !busy;
    const gameStarted =
        !!snapshot &&
        (snapshot.fightStarted || snapshot.phase === PlayPhase.PLAY || snapshot.phase === PlayPhase.FINISHED);

    const sendPlayAction = useCallback(
        async (payload: PlayAction, options?: { authorization?: string }): Promise<boolean> => {
            const isModelSubmission =
                !!options?.authorization && localModelConfig.enabled && payload.team === localModelConfig.modelTeam;
            if (isObserver && !isModelSubmission) {
                setError("Observer mode is read-only");
                return false;
            }
            if (!isModelSubmission) {
                setBusy(true);
            }
            setError("");
            try {
                const result = await sendRankedPlayAction(gameId, payload, options);
                latestSequenceRef.current = Math.max(latestSequenceRef.current, result.sequence);
                if (payload.type === PlayActionType.PING && result.accepted) {
                    return true;
                }
                rememberAuthoritativeRecord(result.event?.journalEntry);
                if (result.event?.snapshot) {
                    applySnapshot(result.event.snapshot);
                } else {
                    await refreshSnapshot();
                }
                if (!result.accepted) {
                    pendingTurnResolutionRef.current = false;
                    setError(result.rejectionReason || result.message || "Action rejected");
                    return false;
                }
                return true;
            } catch (err: unknown) {
                pendingTurnResolutionRef.current = false;
                setError((err as Error).message || "Unable to submit action");
                return false;
            } finally {
                if (!isModelSubmission) {
                    setBusy(false);
                }
            }
        },
        [
            applySnapshot,
            gameId,
            isObserver,
            localModelConfig.enabled,
            localModelConfig.modelTeam,
            refreshSnapshot,
            rememberAuthoritativeRecord,
        ],
    );

    const buildActionEnvelope = useCallback((team: TeamType = userTeam) => {
        const isModelTeam = localModelConfig.enabled && team === localModelConfig.modelTeam;
        if (isObserver && !isModelTeam) {
            return undefined;
        }
        const latestSnapshot = snapshotRef.current;
        const currentPlayer = latestSnapshot?.players.find((player) => player.team === team);
        if (!latestSnapshot || !currentPlayer) {
            return undefined;
        }
        return {
            actionId: uuidv4(),
            gameId,
            playerId: currentPlayer.playerId,
            expectedSequence: latestSequenceRef.current || latestSnapshot.latestSequence,
            team,
        };
    }, [gameId, isObserver, localModelConfig.enabled, localModelConfig.modelTeam, userTeam]);

    const queueActionSubmission = useCallback((submit: () => Promise<void>): Promise<void> => {
        const nextSubmission = actionQueueRef.current.catch(() => undefined).then(submit);
        actionQueueRef.current = nextSubmission.catch(() => undefined);
        return nextSubmission;
    }, []);

    const submitProtocolActionForTeam = useCallback(
        async (action: Partial<PlayAction>, team: TeamType, authorization?: string) => {
            await queueActionSubmission(async () => {
                const envelope = buildActionEnvelope(team);
                if (!envelope) return;

                await sendPlayAction({
                    ...envelope,
                    type: PlayActionType.UNKNOWN,
                    ...action,
                }, authorization ? { authorization } : undefined);
            });
        },
        [buildActionEnvelope, queueActionSubmission, sendPlayAction],
    );

    const submitProtocolAction = useCallback(
        async (action: Partial<PlayAction>) => {
            await submitProtocolActionForTeam(action, userTeam);
        },
        [submitProtocolActionForTeam, userTeam],
    );

    const submitGameActionForTeam = useCallback(
        async (action: GameAction, team: TeamType, authorization?: string) => {
            await queueActionSubmission(async () => {
                const envelope = buildActionEnvelope(team);
                if (!envelope) return;

                await sendPlayAction(createPlayActionFromGameAction(action, envelope), authorization ? { authorization } : undefined);
            });
        },
        [buildActionEnvelope, queueActionSubmission, sendPlayAction],
    );

    const submitGameAction = useCallback(
        async (action: GameAction) => {
            await submitGameActionForTeam(action, userTeam);
        },
        [submitGameActionForTeam, userTeam],
    );

    useEffect(() => {
        if (!localModelConfig.enabled || !localModelConfig.authorization) {
            return undefined;
        }

        const pingModelPlayer = () => {
            void submitProtocolActionForTeam(
                { type: PlayActionType.PING },
                localModelConfig.modelTeam,
                localModelConfig.authorization,
            );
        };
        const timer = window.setInterval(pingModelPlayer, 8_000);
        pingModelPlayer();
        return () => window.clearInterval(timer);
    }, [
        localModelConfig.authorization,
        localModelConfig.enabled,
        localModelConfig.modelTeam,
        submitProtocolActionForTeam,
    ]);

    const transport = useCallback<SceneGameActionTransport>(
        (action) => {
            if (pendingTurnResolutionRef.current) {
                return {
                    handled: true,
                    completed: false,
                    message: "Waiting for server turn update",
                };
            }

            const actionTeam = teamForAction(snapshotRef.current, action);
            const isModelSubmission =
                localModelConfig.enabled &&
                localModelConfig.authorization &&
                actionTeam === localModelConfig.modelTeam &&
                isLocalModelAction(action);

            if (actionTeam !== undefined && actionTeam !== userTeam && !isModelSubmission) {
                return {
                    handled: true,
                    completed: false,
                    message:
                        action.type === "place_unit" || action.type === "delete_unit"
                            ? "Opponent placement is controlled by the opponent"
                            : "Opponent turn is controlled by the opponent",
                };
            }

            if (isModelSubmission) {
                if (isTurnResolvingAction(action)) {
                    pendingTurnResolutionRef.current = true;
                }
                void submitGameActionForTeam(action, localModelConfig.modelTeam, localModelConfig.authorization);
                return { handled: true, completed: true, message: "Submitted model action to ranked server" };
            }
            if (isObserver) {
                return { handled: true, completed: false, message: "Observer mode is read-only" };
            }
            if (isTurnResolvingAction(action)) {
                pendingTurnResolutionRef.current = true;
            }
            void submitGameAction(action);
            return { handled: true, completed: true, message: "Submitted to ranked server" };
        },
        [
            isObserver,
            localModelConfig.authorization,
            localModelConfig.enabled,
            localModelConfig.modelTeam,
            submitGameAction,
            submitGameActionForTeam,
            userTeam,
        ],
    );

    const replayRankedFight = useCallback(async () => {
        clearReplayTimers();
        setBusy(true);
        setStatus("Loading replay");
        setError("");

        try {
            const replay = await fetchRankedPlayReplay(gameId);
            const sandboxReplay = createSandboxReplayFromRankedReplay(replay, {
                snapshotToState: (playSnapshot) =>
                    authoritativeSnapshotToSandboxSceneState(toAuthoritativeGameSnapshot(playSnapshot, viewerTeam)),
            });

            setStatus("Replaying");
            if (sandboxReplay) {
                const replayed = await manager.PlaySandboxReplay(sandboxReplay);
                if (replayed) {
                    setStatus("Connected");
                    return;
                }
            }

            const replaySnapshots = collectRankedReplaySnapshots(replay);
            if (!replaySnapshots.length) {
                throw new Error("Replay has no snapshots to play");
            }

            const stepDelayMs = 550;
            for (let index = 0; index < replaySnapshots.length; index += 1) {
                if (index > 0) {
                    await new Promise<void>((resolve) => {
                        const timer = window.setTimeout(() => {
                            replayTimersRef.current = replayTimersRef.current.filter((value) => value !== timer);
                            resolve();
                        }, stepDelayMs);
                        replayTimersRef.current.push(timer);
                    });
                }
                const replaySnapshot = replaySnapshots[index];
                if (replaySnapshot) {
                    manager.ApplyAuthoritativeReplaySnapshot(toAuthoritativeGameSnapshot(replaySnapshot, viewerTeam));
                }
            }
            setStatus("Connected");
        } catch (err: unknown) {
            setStatus("Replay failed");
            setError((err as Error).message || "Unable to load replay");
        } finally {
            setBusy(false);
        }
    }, [clearReplayTimers, gameId, manager, viewerTeam]);

    useEffect(() => {
        manager.SetGameActionTransport(transport);
        return () => manager.SetGameActionTransport(undefined);
    }, [manager, transport]);

    const modelPlacementReadyKeyRef = useRef("");
    useEffect(() => {
        if (
            !localModelConfig.enabled ||
            !localModelConfig.authorization ||
            !snapshot ||
            snapshot.phase !== PlayPhase.PLACEMENT
        ) {
            return;
        }
        const modelPlayer = snapshot.players.find((player) => player.team === localModelConfig.modelTeam);
        if (!modelPlayer || snapshot.readyPlayerIds.includes(modelPlayer.playerId)) {
            return;
        }

        const readyKey = `${snapshot.gameId}:${snapshot.latestSequence}:${modelPlayer.playerId}`;
        if (modelPlacementReadyKeyRef.current === readyKey) {
            return;
        }
        modelPlacementReadyKeyRef.current = readyKey;
        window.setTimeout(() => {
            void submitProtocolActionForTeam(
                { type: PlayActionType.READY_PLACEMENT },
                localModelConfig.modelTeam,
                localModelConfig.authorization,
            );
        }, 650);
    }, [localModelConfig, snapshot, submitProtocolActionForTeam]);

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

    const rankedPanel = (
        <RankedOverlay
            busy={busy}
            canSubmit={canSubmit}
            currentUnit={currentUnit}
            embedded={gameStarted}
            error={error}
            gameStarted={gameStarted}
            ready={ready}
            selectedUnit={selectedUnit}
            snapshot={snapshot}
            status={status}
            submitGameAction={submitGameAction}
            submitProtocolAction={submitProtocolAction}
            userTeam={userTeam}
            isObserver={isObserver}
        />
    );

    return (
        <ButtonProvider>
            <div
                className="container"
                style={{
                    display: "flex",
                    position: "relative",
                    width: "100vw",
                    height: "100vh",
                    overflow: "hidden",
                    backgroundColor: "#07090d",
                }}
            >
                <CssVarsProvider>
                    <CssBaseline />
                    {gameStarted && <LeftSideBar gameStarted={gameStarted} windowSize={windowSize} />}
                    {gameStarted && (
                        <RightSideBar gameStarted={gameStarted} windowSize={windowSize} rankedPanel={rankedPanel} />
                    )}
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
                {!gameStarted && rankedPanel}
            </div>
        </ButtonProvider>
    );
};

interface RankedOverlayProps {
    busy: boolean;
    canSubmit: boolean;
    currentUnit?: PlayUnitState;
    embedded?: boolean;
    error: string;
    gameStarted: boolean;
    ready: boolean;
    selectedUnit?: PlayUnitState;
    snapshot: PlaySnapshot;
    status: string;
    submitGameAction: (action: GameAction) => Promise<void>;
    submitProtocolAction: (action: Partial<PlayAction>) => Promise<void>;
    userTeam: TeamType;
    isObserver: boolean;
}

const RankedOverlay: React.FC<RankedOverlayProps> = ({
    busy,
    canSubmit,
    currentUnit,
    embedded = false,
    error,
    gameStarted,
    ready,
    selectedUnit,
    snapshot,
    status,
    submitGameAction,
    submitProtocolAction,
    userTeam,
    isObserver,
}) => (
    <Sheet
        variant="outlined"
        sx={{
            position: embedded ? "static" : "fixed",
            top: embedded ? undefined : 12,
            right: embedded ? undefined : 12,
            zIndex: embedded ? "auto" : 20,
            width: embedded ? "100%" : { xs: "calc(100vw - 24px)", sm: 340 },
            maxHeight: embedded ? "none" : "calc(100vh - 24px)",
            overflow: embedded ? "visible" : "auto",
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
                {isObserver && (
                    <Chip size="sm" variant="soft" color="primary">
                        Observer
                    </Chip>
                )}
            </Stack>

            <WalletLinker compact />

            <Typography level="body-sm" textColor={hocColors.mutedStrong}>
                {isObserver ? "Watching as observer" : `You: ${teamLabel(userTeam)}`}
                {currentUnit ? ` | Active: ${currentUnit.name} (${teamLabel(currentUnit.team)})` : ""}
            </Typography>

            {snapshot.phase === PlayPhase.PLACEMENT && !isObserver && (
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
                </Stack>
            )}

            {gameStarted && !isObserver && (
                <Typography level="body-xs" textColor={hocColors.muted}>
                    Use the board and combat toolbar for movement, attacks, spells, and turn actions.
                </Typography>
            )}

            {isObserver && (
                <Typography level="body-xs" textColor={hocColors.muted}>
                    Live observer mode. Controls are disabled; replay is available after the fight ends.
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
