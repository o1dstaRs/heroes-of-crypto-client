import { AttackVals, TeamVals, type GameAction, type TeamType } from "@heroesofcrypto/common";
import { Alert, Box, Button, Chip, CircularProgress, Sheet, Slider, Stack, Typography } from "@mui/joy";
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
    sendRankedPlayMoveIntent,
    toAuthoritativeGameSnapshot,
} from "../api/ranked_play_client";
import { PlayActionType, PlayEventKind, PlayPhase } from "../api/play_protocol";
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
import { ViewerTeamContext } from "./context/ViewerTeamContext";
import { hocColors, hocPanelSx, hocPrimaryButtonSx, hocSoftButtonSx } from "./hocTheme";
import {
    resolveEffectiveLocalModelOpponentConfig,
    shouldApplyActionResponseSnapshotToViewer,
} from "./rankedActionResponse";
import { resolveUnitImage } from "./unitImage";

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
        case "split_unit":
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
        case "move_unit":
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

const canPlayAuthoritativeRecord = (action: GameAction, snapshot: PlaySnapshot | null): boolean => {
    if (snapshot?.phase !== PlayPhase.PLAY && snapshot?.phase !== PlayPhase.FINISHED) {
        return false;
    }

    switch (action.type) {
        case "start_fight":
        case "place_unit":
        case "delete_unit":
        case "split_unit":
            return false;
        default:
            return true;
    }
};

const isRangedSnapshotUnit = (unit: PlayUnitState): boolean => unit.attackType === AttackVals.RANGE;

const cellsForSnapshotUnitAt = (unit: PlayUnitState, cell: { x: number; y: number }): { x: number; y: number }[] => {
    if (unit.size <= 1) {
        return [{ x: cell.x, y: cell.y }];
    }
    return [
        { x: cell.x, y: cell.y },
        { x: cell.x + 1, y: cell.y },
        { x: cell.x, y: cell.y + 1 },
        { x: cell.x + 1, y: cell.y + 1 },
    ];
};

const cellKey = (cell: { x: number; y: number }): string => `${cell.x}:${cell.y}`;

const isDefaultPlacementCell = (cell: { x: number; y: number }, team: TeamType): boolean => {
    const inX = cell.x >= 1 && cell.x <= 14;
    const inY = team === TeamVals.UPPER ? cell.y >= 12 && cell.y <= 14 : cell.y >= 1 && cell.y <= 3;
    return inX && inY;
};

const fallbackPlacementAnchors = (team: TeamType, large: boolean, ranged: boolean): Array<{ x: number; y: number }> => {
    const xs = large ? [7, 5, 9, 3, 11, 1, 13] : [7, 8, 6, 9, 5, 10, 4, 11, 3, 12, 2, 13, 1, 14];
    const ys =
        team === TeamVals.UPPER
            ? large
                ? ranged
                    ? [13, 12]
                    : [12, 13]
                : ranged
                  ? [14, 13, 12]
                  : [12, 13, 14]
            : large
              ? ranged
                  ? [1, 2]
                  : [2, 1]
              : ranged
                ? [1, 2, 3]
                : [3, 2, 1];

    return ys.flatMap((y) => xs.map((x) => ({ x, y })));
};

const modelPlacementAnchors = (unit: PlayUnitState, team: TeamType): { x: number; y: number }[] => {
    const ranged = isRangedSnapshotUnit(unit);
    const large = unit.size > 1;
    return fallbackPlacementAnchors(team, large, ranged);
};

const createModelPlacementActions = (snapshot: PlaySnapshot, team: TeamType): Partial<PlayAction>[] => {
    const occupied = new Set<string>();
    for (const unit of snapshot.units) {
        if (!unit.placed) {
            continue;
        }
        for (const cell of unit.cells) {
            occupied.add(cellKey(cell));
        }
    }

    const unplaced = snapshot.units
        .filter((unit) => unit.team === team && !unit.dead && (!unit.placed || !unit.cells.length))
        .sort((a, b) => {
            if (a.size !== b.size) return b.size - a.size;
            if (isRangedSnapshotUnit(a) !== isRangedSnapshotUnit(b)) return isRangedSnapshotUnit(a) ? 1 : -1;
            return b.speed - a.speed;
        });

    const actions: Partial<PlayAction>[] = [];
    for (const unit of unplaced) {
        for (const anchor of modelPlacementAnchors(unit, team)) {
            const cells = cellsForSnapshotUnitAt(unit, anchor);
            if (
                cells.every(
                    (cell) =>
                        isDefaultPlacementCell(cell, team) &&
                        !occupied.has(cellKey(cell)) &&
                        Number.isInteger(cell.x) &&
                        Number.isInteger(cell.y),
                )
            ) {
                for (const cell of cells) {
                    occupied.add(cellKey(cell));
                }
                actions.push({
                    type: PlayActionType.PLACE_UNIT,
                    unitId: unit.id,
                    team,
                    unitName: unit.name,
                    cells,
                });
                break;
            }
        }
    }
    return actions;
};

