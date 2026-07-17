import {
    Artifact,
    AttackVals,
    Augment,
    FightStateManager,
    GridConstants,
    Perk,
    TeamVals,
    type GameAction,
    type TeamType,
} from "@heroesofcrypto/common";
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Modal,
    ModalDialog,
    Sheet,
    Slider,
    Stack,
    Tooltip,
    Typography,
} from "@mui/joy";
import CssBaseline from "@mui/joy/CssBaseline";
import { CssVarsProvider } from "@mui/joy/styles";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { v4 as uuidv4 } from "uuid";

import { createPlayActionFromGameAction } from "../api/game_action_play_codec";
import { createVsAiGame } from "../api/vs_ai_client";
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
import { PlayActionType, PlayEventKind, PlayPhase, PLAY_MOVE_CONTINUE_TURN_REASON } from "../api/play_protocol";
import type { PlayAction, PlaySnapshot, PlayUnitState } from "../api/play_protocol";
import type { SceneGameActionTransport, SceneGameActionTransportOptions } from "../game_action_transport";
import { images } from "../generated/image_imports";
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
import SynergiesRow from "./LeftSideBar/SynergiesRow";
import { Main } from "./Main";
import Popover from "./Popover";
import RightSideBar from "./RightSideBar";
import SideToggleContainer from "./RightSideBar/SideToggleContainer";
import { UpNextOverlay } from "./UpNextOverlay";
import { AiControlBadge, aiBadgeLeft } from "./AiControlBadge";
import { ExitReplayBadge } from "./ExitReplayBadge";
import { WalletLinker } from "./WalletLinker";
import { ButtonProvider } from "./context/ButtonContext";
import { ViewerTeamContext } from "./context/ViewerTeamContext";
import { hocColors, hocDangerAlertSx, hocPanelSx, hocPrimaryButtonSx, hocSoftButtonSx, hocSpinnerSx } from "./hocTheme";
import {
    rejectionErrorFromPlayEvent,
    resolveEffectiveLocalModelOpponentConfig,
    shouldApplyActionResponseSnapshotToViewer,
    shouldRecoverRejectedMoveFollowUp,
} from "./rankedActionResponse";
import { syncRankedSnapshotSynergies } from "./rankedSynergySync";
import { resolveUnitImage } from "./unitImage";
import {
    aiOpponentLabel,
    DEFAULT_VS_AI_DIFFICULTY,
    findAiSeatPlayerId,
    getAiSeatDifficulty,
    getMarkedVsAiDifficulty,
    hasAiSeatPlayer,
    isMarkedVsAiGame,
    markVsAiGame,
    vsAiDifficultyLabel,
    type VsAiDifficulty,
} from "../utils/aiOpponent";

export { fetchRankedPlaySnapshot } from "../api/ranked_play_client";

const RANKED_SCENE_ENTRY: SceneEntry = {
    group: "Heroes",
    name: "Ranked Play",
    SceneClass: RankedPlayScene,
};

// The play API returns "Game not found" (HTTP 404, message surfaced verbatim by the axios interceptor)
// when a game was cleaned up (e.g. server restart dropped an in-memory game) or a DB lookup failed. Used
// to swap the stale board for a plain "game not available" screen.
const isGameGoneError = (err: unknown): boolean => {
    const message = err instanceof Error ? err.message : String(err ?? "");
    return /game not found|not available|no completed pick|not ready for play/i.test(message);
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
    if (action.type === "place_unit" || action.type === "request_additional_time") {
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
    const navigate = useNavigate();
    const localModelConfig = useMemo(() => getLocalModelOpponentConfig(), []);
    const viewerTeam = userTeam === TeamVals.NO_TEAM ? undefined : userTeam;
    const [snapshot, setSnapshot] = useState<PlaySnapshot | null>(null);
    const effectiveLocalModelConfig = useMemo(
        () => resolveEffectiveLocalModelOpponentConfig(localModelConfig, snapshot, viewerTeam),
        [localModelConfig, snapshot, viewerTeam],
    );
    const [selectedUnitId, setSelectedUnitId] = useState("");
    const [aiToggleOn, setAiToggleOn] = useState(false);
    const [replayPlaybackActive, setReplayPlaybackActive] = useState(false);
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState("Connecting");
    const [error, setError] = useState("");
    // The game no longer exists on the server (cleaned up on restart, or a DB lookup failed → the API
    // returns "Game not found"). We render a plain "not available" screen instead of the stale board.
    const [gameUnavailable, setGameUnavailable] = useState(false);
    const [pixiReady, setPixiReady] = useState(!manager.isLoading);
    const abortRef = useRef<AbortController | null>(null);
    const latestSequenceRef = useRef(0);
    const snapshotRef = useRef<PlaySnapshot | null>(null);
    const synergyGameIdRef = useRef<string | undefined>(undefined);
    const actionQueueRef = useRef<Promise<void>>(Promise.resolve());
    const replayTimersRef = useRef<number[]>([]);

    // Sync the authoritative doctrine + army-wide artifacts + placement augments into the local
    // FightProperties so the client's applyArtifacts / applyAugments (run when the scene hydrates units
    // from the snapshot -> refreshUnits) reproduce the same per-unit "System" buffs and boosted stats the
    // server computed. Without this the left sidebar shows base stats and no artifact/augment buffs, since
    // the ranked client never picks these locally. Perk also drives the placement augment sidebar's
    // upgrade-point budget. Defined BEFORE the snapshot-apply effect below, so FightProperties is populated
    // before hydration. Opponent values are hidden (0) during placement and revealed at fight start, so we
    // sync each team verbatim (0 clears to NO_ARTIFACT / NO_AUGMENT / NO_PERK).
    useEffect(() => {
        if (!snapshot) {
            return;
        }
        const fp = FightStateManager.getInstance().getFightProperties();
        const syncTeam = (team: TeamType, side: "lower" | "upper"): void => {
            const s = snapshot;
            fp.setPerkPerTeam(team, ((side === "lower" ? s.lowerPerk : s.upperPerk) || Perk.Perk.NO_PERK) as Perk.Perk);
            fp.setArtifactPerTeam(
                team,
                Artifact.ArtifactTier.TIER_1,
                (side === "lower" ? s.lowerArtifactTier1 : s.upperArtifactTier1) ?? 0,
            );
            fp.setArtifactPerTeam(
                team,
                Artifact.ArtifactTier.TIER_2,
                (side === "lower" ? s.lowerArtifactTier2 : s.upperArtifactTier2) ?? 0,
            );
            const aug = (kind: Augment.AugmentType["type"], v: number | undefined): void => {
                fp.setAugmentPerTeam(team, { type: kind, value: v ?? 0 } as Augment.AugmentType);
            };
            aug("Placement", side === "lower" ? s.lowerAugmentPlacement : s.upperAugmentPlacement);
            aug("Armor", side === "lower" ? s.lowerAugmentArmor : s.upperAugmentArmor);
            aug("Might", side === "lower" ? s.lowerAugmentMight : s.upperAugmentMight);
            aug("Sniper", side === "lower" ? s.lowerAugmentSniper : s.upperAugmentSniper);
            aug("Movement", side === "lower" ? s.lowerAugmentMovement : s.upperAugmentMovement);
        };
        syncTeam(TeamVals.LOWER, "lower");
        syncTeam(TeamVals.UPPER, "upper");
        synergyGameIdRef.current = syncRankedSnapshotSynergies(fp, snapshot, synergyGameIdRef.current);
    }, [snapshot]);

    // Mirror the scene's local AI toggle so the "AI Toggle On" badge shows for a manual toggle too,
    // not only the server's aiControlled takeover (combined below).
    useEffect(() => {
        const connection = manager.onVisibleStateUpdated.connect((state) => {
            setAiToggleOn(!!state.aiToggleOn);
            setReplayPlaybackActive(!!state.replayPlaybackActive);
        });
        return () => {
            connection.disconnect();
        };
    }, [manager]);
    const pendingTurnResolutionRef = useRef(false);
    // Unit whose accepted move explicitly reserved one queued follow-up. A rejected follow-up is closed
    // immediately with END_TURN instead of waiting for the generic three-rejection escape hatch.
    const pendingMoveFollowUpUnitIdRef = useRef<string>();
    // Tracks consecutive server rejections at the same turn (expectedSequence). If the same turn keeps
    // getting rejected (e.g. an autobattle AI proposing an illegal move/attack the server refuses, or
    // a residual desync), we force a server-authoritative END_TURN to skip the stuck unit so the game
    // can never deadlock on a repeatedly-rejected action.
    const rejectionStreakRef = useRef<{ key: string; count: number }>({ key: "", count: 0 });
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
            const continuedMoveUnitId = pendingMoveFollowUpUnitIdRef.current;
            if (continuedMoveUnitId && nextSnapshot.currentUnitId !== continuedMoveUnitId) {
                pendingMoveFollowUpUnitIdRef.current = undefined;
            }
            if (!pendingMoveFollowUpUnitIdRef.current) {
                pendingTurnResolutionRef.current = false;
            }
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
            if (!pixiReady) {
                return false;
            }
            // Already animated by the other delivery channel. An own action is delivered TWICE — once
            // via the SSE stream (which plays the walk first) and once on the submit HTTP response. The
            // response must treat this as PLAYED (return true), otherwise its caller applies the snapshot
            // with skipBoardRebuild=false and the resulting full board rebuild teleports the just-walked
            // unit onto its destination — the "no move animation, then it appears there" bug, seen only
            // for the local (attacking) team because the opponent's moves arrive on SSE alone.
            if (playedAuthoritativeSequencesRef.current.has(record.sequence)) {
                return true;
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
                    setGameUnavailable(false);
                }
            })
            .catch((err: unknown) => {
                if (!cancelled) {
                    setStatus("Snapshot failed");
                    setError((err as Error).message || "Unable to load play snapshot");
                    setGameUnavailable(isGameGoneError(err));
                }
            });

        // Periodic snapshot refresh as a fallback — keeps the board in sync even if SSE
        // drops or lags. Polls every 4 seconds; the snapshot endpoint is cheap.
        const pollInterval = window.setInterval(() => {
            if (cancelled) return;
            refreshSnapshot()
                .then(() => {
                    if (!cancelled) {
                        setGameUnavailable(false);
                    }
                })
                .catch((err: unknown) => {
                    if (!cancelled && isGameGoneError(err)) {
                        setGameUnavailable(true);
                    }
                });
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
                        const sseError = rejectionErrorFromPlayEvent(event);
                        if (sseError) {
                            setError(sseError);
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
    // Detect a vs-AI match two ways: the local "just created this via Play vs AI" marker (works even
    // before the snapshot names an opponent) and the server-assigned bot-seat prefix in either seat
    // (works after refresh or from an observer snapshot without depending on player order). Match
    // identity is kept separate from CTA eligibility; only participants get the rematch action below.
    const isVsAiMatch = useMemo(() => {
        if (isMarkedVsAiGame(gameId)) {
            return true;
        }
        return hasAiSeatPlayer(snapshot?.players);
    }, [gameId, snapshot]);
    // The AI opponent's identity, tier first: the seat playerId in the snapshot encodes the difficulty
    // ("ai:v0.7:brutal:…" — authoritative, survives refresh/other browsers); the local marker covers the
    // pre-snapshot window. Legacy tier-less seats degrade to "AI (v0.7)".
    const aiSeatPlayerId = useMemo(() => findAiSeatPlayerId(snapshot?.players), [snapshot]);
    const vsAiDifficulty = useMemo<VsAiDifficulty | undefined>(
        () => getAiSeatDifficulty(aiSeatPlayerId) ?? getMarkedVsAiDifficulty(gameId),
        [aiSeatPlayerId, gameId],
    );
    const vsAiOpponentLabel = useMemo(() => {
        if (vsAiDifficulty) {
            return vsAiDifficultyLabel(vsAiDifficulty);
        }
        return aiOpponentLabel(aiSeatPlayerId) ?? (isVsAiMatch ? "AI" : undefined);
    }, [aiSeatPlayerId, isVsAiMatch, vsAiDifficulty]);
    const handleBackToLobby = useCallback(() => {
        navigate("/play");
    }, [navigate]);
    const handlePlayAgainVsAi = useCallback(async () => {
        // Repeat the SAME tier the finished match was played at (fall back to the default for legacy
        // tier-less games).
        const difficulty = vsAiDifficulty ?? DEFAULT_VS_AI_DIFFICULTY;
        // The just-finished match's result write (game doc -> finished, both players' inGameId released)
        // is fire-and-forget on the server (play_session.ts tryWriteGameResult) so it can still be
        // in flight the instant this overlay's button becomes clickable. A same-tick click then hits a
        // 409 "Already in game" against the account's own about-to-clear membership. Retry with backoff
        // instead of surfacing a scary error for what is normally a sub-second race.
        const RETRY_ATTEMPTS = 4;
        const RETRY_DELAY_MS = 800;
        let lastError: unknown;
        for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt += 1) {
            try {
                const game = await createVsAiGame(difficulty);
                const nextGameId = game.id;
                if (!nextGameId) {
                    throw new Error("AI match response was incomplete");
                }
                // Remembered the same way the initial Play-vs-AI entry (MatchmakingRoute) does, so the
                // new match's pick phase can label the opponent as the AI at the same difficulty.
                markVsAiGame(nextGameId, difficulty);
                navigate(`/game/${nextGameId}`);
                return;
            } catch (err) {
                lastError = err;
                if (attempt < RETRY_ATTEMPTS) {
                    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * attempt));
                }
            }
        }
        throw lastError instanceof Error ? lastError : new Error("Unable to start an AI match");
    }, [navigate, vsAiDifficulty]);
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
            // Guard: never submit an action carrying an off-grid / non-integer cell. The server rejects it
            // as invalid_cell (validateActionShape) — surfaced to the user as an "invalid cell" error — and
            // a jammed unit that keeps retrying storms them. Mirror the server's bounds check and drop the
            // doomed submit locally instead (the unit re-evaluates / ends its turn).
            const cellInBounds = (c?: { x: number; y: number }): boolean =>
                !c ||
                (Number.isInteger(c.x) &&
                    Number.isInteger(c.y) &&
                    c.x >= 0 &&
                    c.y >= 0 &&
                    c.x < GridConstants.GRID_SIZE &&
                    c.y < GridConstants.GRID_SIZE);
            const submittedCells = [
                ...(payload.cells ?? []),
                ...(payload.path ?? []),
                ...(payload.targetCells ?? []),
                payload.attackFrom,
                payload.targetCell,
            ];
            if (!submittedCells.every(cellInBounds)) {
                if (!isSilent) {
                    setError("Dropped an action with an off-grid cell");
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
                if (
                    result.accepted &&
                    payload.type === PlayActionType.MOVE_UNIT &&
                    payload.reason === PLAY_MOVE_CONTINUE_TURN_REASON
                ) {
                    pendingMoveFollowUpUnitIdRef.current = payload.unitId;
                } else if (
                    !result.accepted &&
                    payload.type === PlayActionType.MOVE_UNIT &&
                    payload.reason === PLAY_MOVE_CONTINUE_TURN_REASON
                ) {
                    pendingMoveFollowUpUnitIdRef.current = undefined;
                } else if (
                    result.accepted &&
                    pendingMoveFollowUpUnitIdRef.current &&
                    payload.type !== PlayActionType.SELECT_ATTACK_TYPE
                ) {
                    pendingMoveFollowUpUnitIdRef.current = undefined;
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
                    const reason = result.rejectionReason || result.message || "Action rejected";
                    // "fight_not_started" is a pure client/server startup race — an action (e.g. from the
                    // autobattle AI toggle) submitted in the last few ms before the server's fightStarted
                    // flag flips at the placement -> fight transition. The board resync below already
                    // recovers it on the next turn, so surfacing the raw engine reason code here just
                    // scared players with an alarming red "fight_not_started" banner for a condition that
                    // silently self-heals. Every other rejection reason is still shown as-is.
                    if (reason !== "fight_not_started") {
                        setError(reason);
                    }

                    const continuedMoveUnitId = pendingMoveFollowUpUnitIdRef.current;
                    if (shouldRecoverRejectedMoveFollowUp(continuedMoveUnitId, payload)) {
                        // The move already landed, so re-deciding from the changed board can only produce
                        // another incompatible continuation. Close that exact unit's turn at the server's
                        // latest sequence; the response snapshot then releases the normal action gate.
                        pendingMoveFollowUpUnitIdRef.current = undefined;
                        rejectionStreakRef.current = { key: "", count: 0 };
                        if (snapshotRef.current?.currentUnitId === continuedMoveUnitId) {
                            const recovery = await sendRankedPlayAction(
                                gameId,
                                {
                                    ...payload,
                                    actionId: uuidv4(),
                                    type: PlayActionType.END_TURN,
                                    unitId: continuedMoveUnitId,
                                    targetUnitId: "",
                                    attackFrom: undefined,
                                    path: [],
                                    targetCells: [],
                                    reason: "manual",
                                    expectedSequence: latestSequenceRef.current,
                                },
                                options,
                            ).catch(() => undefined);
                            if (recovery?.event?.snapshot) {
                                await waitForAuthoritativePlayback();
                                applySnapshot(recovery.event.snapshot, { forceBoardRebuild: true });
                            }
                        }
                        return false;
                    }

                    // Escape hatch: if the SAME turn keeps getting rejected, the submitter (usually the
                    // autobattle AI) is stuck re-proposing an action the server won't accept. Force a
                    // server-authoritative END_TURN to skip the active unit so the fight can't deadlock.
                    // Key the streak on the action's IDENTITY (active unit + action type), NOT on
                    // expectedSequence: in a sequence_mismatch storm the server-reported sequence advances
                    // on every retry, so an expectedSequence key reset the count to 1 each time and the
                    // escape never tripped. Unit+type stays constant across the doomed resubmits.
                    const streakKey = `${snapshotRef.current?.currentUnitId ?? ""}:${payload.type}`;
                    const streak = rejectionStreakRef.current;
                    if (streak.key === streakKey) {
                        streak.count += 1;
                    } else {
                        rejectionStreakRef.current = { key: streakKey, count: 1 };
                    }
                    const activeUnitId = snapshotRef.current?.currentUnitId;
                    if (
                        rejectionStreakRef.current.count >= 3 &&
                        payload.type !== PlayActionType.END_TURN &&
                        activeUnitId
                    ) {
                        rejectionStreakRef.current = { key: "", count: 0 };
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
                rejectionStreakRef.current = { key: "", count: 0 };
                return true;
            } catch (err: unknown) {
                pendingTurnResolutionRef.current = false;
                if (payload.type === PlayActionType.MOVE_UNIT && payload.reason === PLAY_MOVE_CONTINUE_TURN_REASON) {
                    pendingMoveFollowUpUnitIdRef.current = undefined;
                }
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
        async (
            action: GameAction,
            team: TeamType,
            authorization?: string,
            transportOptions?: SceneGameActionTransportOptions,
        ) => {
            await queueActionSubmission(async () => {
                const envelope = buildActionEnvelope(team);
                if (!envelope) return;

                await sendPlayAction(
                    createPlayActionFromGameAction(action, envelope, transportOptions),
                    authorization ? { authorization } : undefined,
                );
            });
        },
        [buildActionEnvelope, queueActionSubmission, sendPlayAction],
    );

    const submitGameAction = useCallback(
        async (action: GameAction, transportOptions?: SceneGameActionTransportOptions) => {
            await submitGameActionForTeam(action, userTeam, undefined, transportOptions);
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
        (action, transportOptions) => {
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

            // Drop a turn action whose unit is no longer the one the server has active. The active unit
            // can advance (a new snapshot lands) between the AI picking an action and submitting it, so a
            // stale-unit action would be rejected as unit_not_active. Returning not-completed lets the AI
            // re-trigger for the actually-active unit instead of burning a doomed submit.
            const controlledUnitId = controlledUnitIdForAction(action);
            const latestSnap = snapshotRef.current;
            const continuesMovedUnitTurn = action.type === "move_unit" && transportOptions?.continueTurn === true;
            if (
                isTurnResolvingAction(action) &&
                controlledUnitId &&
                latestSnap?.phase === PlayPhase.PLAY &&
                latestSnap.currentUnitId &&
                latestSnap.currentUnitId !== controlledUnitId
            ) {
                return { handled: true, completed: false, message: "Not this unit's turn" };
            }
            if (isModelSubmission) {
                if (continuesMovedUnitTurn && controlledUnitId) {
                    pendingMoveFollowUpUnitIdRef.current = controlledUnitId;
                }
                if (isTurnResolvingAction(action) && !continuesMovedUnitTurn) {
                    pendingTurnResolutionRef.current = true;
                    pendingTurnResolutionSinceRef.current = Date.now();
                }
                void submitGameActionForTeam(
                    action,
                    effectiveLocalModelConfig.modelTeam,
                    effectiveLocalModelConfig.authorization,
                    transportOptions,
                );
                return { handled: true, completed: true };
            }
            if (isObserver) {
                return { handled: true, completed: false, message: "Observer mode is read-only" };
            }
            if (continuesMovedUnitTurn && controlledUnitId) {
                pendingMoveFollowUpUnitIdRef.current = controlledUnitId;
            }
            if (isTurnResolvingAction(action) && !continuesMovedUnitTurn) {
                pendingTurnResolutionRef.current = true;
                pendingTurnResolutionSinceRef.current = Date.now();
            }
            void submitGameAction(action, transportOptions);
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

                // The AI opponent spends its upgrade budget on a solid combat-augment loadout (Might/Armor/
                // Movement = 3+2+1 = 6 pts, within the default budget) so it "uses upgrades" like a real
                // player. Applied to the model team's FightProperties before placement so its units get
                // buffed once the fight starts.
                try {
                    const modelTeam = effectiveLocalModelConfig.modelTeam;
                    manager.PropagateAugmentation(modelTeam, { type: "Might", value: Augment.MightAugment.LEVEL_3 });
                    manager.PropagateAugmentation(modelTeam, { type: "Armor", value: Augment.ArmorAugment.LEVEL_2 });
                    manager.PropagateAugmentation(modelTeam, {
                        type: "Movement",
                        value: Augment.MovementAugment.LEVEL_1,
                    });
                    // Apply the AI's picked Tier-2 artifact (the draft opponent takes Warlord's Edge).
                    manager.PropagateArtifact(
                        modelTeam,
                        Artifact.ArtifactTier.TIER_2,
                        Artifact.Tier2Artifact.WARLORDS_EDGE,
                    );
                } catch (augErr) {
                    console.warn("[model] augment setup failed", (augErr as Error)?.message ?? augErr);
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

    // The game no longer exists on the server (cleaned up / DB error). Show a plain message instead of
    // the stale board — never keep rendering the last-known scene as if the fight were still live.
    if (gameUnavailable) {
        return (
            <Box
                sx={{
                    minHeight: "100vh",
                    display: "grid",
                    placeItems: "center",
                    bgcolor: "#07090d",
                    color: "#fff",
                    p: 3,
                }}
            >
                <Stack spacing={1.5} alignItems="center" sx={{ textAlign: "center", maxWidth: 460 }}>
                    <Typography sx={{ fontSize: "2.4rem", lineHeight: 1 }}>🕯️</Typography>
                    <Typography sx={{ color: "#f6d87c", fontWeight: 800, fontSize: "1.5rem" }}>
                        Game is not available
                    </Typography>
                    <Typography sx={{ opacity: 0.75 }}>
                        This match has ended or is no longer on the server — it may have been cleaned up or the server
                        was restarted.
                    </Typography>
                </Stack>
            </Box>
        );
    }

    if (!snapshot) {
        return (
            <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", bgcolor: "#07090d", color: "#fff" }}>
                <Stack spacing={2} alignItems="center">
                    <CircularProgress sx={hocSpinnerSx} />
                    <Typography sx={{ color: hocColors.parchment }}>Loading ranked fight</Typography>
                    {error && (
                        <Alert variant="soft" sx={hocDangerAlertSx}>
                            {error}
                        </Alert>
                    )}
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
            opponentLabel={vsAiOpponentLabel}
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
                    {gameStarted && <RankedSynergiesPanel snapshot={snapshot} userTeam={userTeam} />}
                    {gameStarted && <UpNextOverlay />}
                    {gameStarted && (aiToggleOn || !!myPlayer?.aiControlled) && (
                        <AiControlBadge left={aiBadgeLeft(windowSize)} />
                    )}
                    {replayPlaybackActive && (
                        // Ranked: leaving the replay returns to the account / game-selection screen.
                        <ExitReplayBadge
                            left={aiBadgeLeft(windowSize)}
                            onExit={() => window.location.assign("/portal")}
                        />
                    )}
                    {gameStarted && (
                        <FightFinishedOverlay
                            canReplay={snapshot.phase === PlayPhase.FINISHED || snapshot.fightFinished}
                            mode="ranked"
                            opponentLabel={vsAiOpponentLabel}
                            onReplay={replayRankedFight}
                            onPlayAgainVsAi={isVsAiMatch && !isObserver ? handlePlayAgainVsAi : undefined}
                            onBackToLobby={handleBackToLobby}
                        />
                    )}
                    {gameStarted && !isObserver && <DraggableToolbar />}
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
    /** Set for vs-AI matches: the tiered bot identity, e.g. "AI — Hard (v0.7)". */
    opponentLabel?: string;
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

const artifactImageFor = (imageKey: string): string | undefined => (images as Record<string, string>)[imageKey];

// One team's picked artifacts (Tier 1 + Tier 2 icons). Reads the ids straight off the snapshot, which the
// server seeds from the pick doc (ranked) or randomly (dev/e2e). NO_ARTIFACT (0) slots render as an empty
// placeholder so the row width stays stable while a pick is still pending.
const ArtifactTierIcons: React.FC<{ tier1Id: number; tier2Id: number }> = ({ tier1Id, tier2Id }) => {
    const entries: Array<{ key: string; art?: Artifact.ArtifactProperties }> = [
        { key: "t1", art: tier1Id ? Artifact.TIER1_ARTIFACTS[tier1Id as Artifact.Tier1Artifact] : undefined },
        { key: "t2", art: tier2Id ? Artifact.TIER2_ARTIFACTS[tier2Id as Artifact.Tier2Artifact] : undefined },
    ];
    return (
        <Box sx={{ display: "flex", gap: 0.6 }}>
            {entries.map(({ key, art }) => {
                const src = art ? artifactImageFor(art.imageKey) : undefined;
                const tierLabel = key === "t1" ? "Tier 1" : "Tier 2";
                // Rich hover: name + tier + the effect text with its real numbers substituted in
                // (art.description keeps {}/[] placeholders — formatArtifactDescription fills them).
                const tip = art ? (
                    <Box sx={{ maxWidth: 260, py: 0.5 }}>
                        <Typography level="title-sm" textColor={hocColors.gold}>
                            {art.name}
                        </Typography>
                        <Typography level="body-xs" textColor={hocColors.muted} sx={{ mb: 0.5 }}>
                            {tierLabel} artifact
                        </Typography>
                        <Typography level="body-xs" textColor={hocColors.parchment}>
                            {Artifact.formatArtifactDescription(art)}
                        </Typography>
                    </Box>
                ) : (
                    `No ${tierLabel} artifact`
                );
                return (
                    <Tooltip
                        key={key}
                        title={tip}
                        variant="soft"
                        placement="top"
                        arrow
                        sx={{ bgcolor: "rgba(15,23,42,0.97)", border: "1px solid rgba(245,158,11,0.35)" }}
                    >
                        <Box
                            sx={{
                                position: "relative",
                                flex: "0 0 auto",
                                width: 42,
                                height: 42,
                                borderRadius: 6,
                                border: `1px solid ${art ? "rgba(245,158,11,0.4)" : "rgba(148,163,184,0.18)"}`,
                                bgcolor: art ? "rgba(245,158,11,0.08)" : "rgba(15,23,42,0.45)",
                                display: "grid",
                                placeItems: "center",
                                overflow: "hidden",
                                cursor: art ? "help" : "default",
                            }}
                        >
                            {src ? (
                                <Box
                                    component="img"
                                    src={src}
                                    alt={art?.name ?? ""}
                                    sx={{ width: 36, height: 36, objectFit: "contain" }}
                                />
                            ) : (
                                <Typography level="body-xs" textColor={hocColors.muted}>
                                    —
                                </Typography>
                            )}
                        </Box>
                    </Tooltip>
                );
            })}
        </Box>
    );
};

// Shows both armies' picked artifacts during the placement stage so each player can see what they (and the
// opponent) drafted. Renders nothing if neither side picked anything (e.g. an older server / no artifacts).
const RankedArtifactsPanel: React.FC<{ snapshot: PlaySnapshot; userTeam: TeamType }> = ({ snapshot, userTeam }) => {
    const lower = { tier1: snapshot.lowerArtifactTier1 ?? 0, tier2: snapshot.lowerArtifactTier2 ?? 0 };
    const upper = { tier1: snapshot.upperArtifactTier1 ?? 0, tier2: snapshot.upperArtifactTier2 ?? 0 };
    const yours = userTeam === TeamVals.UPPER ? upper : lower;
    const theirs = userTeam === TeamVals.UPPER ? lower : upper;
    const hasYours = !!(yours.tier1 || yours.tier2);
    // The opponent's artifacts only reach us once the fight starts (server withholds them during placement),
    // so the Opponent column simply appears when its ids show up in the snapshot.
    const hasTheirs = !!(theirs.tier1 || theirs.tier2);
    if (!hasYours && !hasTheirs) {
        return null;
    }
    return (
        <Stack spacing={0.5}>
            <Typography level="body-sm" textColor={hocColors.parchment}>
                Artifacts
            </Typography>
            <Stack direction="row" spacing={1.5} flexWrap="wrap">
                {hasYours && (
                    <Stack spacing={0.25}>
                        <Typography level="body-xs" textColor={hocColors.muted}>
                            Yours
                        </Typography>
                        <ArtifactTierIcons tier1Id={yours.tier1} tier2Id={yours.tier2} />
                    </Stack>
                )}
                {hasTheirs && (
                    <Stack spacing={0.25}>
                        <Typography level="body-xs" textColor={hocColors.muted}>
                            Opponent
                        </Typography>
                        <ArtifactTierIcons tier1Id={theirs.tier1} tier2Id={theirs.tier2} />
                    </Stack>
                )}
            </Stack>
        </Stack>
    );
};

// Read-only recap of the augments/synergies chosen in the placement overlay, shown in the sidebar
// while the player positions units. Augment levels come straight from the authoritative snapshot;
// selected synergies come from the local FightProperties (kept in sync by the picker).
const RankedAugmentSummary: React.FC<{
    snapshot: PlaySnapshot;
    userTeam: TeamType;
    budget: number;
    onEdit: () => void;
}> = ({ snapshot, userTeam, budget, onEdit }) => {
    const isUpper = userTeam === TeamVals.UPPER;
    const pick = (lowerVal?: number, upperVal?: number): number => (isUpper ? upperVal : lowerVal) ?? 0;
    const rows = [
        { label: "Placement", level: pick(snapshot.lowerAugmentPlacement, snapshot.upperAugmentPlacement) },
        { label: "Armor", level: pick(snapshot.lowerAugmentArmor, snapshot.upperAugmentArmor) },
        { label: "Might", level: pick(snapshot.lowerAugmentMight, snapshot.upperAugmentMight) },
        { label: "Sniper", level: pick(snapshot.lowerAugmentSniper, snapshot.upperAugmentSniper) },
        { label: "Movement", level: pick(snapshot.lowerAugmentMovement, snapshot.upperAugmentMovement) },
    ];
    // Point cost equals the augment level value (Placement LEVEL_1 == 0 == free); the server enforces
    // the same sum against the perk budget (getUpgradePoints / canAugment).
    const spent = rows.reduce((total, r) => total + r.level, 0);
    // Placement always resolves to at least LEVEL_1 (value 0); other categories start at NO_AUGMENT (0).
    const chosen = rows.filter((r) => r.label === "Placement" || r.level > 0);
    const synergies = FightStateManager.getInstance().getFightProperties().getSynergiesPerTeam(userTeam);
    return (
        <Stack spacing={0.5}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography level="body-sm" textColor={hocColors.parchment}>
                    Augments &amp; Synergies ({spent}/{budget} pts)
                </Typography>
                <Button size="sm" variant="soft" onClick={onEdit} sx={hocSoftButtonSx}>
                    Edit
                </Button>
            </Stack>
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                {chosen.length === 0 ? (
                    <Typography level="body-xs" textColor={hocColors.muted}>
                        No augments chosen yet
                    </Typography>
                ) : (
                    chosen.map((r) => (
                        <Chip key={r.label} size="sm" variant="soft">
                            {r.label === "Placement" ? `Placement L${r.level + 1}` : `${r.label} L${r.level}`}
                        </Chip>
                    ))
                )}
            </Stack>
            {synergies.length > 0 && (
                // Reuse the same icon+tooltip renderer as the in-fight "Your synergies" panel below —
                // synergy keys are raw internal ids ("Life:1:1"); rendering them as bare Chip text here
                // leaked that id straight to players instead of a name/description.
                <SynergiesRow synergies={synergies} wrap />
            )}
        </Stack>
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
                {/* The full roster is always visible during placement (server reveals every opponent unit's
                    identity) — stack sizes and on-board positions stay hidden, but who they fielded does not. */}
                <Typography level="body-xs" textColor={hocColors.muted}>
                    {opponentUnits.length} units
                </Typography>
            </Stack>
            <Box
                sx={{
                    display: "flex",
                    // Wrap onto multiple rows so every unit stays visible when the right sidebar is narrow —
                    // a single scrolling row would hide units off-screen.
                    flexWrap: "wrap",
                    gap: 0.6,
                    pb: 0.25,
                }}
            >
                {opponentUnits.map((unit) => {
                    const known = unit.creatureId > 0 && unit.name !== "Unknown";
                    return (
                        <Tooltip key={unit.id} title={known ? unit.name : "Unknown"} placement="top">
                            <Box
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
                                        // Full roster is visible in color during placement; the grayscale
                                        // silhouette is only a fallback for legacy/edge-case unknown units.
                                        filter: known ? "none" : "grayscale(1) brightness(0.42) opacity(0.55)",
                                    }}
                                />
                            </Box>
                        </Tooltip>
                    );
                })}
            </Box>
        </Stack>
    );
};

// Top-left HUD panel showing both armies' active synergies once the fight has started. The server only
// populates snapshot.*Synergies after fight start (empty during placement), so this stays hidden until the
// fight begins — and it never reveals picks during placement.
const RankedSynergiesPanel: React.FC<{ snapshot: PlaySnapshot; userTeam: TeamType }> = ({ snapshot, userTeam }) => {
    const isLower = userTeam === TeamVals.LOWER;
    const yours = (isLower ? snapshot.lowerSynergies : snapshot.upperSynergies) ?? [];
    const theirs = (isLower ? snapshot.upperSynergies : snapshot.lowerSynergies) ?? [];
    if (!yours.length && !theirs.length) {
        return null;
    }
    return (
        <Sheet
            variant="outlined"
            sx={{
                position: "fixed",
                top: 12,
                left: 12,
                zIndex: 15,
                p: 1,
                borderRadius: "md",
                minWidth: 120,
                ...hocPanelSx,
                backdropFilter: "blur(10px)",
            }}
        >
            <Stack spacing={0.75}>
                <Box>
                    <Typography
                        level="body-xs"
                        sx={{ color: "#46d160", textTransform: "uppercase", letterSpacing: 0.5, mb: 0.25 }}
                    >
                        Your synergies
                    </Typography>
                    {yours.length ? (
                        <SynergiesRow synergies={yours} />
                    ) : (
                        <Typography level="body-xs" textColor={hocColors.muted}>
                            None
                        </Typography>
                    )}
                </Box>
                <Box>
                    <Typography
                        level="body-xs"
                        sx={{ color: "#ff5a5a", textTransform: "uppercase", letterSpacing: 0.5, mb: 0.25 }}
                    >
                        Opponent
                    </Typography>
                    {theirs.length ? (
                        <SynergiesRow synergies={theirs} />
                    ) : (
                        <Typography level="body-xs" textColor={hocColors.muted}>
                            None
                        </Typography>
                    )}
                </Box>
            </Stack>
        </Sheet>
    );
};

const RankedOverlay: React.FC<RankedOverlayProps> = ({
    busy,
    canSubmit,
    currentUnit,
    embedded = false,
    error,
    gameStarted,
    opponentLabel,
    ready,
    selectedUnit,
    snapshot,
    status,
    submitGameAction,
    submitProtocolAction,
    userTeam,
    isObserver,
}) => {
    const navigate = useNavigate();
    const [confirmExitOpen, setConfirmExitOpen] = useState(false);
    // Ranked placement opens an augment/synergy overlay by default; the player picks there, hits
    // "Continue to placement", and the chosen upgrades collapse to a read-only sidebar summary
    // (re-openable via Edit). null = not yet interacted -> open by default at placement start.
    const [augmentOverlayOpenState, setAugmentOverlayOpen] = useState<boolean | null>(null);
    // The perk sets the upgrade-point budget (5/6/7 via getUpgradePoints).
    const userPerkId = ((userTeam === TeamVals.LOWER ? snapshot?.lowerPerk : snapshot?.upperPerk) ||
        Perk.Perk.NO_PERK) as Perk.Perk;
    const augmentBudget = Perk.getUpgradePoints(userPerkId);
    const perkName = Perk.getPerkProperties(userPerkId).name;
    const augmentOverlayOpen = augmentOverlayOpenState ?? true;
    // Remaining-points / synergy-completion state, reported up by SideToggleContainer via onReadyChange
    // (setAugmentReady is stable, no render loop). This is INFORMATIONAL only: augments and synergies are
    // optional — every toggle commits to the server immediately and the fight starts with whatever was
    // chosen — so "Continue to placement" must never hold the player hostage to an unspent budget
    // (audit P1: the old gate blocked until ALL points were spent and every synergy was picked).
    const [augmentReady, setAugmentReady] = useState<{ pointsRemaining: number; allSynergiesSelected: boolean }>({
        pointsRemaining: 1,
        allSynergiesSelected: false,
    });
    const setupComplete = augmentReady.pointsRemaining <= 0 && augmentReady.allSynergiesSelected;
    return (
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
                    {opponentLabel && (
                        <Chip
                            size="sm"
                            variant="soft"
                            sx={{
                                bgcolor: hocColors.orangeSoft,
                                color: hocColors.parchment,
                                border: `1px solid ${hocColors.orangeBorder}`,
                            }}
                        >
                            {opponentLabel}
                        </Chip>
                    )}
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
                        {/* Prompt both players up-front: augments + placement share this single timer. */}
                        <Box
                            sx={{
                                p: 1,
                                borderRadius: "8px",
                                bgcolor: hocColors.orangeSoft,
                                border: `1px solid ${hocColors.orangeBorder}`,
                            }}
                        >
                            <Typography level="title-sm" textColor={hocColors.gold}>
                                Set up your army
                            </Typography>
                            <Typography level="body-xs" textColor={hocColors.mutedStrong}>
                                1) Choose augments &amp; synergies in the pop-up, 2) position your units on the board,
                                then hit Ready. Augments and placement share one timer.
                            </Typography>
                        </Box>
                        <RankedOpponentPlacementIntel snapshot={snapshot} userTeam={userTeam} />
                        <RankedArtifactsPanel snapshot={snapshot} userTeam={userTeam} />
                        {/* The augment/synergy picker lives in an overlay (open by default at placement
                            start), not the sidebar. After "Continue to placement" the chosen upgrades
                            collapse to this read-only summary; "Edit" re-opens the overlay. The picker
                            routes to the authoritative server via RankedPlayScene.propagateAugmentation
                            (the AUGMENT play-action); artifacts are drafted in pick/ban (read-only above),
                            so the sandbox-only artifact picker stays hidden. */}
                        <RankedAugmentSummary
                            snapshot={snapshot}
                            userTeam={userTeam}
                            budget={augmentBudget}
                            onEdit={() => setAugmentOverlayOpen(true)}
                        />
                        <Modal keepMounted open={augmentOverlayOpen} onClose={() => setAugmentOverlayOpen(false)}>
                            <ModalDialog
                                variant="outlined"
                                sx={{
                                    ...hocPanelSx,
                                    width: 460,
                                    maxWidth: "94vw",
                                    maxHeight: "90vh",
                                    overflowY: "auto",
                                }}
                            >
                                {/* Show the shared placement countdown INSIDE the pop-up — the header chip is
                                    hidden behind this modal while the player picks augments/synergies. */}
                                <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                                    <Typography level="title-lg" textColor={hocColors.gold}>
                                        Set up your army
                                    </Typography>
                                    <PlacementCountdownChip snapshot={snapshot} />
                                </Stack>
                                <Typography level="body-sm" textColor={hocColors.mutedStrong}>
                                    {perkName === "None"
                                        ? `You have ${augmentBudget} upgrade points.`
                                        : `${perkName} — ${augmentBudget} upgrade points.`}{" "}
                                    Spend them on augments and pick your synergies, then continue to place your units.
                                </Typography>
                                <SideToggleContainer
                                    side={userTeam === TeamVals.LOWER ? "green" : "red"}
                                    teamType={userTeam}
                                    showArtifactPicker={false}
                                    budgetPoints={augmentBudget}
                                    onReadyChange={setAugmentReady}
                                />
                                {!setupComplete && (
                                    <Typography level="body-xs" textColor={hocColors.muted}>
                                        {augmentReady.pointsRemaining > 0
                                            ? `${augmentReady.pointsRemaining} upgrade point${
                                                  augmentReady.pointsRemaining === 1 ? "" : "s"
                                              } still unspent`
                                            : "Some factions still have an unpicked synergy"}{" "}
                                        — optional; you can reopen this with Edit until the fight starts.
                                    </Typography>
                                )}
                                {/* Always enabled: choices commit as you click them, so closing the
                                    pop-up never loses anything and the phase itself requires nothing. */}
                                <Button
                                    variant="solid"
                                    onClick={() => setAugmentOverlayOpen(false)}
                                    sx={hocPrimaryButtonSx}
                                >
                                    Continue to placement
                                </Button>
                            </ModalDialog>
                        </Modal>
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
                    <Stack spacing={0.75}>
                        <RankedArtifactsPanel snapshot={snapshot} userTeam={userTeam} />
                        <Typography level="body-xs" textColor={hocColors.muted}>
                            Use the board and combat toolbar for movement, attacks, spells, and turn actions.
                        </Typography>
                        <Button
                            variant="soft"
                            color="danger"
                            disabled={busy}
                            onClick={() => setConfirmExitOpen(true)}
                            sx={{ mt: 0.5 }}
                        >
                            Exit Fight (Forfeit)
                        </Button>
                    </Stack>
                )}

                {isObserver && (
                    <Typography level="body-xs" textColor={hocColors.muted}>
                        Live observer mode. Controls are disabled; replay is available after the fight ends.
                    </Typography>
                )}

                {busy && (
                    <Stack direction="row" spacing={1} alignItems="center">
                        <CircularProgress size="sm" sx={hocSpinnerSx} />
                        <Typography level="body-sm" textColor={hocColors.mutedStrong}>
                            Submitting
                        </Typography>
                    </Stack>
                )}
                {error && (
                    <Alert variant="soft" sx={hocDangerAlertSx}>
                        {error}
                    </Alert>
                )}

                <Modal open={confirmExitOpen} onClose={() => !busy && setConfirmExitOpen(false)}>
                    <ModalDialog sx={hocPanelSx}>
                        <Typography level="h4" sx={{ color: hocColors.parchment }}>
                            Exit the fight?
                        </Typography>
                        <Stack spacing={2} sx={{ mt: 1, minWidth: 300, maxWidth: 360 }}>
                            <Typography level="body-sm" textColor={hocColors.mutedStrong}>
                                This forfeits the fight — your opponent is declared the winner immediately and it counts
                                as a loss for you. This cannot be undone.
                            </Typography>
                            <Stack direction="row" spacing={1} justifyContent="flex-end">
                                <Button
                                    variant="plain"
                                    disabled={busy}
                                    onClick={() => setConfirmExitOpen(false)}
                                    sx={hocSoftButtonSx}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    variant="solid"
                                    color="danger"
                                    loading={busy}
                                    onClick={async () => {
                                        // Record the forfeit (opponent wins), then drop the player back to
                                        // game-mode selection instead of leaving them on the finished board.
                                        await submitProtocolAction({ type: PlayActionType.ABANDON });
                                        setConfirmExitOpen(false);
                                        navigate("/play");
                                    }}
                                >
                                    Forfeit
                                </Button>
                            </Stack>
                        </Stack>
                    </ModalDialog>
                </Modal>
            </Stack>
        </Sheet>
    );
};