type Props = {
    gameId: string;
    userTeam: TeamType;
    windowSize: IWindowSize;
};

type PendingAuthoritativePlayback = {
    record: RankedReplayActionRecord;
    stateAfterSnapshot?: PlaySnapshot;
};

export const RankedGameView: React.FC<Props> = ({ gameId, userTeam, windowSize }) => {
    const manager = usePixiManager();
    const localModelConfig = useMemo(() => getLocalModelOpponentConfig(), []);
    const viewerTeam = userTeam === TeamVals.NO_TEAM ? undefined : userTeam;
    const [snapshot, setSnapshot] = useState<PlaySnapshot | null>(null);
    const effectiveLocalModelConfig = useMemo(
        () => resolveEffectiveLocalModelOpponentConfig(localModelConfig, snapshot, viewerTeam),
        [localModelConfig, snapshot, viewerTeam],
    );
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
    // Tracks consecutive server rejections at the same turn (expectedSequence). If the same turn keeps
    // getting rejected (e.g. an autobattle AI proposing an illegal move/attack the server refuses, or
    // a residual desync), we force a server-authoritative END_TURN to skip the stuck unit so the game
    // can never deadlock on a repeatedly-rejected action.
    const rejectionStreakRef = useRef<{ seq: number; count: number }>({ seq: -1, count: 0 });
    // Timestamp (ms) when pendingTurnResolutionRef was last raised — used to auto-expire a stuck gate.
    const pendingTurnResolutionSinceRef = useRef(0);
    const pendingAuthoritativeRecordsRef = useRef(new Map<number, PendingAuthoritativePlayback>());
    const playedAuthoritativeSequencesRef = useRef(new Set<number>());
    const authoritativePlaybackQueueRef = useRef<Promise<void>>(Promise.resolve());
    // True when the current snapshot's board changes were already animated by playing the
    // matching authoritative action record — tells the scene to skip the full rebuild.
    const skipBoardRebuildRef = useRef(false);
    const forceBoardRebuildRef = useRef(false);

    const applySnapshot = useCallback(
        (nextSnapshot: PlaySnapshot, options?: { skipBoardRebuild?: boolean; forceBoardRebuild?: boolean }) => {
            pendingTurnResolutionRef.current = false;
            latestSequenceRef.current = Math.max(latestSequenceRef.current, nextSnapshot.latestSequence);
            skipBoardRebuildRef.current = !!options?.skipBoardRebuild;
            // Sticky until consumed by the snapshot effect — a forced resync must rebuild the board
            // even if an identical snapshot object reference would otherwise no-op the effect.
            forceBoardRebuildRef.current = forceBoardRebuildRef.current || !!options?.forceBoardRebuild;
            snapshotRef.current = nextSnapshot;
            setSnapshot(nextSnapshot);
        },
        [],
    );
    const toSceneSnapshot = useCallback(
        (playSnapshot: PlaySnapshot) =>
            toAuthoritativeGameSnapshot(
                playSnapshot,
                viewerTeam,
                effectiveLocalModelConfig.enabled ? effectiveLocalModelConfig.modelTeam : undefined,
            ),
        [effectiveLocalModelConfig.enabled, effectiveLocalModelConfig.modelTeam, viewerTeam],
    );

    const rememberAuthoritativeRecord = useCallback(
        (
            entry: PlaySnapshot["journalTail"][number] | undefined,
            options: { stateAfterSnapshot?: PlaySnapshot } = {},
        ) => {
            if (!entry || playedAuthoritativeSequencesRef.current.has(entry.sequence)) {
                return;
            }
            const record = parseRankedReplayAction(entry);
            if (!record || !record.events.length) {
                return;
            }
            if (
                !canPlayAuthoritativeRecord(record.action, snapshotRef.current) &&
                !canPlayAuthoritativeRecord(record.action, options.stateAfterSnapshot ?? null)
            ) {
                return;
            }
            pendingAuthoritativeRecordsRef.current.set(record.sequence, {
                record,
                stateAfterSnapshot: options.stateAfterSnapshot,
            });
        },
        [],
    );

    const waitForAuthoritativePlayback = useCallback(async (): Promise<void> => {
        try {
            await authoritativePlaybackQueueRef.current;
        } catch {
            return;
        }
    }, []);

    const playAuthoritativeRecordData = useCallback(
        async (record: RankedReplayActionRecord, stateAfterSnapshot?: PlaySnapshot): Promise<boolean> => {
            if (!pixiReady || playedAuthoritativeSequencesRef.current.has(record.sequence)) {
                return false;
            }
            if (
                !record.events.length ||
                (!canPlayAuthoritativeRecord(record.action, snapshotRef.current) &&
                    !canPlayAuthoritativeRecord(record.action, stateAfterSnapshot ?? null))
            ) {
                return false;
            }

            playedAuthoritativeSequencesRef.current.add(record.sequence);
            pendingAuthoritativeRecordsRef.current.delete(record.sequence);
            let didPlay = false;
            authoritativePlaybackQueueRef.current = authoritativePlaybackQueueRef.current
                .catch(() => undefined)
                .then(async () => {
                    didPlay = await manager.PlayAuthoritativeActionRecord(
                        record.action,
                        record.events,
                        stateAfterSnapshot ? toSceneSnapshot(stateAfterSnapshot) : undefined,
                    );
                });
            try {
                await authoritativePlaybackQueueRef.current;
            } catch {
                playedAuthoritativeSequencesRef.current.delete(record.sequence);
                return false;
            }
            if (!didPlay) {
                playedAuthoritativeSequencesRef.current.delete(record.sequence);
            }
            return didPlay;
        },
        [manager, pixiReady, toSceneSnapshot],
    );
    const playAuthoritativeRecord = useCallback(
        async (
            entry: PlaySnapshot["journalTail"][number] | undefined,
            stateAfterSnapshot?: PlaySnapshot,
        ): Promise<boolean> => {
            if (!entry) {
                return false;
            }
            const record = parseRankedReplayAction(entry);
            if (!record) {
                return false;
            }
            return playAuthoritativeRecordData(record, stateAfterSnapshot);
        },
        [playAuthoritativeRecordData],
    );
    const drainPendingAuthoritativeRecords = useCallback(
        async (stateAfterSnapshot: PlaySnapshot): Promise<boolean> => {
            const pending = [...pendingAuthoritativeRecordsRef.current.entries()]
                .filter(([sequence]) => sequence <= stateAfterSnapshot.latestSequence)
                .sort(([a], [b]) => a - b);
            let playedAny = false;
            for (const [sequence, pendingRecord] of pending) {
                const played = await playAuthoritativeRecordData(
                    pendingRecord.record,
                    pendingRecord.stateAfterSnapshot ?? stateAfterSnapshot,
                );
                pendingAuthoritativeRecordsRef.current.delete(sequence);
                playedAny ||= played;
            }
            return playedAny;
        },
        [playAuthoritativeRecordData],
    );

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
        let cancelled = false;
        void (async () => {
            const playedPendingRecords = await drainPendingAuthoritativeRecords(snapshot);
            if (cancelled) {
                return;
            }
            const forceBoardRebuild = forceBoardRebuildRef.current;
            forceBoardRebuildRef.current = false;
            manager.ApplyAuthoritativeSnapshot(toSceneSnapshot(snapshot), {
                // A forced resync (post-rejection desync heal) must win over skipBoardRebuild.
                skipBoardRebuild: !forceBoardRebuild && (skipBoardRebuildRef.current || playedPendingRecords),
                forceBoardRebuild,
            });
            if (selectedUnitId && snapshot.units.some((unit) => unit.id === selectedUnitId && !unit.dead)) {
                manager.SelectAuthoritativeUnit(selectedUnitId);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [drainPendingAuthoritativeRecords, manager, pixiReady, selectedUnitId, snapshot, toSceneSnapshot]);

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

        // Periodic snapshot refresh as a fallback — keeps the board in sync even if SSE
        // drops or lags. Polls every 4 seconds; the snapshot endpoint is cheap.
        const pollInterval = window.setInterval(() => {
            if (cancelled) return;
            refreshSnapshot().catch(() => undefined);
        }, 4000);

        return () => {
            cancelled = true;
            window.clearInterval(pollInterval);
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

                        // Ephemeral opponent move-aim hint: forward the silhouette to the scene
                        // and skip all authoritative processing (no snapshot/journal/sequence).
                        if (event.kind === PlayEventKind.MOVE_INTENT) {
                            const intent = event.intent;
                            if (intent?.active && intent.targetCell && intent.unitId) {
                                manager.SetOpponentMoveIntent({
                                    unitId: intent.unitId,
                                    cell: { x: intent.targetCell.x, y: intent.targetCell.y },
                                });
                            } else {
                                manager.SetOpponentMoveIntent(undefined);
                            }
                            continue;
                        }

                        latestSequenceRef.current = Math.max(latestSequenceRef.current, event.sequence);
                        const played = await playAuthoritativeRecord(event.journalEntry, event.snapshot);
                        if (!played) {
                            rememberAuthoritativeRecord(event.journalEntry, {
                                stateAfterSnapshot: event.snapshot,
                            });
                        }
                        if (event.snapshot) {
                            await waitForAuthoritativePlayback();
                            applySnapshot(event.snapshot, { skipBoardRebuild: played });
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
    }, [
        applySnapshot,
        gameId,
        manager,
        playAuthoritativeRecord,
        rememberAuthoritativeRecord,
        waitForAuthoritativePlayback,
    ]);

    const myPlayer = useMemo(() => snapshot?.players.find((player) => player.team === userTeam), [snapshot, userTeam]);
    const isObserver = userTeam === TeamVals.NO_TEAM || !myPlayer;
    const selectedUnit = useMemo(
        () => snapshot?.units.find((unit) => unit.id === selectedUnitId),
        [selectedUnitId, snapshot],
    );
    const currentUnit = useMemo(() => snapshot?.units.find((unit) => unit.id === snapshot.currentUnitId), [snapshot]);
    const ready = !isObserver && !!myPlayer && !!snapshot?.readyPlayerIds.includes(myPlayer.playerId);
    const canSubmit = !!snapshot && !isObserver && !!myPlayer && !busy;
    const hasSnapshot = !!snapshot;
    const gameStarted =
        !!snapshot &&
        (snapshot.fightStarted || snapshot.phase === PlayPhase.PLAY || snapshot.phase === PlayPhase.FINISHED);

    const sendPlayAction = useCallback(
        async (payload: PlayAction, options?: { authorization?: string; silent?: boolean }): Promise<boolean> => {
            const isModelSubmission =
                !!options?.authorization &&
                effectiveLocalModelConfig.enabled &&
                payload.team === effectiveLocalModelConfig.modelTeam;
            const isSilent = options?.silent === true;
            if (isObserver && !isModelSubmission) {
                if (!isSilent) {
                    setError("Observer mode is read-only");
                }
                return false;
            }
            if (!isModelSubmission && !isSilent) {
                setBusy(true);
            }
            if (!isSilent) {
                setError("");
            }
            try {
                const result = await sendRankedPlayAction(gameId, payload, options);
                latestSequenceRef.current = Math.max(latestSequenceRef.current, result.sequence);
                if (payload.type === PlayActionType.PING && result.accepted) {
                    return true;
                }
                const responseSnapshot = result.event?.snapshot;
                // A rejection means the client's view disagrees with the server (e.g. it targeted a
                // unit the server already removed -> unit_not_found). Force a full board rebuild from
                // authoritative truth so the stale/ghost state is dropped instead of the snapshot
                // short-circuiting on an unchanged signature — which otherwise leaves the client (and
                // an autobattle AI) resubmitting the same illegal action forever.
                const rejected = !result.accepted;
                const played = await playAuthoritativeRecord(result.event?.journalEntry, responseSnapshot);
                if (!played) {
                    rememberAuthoritativeRecord(result.event?.journalEntry, {
                        stateAfterSnapshot: responseSnapshot,
                    });
                }
                if (
                    responseSnapshot &&
                    shouldApplyActionResponseSnapshotToViewer(responseSnapshot, { isModelSubmission })
                ) {
                    await waitForAuthoritativePlayback();
                    applySnapshot(responseSnapshot, { skipBoardRebuild: played, forceBoardRebuild: rejected });
                } else {
                    await waitForAuthoritativePlayback();
                    const fresh = await fetchRankedPlaySnapshot(gameId);
                    applySnapshot(fresh, { forceBoardRebuild: rejected });
                }
                if (rejected) {
                    pendingTurnResolutionRef.current = false;
                    setError(result.rejectionReason || result.message || "Action rejected");

                    // Escape hatch: if the SAME turn keeps getting rejected, the submitter (usually the
                    // autobattle AI) is stuck re-proposing an action the server won't accept. Force a
                    // server-authoritative END_TURN to skip the active unit so the fight can't deadlock.
                    const streak = rejectionStreakRef.current;
                    if (streak.seq === payload.expectedSequence) {
                        streak.count += 1;
                    } else {
                        rejectionStreakRef.current = { seq: payload.expectedSequence, count: 1 };
                    }
                    const activeUnitId = snapshotRef.current?.currentUnitId;
                    if (
                        rejectionStreakRef.current.count >= 3 &&
                        payload.type !== PlayActionType.END_TURN &&
                        activeUnitId
                    ) {
                        rejectionStreakRef.current = { seq: -1, count: 0 };
                        const escape = await sendRankedPlayAction(
                            gameId,
                            {
                                ...payload,
                                actionId: uuidv4(),
                                type: PlayActionType.END_TURN,
                                unitId: activeUnitId,
                                targetUnitId: "",
                                attackFrom: undefined,
                                path: [],
                                targetCells: [],
                                expectedSequence: latestSequenceRef.current,
                            },
                            options,
                        ).catch(() => undefined);
                        if (escape?.event?.snapshot) {
                            await waitForAuthoritativePlayback();
                            applySnapshot(escape.event.snapshot, { forceBoardRebuild: true });
                        }
                    }
                    return false;
                }
                rejectionStreakRef.current = { seq: -1, count: 0 };
                return true;
            } catch (err: unknown) {
                pendingTurnResolutionRef.current = false;
                if (!isSilent) {
                    setError((err as Error).message || "Unable to submit action");
                }
                return false;
            } finally {
                if (!isModelSubmission && !isSilent) {
                    setBusy(false);
                }
            }
        },
        [
            applySnapshot,
            gameId,
            isObserver,
            effectiveLocalModelConfig.enabled,
            effectiveLocalModelConfig.modelTeam,
            playAuthoritativeRecord,
            refreshSnapshot,
            rememberAuthoritativeRecord,
            waitForAuthoritativePlayback,
        ],
    );

    const buildActionEnvelope = useCallback(
        (team: TeamType = userTeam) => {
            const isModelTeam = effectiveLocalModelConfig.enabled && team === effectiveLocalModelConfig.modelTeam;
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
        },
        [gameId, isObserver, effectiveLocalModelConfig.enabled, effectiveLocalModelConfig.modelTeam, userTeam],
    );

    const queueActionSubmission = useCallback((submit: () => Promise<void>): Promise<void> => {
        const nextSubmission = actionQueueRef.current.catch(() => undefined).then(submit);
        actionQueueRef.current = nextSubmission.catch(() => undefined);
        return nextSubmission;
    }, []);

    const submitProtocolActionForTeam = useCallback(
        async (action: Partial<PlayAction>, team: TeamType, authorization?: string, options?: { silent?: boolean }) => {
            await queueActionSubmission(async () => {
                const envelope = buildActionEnvelope(team);
                if (!envelope) return;

                await sendPlayAction(
                    {
                        ...envelope,
                        type: PlayActionType.UNKNOWN,
                        ...action,
                    },
                    { authorization, silent: options?.silent },
                );
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

                await sendPlayAction(
                    createPlayActionFromGameAction(action, envelope),
                    authorization ? { authorization } : undefined,
                );
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
        if (!effectiveLocalModelConfig.enabled || !effectiveLocalModelConfig.authorization) {
            return undefined;
        }

        const pingModelPlayer = () => {
            void submitProtocolActionForTeam(
                { type: PlayActionType.PING, expectedSequence: 0 },
                effectiveLocalModelConfig.modelTeam,
                effectiveLocalModelConfig.authorization,
                { silent: true },
            );
        };
        const timer = window.setInterval(pingModelPlayer, 8_000);
        pingModelPlayer();
        return () => window.clearInterval(timer);
    }, [
        gameId,
        effectiveLocalModelConfig.authorization,
        effectiveLocalModelConfig.enabled,
        effectiveLocalModelConfig.modelTeam,
        submitProtocolActionForTeam,
    ]);

    useEffect(() => {
        if (isObserver || !hasSnapshot) {
            return undefined;
        }

        const pingHumanPlayer = () => {
            void submitProtocolActionForTeam({ type: PlayActionType.PING, expectedSequence: 0 }, userTeam, undefined, {
                silent: true,
            });
        };
        const timer = window.setInterval(pingHumanPlayer, 8_000);
        pingHumanPlayer();
        return () => window.clearInterval(timer);
    }, [gameId, hasSnapshot, isObserver, submitProtocolActionForTeam, userTeam]);

    const transport = useCallback<SceneGameActionTransport>(
        (action) => {
            // Auto-expire the turn-resolution gate: if it has been pending too long, the submit/playback
            // chain that should have cleared it is stuck. Don't block submissions forever (which would
            // silently freeze an autobattle AI) — treat a long-pending gate as stale and proceed.
            if (pendingTurnResolutionRef.current && Date.now() - pendingTurnResolutionSinceRef.current > 6000) {
                pendingTurnResolutionRef.current = false;
            }
            if (pendingTurnResolutionRef.current) {
                return {
                    handled: true,
                    completed: false,
                    message: "Waiting for server turn update",
                };
            }

            const actionTeam = teamForAction(snapshotRef.current, action);
            const isModelSubmission =
                effectiveLocalModelConfig.enabled &&
                effectiveLocalModelConfig.authorization &&
                actionTeam === effectiveLocalModelConfig.modelTeam &&
                isLocalModelAction(action);

            if (actionTeam !== undefined && actionTeam !== userTeam && !isModelSubmission) {
                return {
                    handled: true,
                    completed: false,
                    message:
                        action.type === "place_unit" || action.type === "delete_unit" || action.type === "split_unit"
                            ? "Opponent placement is controlled by the opponent"
                            : "Opponent turn is controlled by the opponent",
                };
            }

            if (isModelSubmission) {
                if (isTurnResolvingAction(action)) {
                    pendingTurnResolutionRef.current = true;
                    pendingTurnResolutionSinceRef.current = Date.now();
                }
                void submitGameActionForTeam(
                    action,
                    effectiveLocalModelConfig.modelTeam,
                    effectiveLocalModelConfig.authorization,
                );
                return { handled: true, completed: true };
            }
            if (isObserver) {
                return { handled: true, completed: false, message: "Observer mode is read-only" };
            }
            if (isTurnResolvingAction(action)) {
                pendingTurnResolutionRef.current = true;
                pendingTurnResolutionSinceRef.current = Date.now();
            }
            void submitGameAction(action);
            return { handled: true, completed: true };
        },
        [
            isObserver,
            effectiveLocalModelConfig.authorization,
            effectiveLocalModelConfig.enabled,
            effectiveLocalModelConfig.modelTeam,
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
                    authoritativeSnapshotToSandboxSceneState(toSceneSnapshot(playSnapshot)),
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
                    manager.ApplyAuthoritativeReplaySnapshot(toSceneSnapshot(replaySnapshot));
                }
            }
            setStatus("Connected");
        } catch (err: unknown) {
            setStatus("Replay failed");
            setError((err as Error).message || "Unable to load replay");
        } finally {
            setBusy(false);
        }
    }, [clearReplayTimers, gameId, manager, toSceneSnapshot]);

    useEffect(() => {
        manager.SetGameActionTransport(transport);
        return () => manager.SetGameActionTransport(undefined);
    }, [manager, transport]);

    // Relay our live move aim to the opponent, throttled so a fast-moving cursor produces a
    // steady trickle of hints rather than a flood. Clears (no cell) are sent immediately.
    useEffect(() => {
        if (isObserver) {
            manager.SetMoveIntentSink(undefined);
            return undefined;
        }
        const MIN_INTERVAL_MS = 80;
        let lastSentMs = 0;
        let pendingTimer: number | undefined;
        let pending: { unitId: string; cell?: { x: number; y: number } } | null = null;

        const flush = () => {
            pendingTimer = undefined;
            if (!pending) {
                return;
            }
            const aim = pending;
            pending = null;
            const snap = snapshotRef.current;
            const me = snap?.players.find((player) => player.team === userTeam);
            if (!snap || !me) {
                return;
            }
            // Active aims are only meaningful on our own turn; clears always go through.
            if (aim.cell && snap.currentTurnTeam !== userTeam) {
                return;
            }
            lastSentMs = performance.now();
            sendRankedPlayMoveIntent(gameId, {
                playerId: me.playerId,
                team: userTeam,
                unitId: aim.unitId,
                targetCell: aim.cell,
            });
        };

        const sink = (unitId: string | undefined, cell: { x: number; y: number } | undefined) => {
            pending = { unitId: unitId ?? "", cell: cell ? { x: cell.x, y: cell.y } : undefined };
            if (!cell) {
                if (pendingTimer !== undefined) {
                    window.clearTimeout(pendingTimer);
                }
                flush();
                return;
            }
            const now = performance.now();
            const dueAt = lastSentMs + MIN_INTERVAL_MS;
            if (now >= dueAt) {
                flush();
            } else if (pendingTimer === undefined) {
                pendingTimer = window.setTimeout(flush, dueAt - now);
            }
        };

        manager.SetMoveIntentSink(sink);
        return () => {
            if (pendingTimer !== undefined) {
                window.clearTimeout(pendingTimer);
            }
            manager.SetMoveIntentSink(undefined);
        };
    }, [manager, gameId, isObserver, userTeam]);

    const modelPlacementRunKeyRef = useRef("");
    useEffect(() => {
        if (
            !effectiveLocalModelConfig.enabled ||
            !effectiveLocalModelConfig.authorization ||
            !snapshot ||
            snapshot.phase !== PlayPhase.PLACEMENT
        ) {
            return;
        }
        const modelPlayer = snapshot.players.find((player) => player.team === effectiveLocalModelConfig.modelTeam);
        if (!modelPlayer || snapshot.readyPlayerIds.includes(modelPlayer.playerId)) {
            return;
        }

        const runKey = `${snapshot.gameId}:${modelPlayer.playerId}`;
        if (modelPlacementRunKeyRef.current === runKey) {
            return;
        }
        modelPlacementRunKeyRef.current = runKey;
        window.setTimeout(() => {
            void (async () => {
                let latestSnapshot = snapshotRef.current;
                try {
                    latestSnapshot = await fetchRankedPlaySnapshot(gameId, {
                        authorization: effectiveLocalModelConfig.authorization,
                    });
                } catch {
                    latestSnapshot = snapshotRef.current;
                }
                if (!latestSnapshot || latestSnapshot.phase !== PlayPhase.PLACEMENT) {
                    return;
                }
                const latestModelPlayer = latestSnapshot.players.find(
                    (player) => player.team === effectiveLocalModelConfig.modelTeam,
                );
                if (!latestModelPlayer || latestSnapshot.readyPlayerIds.includes(latestModelPlayer.playerId)) {
                    return;
                }

                for (const action of createModelPlacementActions(latestSnapshot, effectiveLocalModelConfig.modelTeam)) {
                    await submitProtocolActionForTeam(
                        action,
                        effectiveLocalModelConfig.modelTeam,
                        effectiveLocalModelConfig.authorization,
                    );
                }
                await submitProtocolActionForTeam(
                    { type: PlayActionType.READY_PLACEMENT },
                    effectiveLocalModelConfig.modelTeam,
                    effectiveLocalModelConfig.authorization,
                );
            })();
        }, 650);
    }, [
        effectiveLocalModelConfig.authorization,
        effectiveLocalModelConfig.enabled,
        effectiveLocalModelConfig.modelTeam,
        snapshot,
        submitProtocolActionForTeam,
    ]);

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
            embedded
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
                    <ViewerTeamContext.Provider value={viewerTeam}>
                        <LeftSideBar gameStarted={gameStarted} windowSize={windowSize} />
                    </ViewerTeamContext.Provider>
                    <RightSideBar gameStarted={gameStarted} windowSize={windowSize} rankedPanel={rankedPanel} />
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

interface RankedPlacementStackActionsProps {
    canSubmit: boolean;
    selectedUnit: PlayUnitState;
    snapshot: PlaySnapshot;
    submitGameAction: (action: GameAction) => Promise<void>;
    submitProtocolAction: (action: Partial<PlayAction>) => Promise<void>;
    userTeam: TeamType;
}

const RankedPlacementStackActions: React.FC<RankedPlacementStackActionsProps> = ({
    canSubmit,
    selectedUnit,
    snapshot,
    submitGameAction,
    submitProtocolAction,
    userTeam,
}) => {
    const amountAlive = Math.max(0, Math.floor(selectedUnit.amountAlive));
    const maxSplitAmount = Math.max(0, amountAlive - 1);
    const [splitAmount, setSplitAmount] = useState(Math.max(1, Math.floor(amountAlive / 2)));
    const maxUnits = userTeam === TeamVals.LOWER ? snapshot.maxLowerUnits : snapshot.maxUpperUnits;
    const effectiveMaxUnits = maxUnits > 0 ? maxUnits : Number.POSITIVE_INFINITY;
    const teamUnitCount = snapshot.units.filter((unit) => unit.team === userTeam && !unit.dead).length;
    const hasStackCapacity = teamUnitCount < effectiveMaxUnits;
    const canSplit = canSubmit && maxSplitAmount >= 1 && hasStackCapacity;
    const sliderValue = Math.min(Math.max(1, splitAmount), Math.max(1, maxSplitAmount));

    useEffect(() => {
        setSplitAmount(Math.max(1, Math.floor(amountAlive / 2)));
    }, [amountAlive, selectedUnit.id]);

    return (
        <Stack spacing={0.75}>
            {maxSplitAmount >= 1 && (
                <Sheet
                    variant="soft"
                    sx={{
                        p: 1,
                        borderRadius: 6,
                        bgcolor: "rgba(255,255,255,0.05)",
                        border: "1px solid rgba(255,255,255,0.1)",
                    }}
                >
                    <Stack spacing={0.5}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Typography level="body-sm" textColor={hocColors.parchment}>
                                Split stack
                            </Typography>
                            <Typography level="body-sm" textColor={hocColors.mutedStrong}>
                                {sliderValue} / {amountAlive - sliderValue}
                            </Typography>
                        </Stack>
                        <Slider
                            size="sm"
                            min={1}
                            max={Math.max(1, maxSplitAmount)}
                            value={sliderValue}
                            disabled={!canSplit}
                            onChange={(_, value) => setSplitAmount(Array.isArray(value) ? value[0] : value)}
                        />
                        <Button
                            variant="soft"
                            disabled={!canSplit}
                            onClick={() =>
                                void submitGameAction({
                                    type: "split_unit",
                                    unitId: selectedUnit.id,
                                    amount: sliderValue,
                                })
                            }
                        >
                            Split Selected
                        </Button>
                        {!hasStackCapacity && maxUnits > 0 && (
                            <Typography level="body-xs" textColor={hocColors.muted}>
                                Board stack limit reached ({teamUnitCount}/{maxUnits})
                            </Typography>
                        )}
                    </Stack>
                </Sheet>
            )}
            <Button
                variant="soft"
                color="danger"
                disabled={!canSubmit}
                onClick={() =>
                    void submitProtocolAction({ type: PlayActionType.UNPLACE_UNIT, unitId: selectedUnit.id })
                }
            >
                Remove Selected
            </Button>
        </Stack>
    );
};

const formatPlacementCountdown = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainder = Math.max(0, seconds % 60);
    return `${minutes}:${remainder.toString().padStart(2, "0")}`;
};

const PlacementCountdownChip: React.FC<{ snapshot: PlaySnapshot }> = ({ snapshot }) => {
    const [nowMs, setNowMs] = useState(Date.now());

    useEffect(() => {
        if (snapshot.phase !== PlayPhase.PLACEMENT || snapshot.placementDeadlineMs <= 0) {
            return undefined;
        }
        const timer = window.setInterval(() => setNowMs(Date.now()), 500);
        return () => window.clearInterval(timer);
    }, [snapshot.phase, snapshot.placementDeadlineMs]);

    if (snapshot.phase !== PlayPhase.PLACEMENT || snapshot.placementDeadlineMs <= 0) {
        return null;
    }

    const remainingSeconds = Math.max(0, Math.ceil((snapshot.placementDeadlineMs - nowMs) / 1000));
    return (
        <Chip
            size="sm"
            variant="soft"
            sx={{
                bgcolor: remainingSeconds <= 10 ? "rgba(185,28,28,0.22)" : "rgba(22,101,52,0.18)",
                color: remainingSeconds <= 10 ? "#fecaca" : "#bbf7d0",
                border: `1px solid ${remainingSeconds <= 10 ? "rgba(248,113,113,0.35)" : "rgba(74,222,128,0.28)"}`,
            }}
        >
            {formatPlacementCountdown(remainingSeconds)}
        </Chip>
    );
};

const RankedOpponentPlacementIntel: React.FC<{ snapshot: PlaySnapshot; userTeam: TeamType }> = ({
    snapshot,
    userTeam,
}) => {
    if (snapshot.phase !== PlayPhase.PLACEMENT) {
        return null;
    }

    const opponentUnits = snapshot.units.filter((unit) => unit.team !== userTeam && !unit.dead);
    if (!opponentUnits.length) {
        return null;
    }

    const knownCount = opponentUnits.filter((unit) => unit.creatureId > 0 && unit.name !== "Unknown").length;
    // The opponent's readiness rides along in the broadcast snapshot's readyPlayerIds, so show it
    // here — when they click "Ready Placement" we reflect it (and they see ours the same way).
    const opponentPlayer = snapshot.players.find((player) => player.team !== userTeam);
    const opponentReady = !!opponentPlayer && snapshot.readyPlayerIds.includes(opponentPlayer.playerId);

    return (
        <Stack spacing={0.5}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Stack direction="row" spacing={0.75} alignItems="center">
                    <Typography level="body-sm" textColor={hocColors.parchment}>
                        Opponent army
                    </Typography>
                    <Chip
                        size="sm"
                        variant="soft"
                        sx={{
                            bgcolor: opponentReady ? "rgba(34,197,94,0.18)" : "rgba(148,163,184,0.12)",
                            color: opponentReady ? "#4ade80" : hocColors.muted,
                            border: `1px solid ${opponentReady ? "rgba(34,197,94,0.5)" : "rgba(148,163,184,0.25)"}`,
                        }}
                    >
                        {opponentReady ? "Ready" : "Placing…"}
                    </Chip>
                </Stack>
                <Typography level="body-xs" textColor={hocColors.muted}>
                    {knownCount}/{opponentUnits.length} known
                </Typography>
            </Stack>
            <Box
                sx={{
                    display: "flex",
                    // Wrap onto multiple rows so every revealed unit stays visible when the right
                    // sidebar is narrow — a single scrolling row would hide units off-screen.
                    flexWrap: "wrap",
                    gap: 0.6,
                    pb: 0.25,
                }}
            >
                {opponentUnits.map((unit) => {
                    const known = unit.creatureId > 0 && unit.name !== "Unknown";
                    return (
                        <Box
                            key={unit.id}
                            sx={{
                                position: "relative",
                                flex: "0 0 auto",
                                width: 42,
                                height: 42,
                                borderRadius: 6,
                                border: `1px solid ${known ? "rgba(245,158,11,0.28)" : "rgba(148,163,184,0.18)"}`,
                                bgcolor: known ? "rgba(245,158,11,0.08)" : "rgba(15,23,42,0.45)",
                                display: "grid",
                                placeItems: "center",
                                overflow: "hidden",
                            }}
                        >
                            <Box
                                component="img"
                                src={resolveUnitImage(undefined, known ? unit.name : undefined)}
                                alt=""
                                sx={{
                                    width: 36,
                                    height: 36,
                                    objectFit: "contain",
                                    // Revealed (known) units show their real creature art in full color;
                                    // still-hidden units stay a dark grayscale silhouette.
                                    filter: known ? "none" : "grayscale(1) brightness(0.42) opacity(0.55)",
                                }}
                            />
                        </Box>
                    );
                })}
            </Box>
        </Stack>
    );
};

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
                <PlacementCountdownChip snapshot={snapshot} />
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
                    <RankedOpponentPlacementIntel snapshot={snapshot} userTeam={userTeam} />
                    <Button
                        variant="solid"
                        disabled={!canSubmit || ready}
                        onClick={() => void submitProtocolAction({ type: PlayActionType.READY_PLACEMENT })}
                        sx={ready ? hocSoftButtonSx : hocPrimaryButtonSx}
                    >
                        {ready ? "Ready" : "Ready Placement"}
                    </Button>
                    {selectedUnit?.placed && selectedUnit.team === userTeam && (
                        <RankedPlacementStackActions
                            canSubmit={canSubmit}
                            selectedUnit={selectedUnit}
                            snapshot={snapshot}
                            submitGameAction={submitGameAction}
                            submitProtocolAction={submitProtocolAction}
                            userTeam={userTeam}
                        />
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
