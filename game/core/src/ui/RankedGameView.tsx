import {
    Artifact,
    AttackVals,
    Augment,
    FightStateManager,
    Perk,
    TeamVals,
    type GameAction,
    type TeamType,
} from "@heroesofcrypto/common";
import {
    Alert,
    Box,
    Button,
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
import { setPrefightMusicActive } from "./audio/prefightMusic";
import type { PlayAction, PlaySnapshot, PlayUnitState } from "../api/play_protocol";
import type { SceneGameActionTransport, SceneGameActionTransportOptions } from "../game_action_transport";
import { images } from "../generated/image_imports";
import { usePixiManager } from "../pixi/PixiGameManager";
import type { SceneEntry } from "../pixi/PixiScene";
import {
    collectRankedReplaySnapshots,
    createSandboxReplayFromRankedReplay,
    parseRankedReplayAction,
    type RankedReplay,
    type RankedReplayActionRecord,
} from "../replay/ranked_replay";
import { getLocalModelOpponentConfig, isLocalModelAction } from "../scenes/LocalModelOpponent";
import { authoritativeSnapshotToSandboxSceneState, RankedPlayScene } from "../scenes/RankedPlayScene";
import type { IWindowSize } from "../scenes/VisibleState";
import { FightFinishedOverlay } from "./FightFinishedOverlay";
import { BoardEdgeTrim } from "./boardEdgeTrim";
import LeftSideBar from "./LeftSideBar";
import SynergiesRow from "./LeftSideBar/SynergiesRow";
import { Main } from "./Main";
import Popover from "./Popover";
import RightSideBar from "./RightSideBar";
import SideToggleContainer from "./RightSideBar/SideToggleContainer";
import { UpNextOverlay } from "./UpNextOverlay";
import { AiControlBadge, aiBadgeLeft } from "./AiControlBadge";
import { NextLapHazardBadge } from "./NextLapHazardBadge";
import { ExitReplayBadge } from "./ExitReplayBadge";
import { RankedFinishedActions } from "./RankedFinishedActions";
import { UNIT_ID_TO_IMAGE, UNIT_ID_TO_NAME } from "./unit_ui_constants";
import { ButtonProvider } from "./context/ButtonContext";
import { ViewerTeamContext } from "./context/ViewerTeamContext";
import { hocColors, hocDangerAlertSx, hocPanelSx, hocPrimaryButtonSx, hocSoftButtonSx, hocSpinnerSx } from "./hocTheme";
import {
    hasOffGridSubmitCell,
    rejectionErrorFromPlayEvent,
    resolveEffectiveLocalModelOpponentConfig,
    shouldApplyActionResponseSnapshotToViewer,
    shouldRecoverRejectedMoveFollowUp,
} from "./rankedActionResponse";
import { syncRankedSnapshotSynergies } from "./rankedSynergySync";
import {
    aiOpponentLabel,
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
    if (phase === PlayPhase.PLACEMENT) return "Pre-fight placement";
    if (phase === PlayPhase.PLAY) return "Fight";
    if (phase === PlayPhase.FINISHED) return "Finished";
    if (phase === PlayPhase.ABANDONED) return "Abandoned";
    return "Loading";
};

// The header no longer carries a status chip, so connection state only surfaces when something is off:
// everything NOT in this set (Connecting, Reconnecting, and every *failed*/unavailable) shows as a
// one-line warning above "You: <team>". Keep replay's normal progress steps listed here — they are not
// problems and would otherwise sit on screen for the whole playback.
const HEALTHY_STATUSES = new Set(["Connected", "Loading replay", "Preparing replay", "Replaying", "Replay complete"]);

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
    replayOnly?: boolean;
};

type PendingAuthoritativePlayback = {
    record: RankedReplayActionRecord;
    stateAfterSnapshot?: PlaySnapshot;
};

export const RankedGameView: React.FC<Props> = ({ gameId, userTeam, windowSize, replayOnly = false }) => {
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
    const [status, setStatus] = useState(replayOnly ? "Loading replay" : "Connecting");
    const [error, setError] = useState("");
    // Top-left "Play another" post-match action state (see RankedFinishedActions).
    const [playAnotherBusy, setPlayAnotherBusy] = useState(false);
    const [playAnotherError, setPlayAnotherError] = useState("");
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
    const storedReplayRef = useRef<RankedReplay | undefined>(undefined);
    const replayAutoplayStartedRef = useRef(false);

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
            aug("Empower", side === "lower" ? s.lowerAugmentEmpower : s.upperAugmentEmpower);
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
    const pendingMoveFollowUpUnitIdRef = useRef<string | undefined>(undefined);
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
        // undefined = the game is still drafting (204); there is nothing to reconcile against yet.
        if (nextSnapshot) {
            applySnapshot(nextSnapshot);
        }
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
        if (replayOnly) {
            return undefined;
        }
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
    }, [refreshSnapshot, replayOnly]);

    useEffect(() => {
        if (replayOnly) {
            return undefined;
        }
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
        replayOnly,
    ]);

    const myPlayer = useMemo(() => snapshot?.players.find((player) => player.team === userTeam), [snapshot, userTeam]);
    const isObserver = replayOnly || userTeam === TeamVals.NO_TEAM || !myPlayer;
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
        navigate(replayOnly ? "/portal" : "/play");
    }, [navigate, replayOnly]);
    const handlePlayAgainVsAi = useCallback(async () => {
        // Always rematch the default AI (no difficulty tiers) — matches the tier-less "Play vs AI" entry.
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
                const game = await createVsAiGame();
                const nextGameId = game.id;
                if (!nextGameId) {
                    throw new Error("AI match response was incomplete");
                }
                // Remembered the same way the initial Play-vs-AI entry (MatchmakingRoute) does, so the
                // new match's pick phase can label the opponent as the AI (version-only, tier-less seat).
                markVsAiGame(nextGameId);
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
    }, [navigate]);
    // Top-left "Play another": start a fresh ranked game. A vs-AI match rematches directly at the same
    // tier; a human match has no instant rematch, so route to the game-type selection (/play) where
    // Find Opponent / Play vs AI live.
    const handlePlayAnother = useCallback(async () => {
        if (playAnotherBusy) {
            return;
        }
        setPlayAnotherError("");
        if (!isVsAiMatch) {
            navigate("/play");
            return;
        }
        setPlayAnotherBusy(true);
        try {
            await handlePlayAgainVsAi();
        } catch (err) {
            // On success handlePlayAgainVsAi navigates away; only a failure lands here.
            setPlayAnotherBusy(false);
            setPlayAnotherError(err instanceof Error ? err.message : "Unable to start another match");
        }
    }, [handlePlayAgainVsAi, isVsAiMatch, navigate, playAnotherBusy]);
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

    // "Iron and Silk" runs from the match being found until the first turn. The route hands the flag over
    // once the board is up; from here it is simply "we have a board and the fight has not started", which is
    // placement. It goes quiet the moment the fight begins, and a replay never plays it — the outcome is
    // already decided, so there is no tension to score.
    useEffect(() => {
        setPrefightMusicActive(!replayOnly && hasSnapshot && !gameStarted);
    }, [replayOnly, hasSnapshot, gameStarted]);
    useEffect(() => () => setPrefightMusicActive(false), []);

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
            if (hasOffGridSubmitCell(payload)) {
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
                    // A fight in progress always has a snapshot; undefined would mean the game left PLAY
                    // under us (finished/abandoned), in which case there is nothing to apply.
                    if (fresh) {
                        applySnapshot(fresh, { forceBoardRebuild: rejected });
                    }
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

    const playLoadedRankedReplay = useCallback(
        async (replay: RankedReplay) => {
            clearReplayTimers();
            setBusy(true);
            setStatus("Preparing replay");
            setError("");

            try {
                const replaySnapshots = collectRankedReplaySnapshots(replay);
                const initialSnapshot = replaySnapshots[0] ?? replay.currentSnapshot;
                if (initialSnapshot) {
                    applySnapshot(initialSnapshot, { forceBoardRebuild: true });
                    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
                }

                const sandboxReplay = createSandboxReplayFromRankedReplay(replay, {
                    snapshotToState: (playSnapshot) =>
                        authoritativeSnapshotToSandboxSceneState(toSceneSnapshot(playSnapshot)),
                });

                setStatus("Replaying");
                if (sandboxReplay) {
                    const replayed = await manager.PlaySandboxReplay(sandboxReplay);
                    if (replayed) {
                        setStatus("Replay complete");
                        return;
                    }
                }

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
                setStatus("Replay complete");
            } catch (err: unknown) {
                setStatus("Replay failed");
                setError((err as Error).message || "Unable to load replay");
            } finally {
                if (replay.currentSnapshot) {
                    applySnapshot(replay.currentSnapshot, { forceBoardRebuild: true });
                }
                setBusy(false);
            }
        },
        [applySnapshot, clearReplayTimers, manager, toSceneSnapshot],
    );

    const replayRankedFight = useCallback(async () => {
        setStatus("Loading replay");
        setError("");
        try {
            await playLoadedRankedReplay(await fetchRankedPlayReplay(gameId));
        } catch (err: unknown) {
            setStatus("Replay failed");
            setError((err as Error).message || "Unable to load replay");
        }
    }, [gameId, playLoadedRankedReplay]);

    useEffect(() => {
        if (!replayOnly) {
            return undefined;
        }

        let cancelled = false;
        replayAutoplayStartedRef.current = false;
        storedReplayRef.current = undefined;
        setGameUnavailable(false);
        setStatus("Loading replay");
        setError("");

        fetchRankedPlayReplay(gameId)
            .then((replay) => {
                if (cancelled) {
                    return;
                }
                storedReplayRef.current = replay;
                const initialSnapshot = collectRankedReplaySnapshots(replay)[0] ?? replay.currentSnapshot;
                applySnapshot(initialSnapshot, { forceBoardRebuild: true });
            })
            .catch((err: unknown) => {
                if (!cancelled) {
                    setStatus("Replay unavailable");
                    setError((err as Error).message || "This match does not have a stored replay");
                    setGameUnavailable(true);
                }
            });

        return () => {
            cancelled = true;
            storedReplayRef.current = undefined;
        };
    }, [applySnapshot, gameId, replayOnly]);

    useEffect(() => {
        const replay = storedReplayRef.current;
        if (!replayOnly || !pixiReady || !snapshot || !replay || replayAutoplayStartedRef.current) {
            return;
        }
        replayAutoplayStartedRef.current = true;
        void playLoadedRankedReplay(replay);
    }, [pixiReady, playLoadedRankedReplay, replayOnly, snapshot]);

    useEffect(() => {
        if (replayOnly) {
            manager.SetGameActionTransport(undefined);
            return undefined;
        }
        manager.SetGameActionTransport(transport);
        return () => manager.SetGameActionTransport(undefined);
    }, [manager, replayOnly, transport]);

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

        // A split placement needs one model pass per sub-stage: setup choices + setup-ready first, then
        // board placement + board-ready after the server opens the board. Legacy placement keeps one pass.
        const placementStageKey = snapshot.placementSplit ? snapshot.placementStage : "legacy";
        const runKey = `${snapshot.gameId}:${modelPlayer.playerId}:${placementStageKey}`;
        if (modelPlacementRunKeyRef.current === runKey) {
            return;
        }
        modelPlacementRunKeyRef.current = runKey;
        window.setTimeout(() => {
            void (async () => {
                let latestSnapshot = snapshotRef.current;
                try {
                    // Keep the last known snapshot if the game is still drafting (204) — same fallback
                    // this already uses for a failed fetch.
                    latestSnapshot =
                        (await fetchRankedPlaySnapshot(gameId, {
                            authorization: effectiveLocalModelConfig.authorization,
                        })) ?? snapshotRef.current;
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

                const runSetup = !latestSnapshot.placementSplit || latestSnapshot.placementStage === 0;
                const runBoard = !latestSnapshot.placementSplit || latestSnapshot.placementStage === 1;
                if (!runSetup && !runBoard) {
                    return;
                }

                // The AI opponent spends its upgrade budget on a solid combat-augment loadout (Might/Armor/
                // Movement = 3+2+1 = 6 pts, within the default budget) so it "uses upgrades" like a real
                // player. Applied to the model team's FightProperties before placement so its units get
                // buffed once the fight starts.
                if (runSetup) {
                    try {
                        const modelTeam = effectiveLocalModelConfig.modelTeam;
                        manager.PropagateAugmentation(modelTeam, {
                            type: "Might",
                            value: Augment.MightAugment.LEVEL_3,
                        });
                        manager.PropagateAugmentation(modelTeam, {
                            type: "Armor",
                            value: Augment.ArmorAugment.LEVEL_2,
                        });
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
                }

                if (runBoard) {
                    for (const action of createModelPlacementActions(
                        latestSnapshot,
                        effectiveLocalModelConfig.modelTeam,
                    )) {
                        await submitProtocolActionForTeam(
                            action,
                            effectiveLocalModelConfig.modelTeam,
                            effectiveLocalModelConfig.authorization,
                        );
                    }
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
                    <Typography sx={{ color: "#f6d87c", fontWeight: 800, fontSize: "1.5rem" }}>
                        {replayOnly ? "Replay unavailable" : "Game is not available"}
                    </Typography>
                    <Typography sx={{ opacity: 0.75 }}>
                        {replayOnly
                            ? "This older match does not have a complete stored replay."
                            : "This match has ended or is no longer on the server. It may have been cleaned up or the server was restarted."}
                    </Typography>
                    {replayOnly && (
                        <Button variant="soft" sx={hocSoftButtonSx} onClick={() => navigate("/portal")}>
                            Back to match history
                        </Button>
                    )}
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
                    {/* The gold rule closing the gap between the board and each bar. It was mounted only in
                        the sandbox and on the pick screen, so a ranked fight — which builds its own layout
                        around the same two sidebars — never drew it and the board simply ran into the
                        leather. It is anchored to the BOARD's edges, so it belongs beside the bars wherever
                        they are used. */}
                    <BoardEdgeTrim windowSize={windowSize} />
                    <ViewerTeamContext.Provider value={viewerTeam}>
                        <LeftSideBar gameStarted={gameStarted} windowSize={windowSize} />
                    </ViewerTeamContext.Provider>
                    <RightSideBar gameStarted={gameStarted} windowSize={windowSize} rankedPanel={rankedPanel} />
                    {gameStarted && <RankedSynergiesPanel snapshot={snapshot} userTeam={userTeam} />}
                    {gameStarted && <UpNextOverlay />}
                    {gameStarted && <NextLapHazardBadge />}
                    {gameStarted && (aiToggleOn || !!myPlayer?.aiControlled) && (
                        <AiControlBadge left={aiBadgeLeft(windowSize)} />
                    )}
                    {(replayOnly || replayPlaybackActive) && (
                        // Ranked: leaving the replay returns to the account / game-selection screen.
                        <ExitReplayBadge
                            left={aiBadgeLeft(windowSize)}
                            onExit={() => window.location.assign("/portal")}
                        />
                    )}
                    {gameStarted && (
                        <FightFinishedOverlay
                            backLabel={replayOnly ? "Match History" : undefined}
                            canReplay={snapshot.phase === PlayPhase.FINISHED || snapshot.fightFinished}
                            mode="ranked"
                            opponentLabel={vsAiOpponentLabel}
                            onReplay={replayRankedFight}
                            onPlayAgainVsAi={isVsAiMatch && !isObserver ? handlePlayAgainVsAi : undefined}
                            onBackToLobby={handleBackToLobby}
                        />
                    )}
                    {/* Persistent top-left post-match actions for the participant: quick access after the
                        results overlay is dismissed. Not shown to observers/replay (ExitReplayBadge covers those). */}
                    {gameStarted &&
                        !isObserver &&
                        !replayPlaybackActive &&
                        (snapshot.phase === PlayPhase.FINISHED || snapshot.fightFinished) && (
                            <RankedFinishedActions
                                left={aiBadgeLeft(windowSize)}
                                playAnotherBusy={playAnotherBusy}
                                error={playAnotherError}
                                onPlayAnother={handlePlayAnother}
                                onHome={() => navigate("/play")}
                            />
                        )}
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
    // Default to peeling a single off (1 / N-1), not a 50/50 split — the common ranked use is splitting a
    // lone unit to screen/body-block or bait a spell, so 1 is the far more frequent starting point.
    const [splitAmount, setSplitAmount] = useState(1);
    const maxUnits = userTeam === TeamVals.LOWER ? snapshot.maxLowerUnits : snapshot.maxUpperUnits;
    const effectiveMaxUnits = maxUnits > 0 ? maxUnits : Number.POSITIVE_INFINITY;
    const teamUnitCount = snapshot.units.filter((unit) => unit.team === userTeam && !unit.dead).length;
    const hasStackCapacity = teamUnitCount < effectiveMaxUnits;
    const canSplit = canSubmit && maxSplitAmount >= 1 && hasStackCapacity;
    const sliderValue = Math.min(Math.max(1, splitAmount), Math.max(1, maxSplitAmount));

    useEffect(() => {
        // Reset to a single-unit split (1 / N-1) whenever a different stack is selected — see above.
        setSplitAmount(1);
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
                // (art.description keeps {}/[]/<> placeholders — formatArtifactDescription fills them).
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

// Sidebar art per augment category — the same images the picker overlay and the player portal's
// match history use, so the recap reads visually instead of as text chips.
const AUGMENT_SIDEBAR_IMAGES: Record<string, keyof typeof images> = {
    Placement: "board_augment_256",
    Armor: "armor_augment_256",
    Might: "might_augment_256",
    Empower: "empower_augment_256",
    Sniper: "sniper_augment_256",
    Movement: "movement_augment_256",
};

// Tooltip effect text per category/level, worded exactly like the picker overlay's radio labels
// (SideToggleContainer) so the recap and the picker describe the same choice the same way.
const augmentEffectText = (label: string, level: number): string => {
    switch (label) {
        case "Placement":
            return ["Height 3 partial", "Height 4 full", "Height 6 full + edge line"][level] ?? "Height 3 partial";
        case "Armor":
            return `+${Augment.getArmorPower(level as Augment.ArmorAugment)}% Armor, +${Augment.getArmorPower(
                level as Augment.ArmorAugment,
            )} Magic Armor`;
        case "Might":
            return `+${Augment.getMightPower(level as Augment.MightAugment)}% Melee attack`;
        case "Empower":
            return `+${Augment.getEmpowerPower(level as Augment.EmpowerAugment)}% Magic damage`;
        case "Sniper": {
            const [attack, distance] = Augment.getSniperPower(level as Augment.SniperAugment);
            return `+${attack}% attack/+${distance}% distance`;
        }
        case "Movement":
            return `+${Augment.getMovementPower(level as Augment.MovementAugment)} Movement steps`;
        default:
            return "";
    }
};

// Read-only recap of the augments/synergies chosen in the placement overlay, shown in the sidebar
// while the player positions units. Augment levels come straight from the authoritative snapshot;
// faction synergies come from the local FightProperties. Read-only on purpose: augments are committed
// in the Setup stage, so there is no edit affordance here.
const RankedAugmentSummary: React.FC<{
    snapshot: PlaySnapshot;
    userTeam: TeamType;
    budget: number;
}> = ({ snapshot, userTeam, budget }) => {
    const isUpper = userTeam === TeamVals.UPPER;
    const pick = (lowerVal?: number, upperVal?: number): number => (isUpper ? upperVal : lowerVal) ?? 0;
    const rows = [
        { label: "Placement", level: pick(snapshot.lowerAugmentPlacement, snapshot.upperAugmentPlacement) },
        { label: "Armor", level: pick(snapshot.lowerAugmentArmor, snapshot.upperAugmentArmor) },
        { label: "Might", level: pick(snapshot.lowerAugmentMight, snapshot.upperAugmentMight) },
        { label: "Empower", level: pick(snapshot.lowerAugmentEmpower, snapshot.upperAugmentEmpower) },
        { label: "Sniper", level: pick(snapshot.lowerAugmentSniper, snapshot.upperAugmentSniper) },
        { label: "Movement", level: pick(snapshot.lowerAugmentMovement, snapshot.upperAugmentMovement) },
    ];
    // Point cost equals the augment level value (Placement LEVEL_1 == 0 == free); the server enforces
    // the same sum against the perk budget (getUpgradePoints / canAugment).
    const spent = rows.reduce((total, r) => total + r.level, 0);
    const synergies = FightStateManager.getInstance().getFightProperties().getSynergiesPerTeam(userTeam);
    // Placement always resolves to at least LEVEL_1 (value 0); other categories start at NO_AUGMENT (0).
    const chosen = rows.filter((r) => r.label === "Placement" || r.level > 0);
    return (
        <Stack spacing={0.5}>
            <Typography level="body-sm" textColor={hocColors.parchment}>
                Augments ({spent}/{budget} pts)
            </Typography>
            <Stack direction="row" spacing={0.6} flexWrap="wrap" useFlexGap>
                {chosen.length === 0 ? (
                    <Typography level="body-xs" textColor={hocColors.muted}>
                        No augments chosen yet
                    </Typography>
                ) : (
                    chosen.map((r) => {
                        // Placement levels are 0-based (LEVEL_1 == 0), the rest are already 1-based.
                        const displayLevel = r.label === "Placement" ? r.level + 1 : r.level;
                        return (
                            <Tooltip
                                key={r.label}
                                title={
                                    <Box sx={{ maxWidth: 240, py: 0.5 }}>
                                        <Typography level="title-sm" textColor={hocColors.gold}>
                                            {r.label} augment — level {displayLevel}
                                        </Typography>
                                        <Typography level="body-xs" textColor={hocColors.parchment}>
                                            {augmentEffectText(r.label, r.level)}
                                        </Typography>
                                    </Box>
                                }
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
                                        border: "1px solid rgba(245,158,11,0.4)",
                                        bgcolor: "rgba(245,158,11,0.08)",
                                        display: "grid",
                                        placeItems: "center",
                                        overflow: "visible",
                                        cursor: "help",
                                    }}
                                >
                                    <Box
                                        component="img"
                                        src={images[AUGMENT_SIDEBAR_IMAGES[r.label]]}
                                        alt={`${r.label} augment`}
                                        sx={{ width: 36, height: 36, objectFit: "contain", borderRadius: 4 }}
                                    />
                                    <Box
                                        component="span"
                                        sx={{
                                            position: "absolute",
                                            right: -4,
                                            bottom: -4,
                                            minWidth: 16,
                                            height: 13,
                                            px: 0.25,
                                            display: "grid",
                                            placeItems: "center",
                                            borderRadius: "3px",
                                            bgcolor: "#3a2204",
                                            border: `1px solid ${hocColors.orangeBorder}`,
                                            color: hocColors.gold,
                                            fontSize: "0.52rem",
                                            fontWeight: 800,
                                            lineHeight: 1,
                                        }}
                                    >
                                        L{displayLevel}
                                    </Box>
                                </Box>
                            </Tooltip>
                        );
                    })
                )}
            </Stack>
            {/* Synergies are automatic (they follow the drafted factions), so they read as their own block
                under the augments rather than as a choice — same tile size as the augments and artifacts. */}
            <Typography level="body-sm" textColor={hocColors.parchment} sx={{ mt: 0.75 }}>
                Synergies
            </Typography>
            {synergies.length ? (
                <SynergiesRow synergies={synergies} size={36} />
            ) : (
                <Typography level="body-xs" textColor={hocColors.muted}>
                    None yet — two units of one faction activate both bonuses
                </Typography>
            )}
        </Stack>
    );
};

// Fixed six level slots, in the order the draft fills them.
const ROSTER_LEVEL_SLOTS: number[] = [1, 1, 2, 2, 3, 4];

// Sidebar roster row. The draft rails (MyDraftBar/OpponentDraftBar) are laid out for the 1340px draft
// column and get clipped at the ~340px sidebar width, so placement renders this compact variant instead;
// the rails stay in the full-screen augment pop-up where they fit.
const RankedRosterRow: React.FC<{
    title: string;
    accent: string;
    borderColor: string;
    bgcolor: string;
    creatureIds: number[];
}> = ({ title, accent, borderColor, bgcolor, creatureIds }) => (
    <Box sx={{ p: 0.75, borderRadius: "10px", bgcolor, border: `1px solid ${borderColor}` }}>
        <Typography
            level="body-xs"
            sx={{ color: accent, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, mb: 0.5 }}
        >
            {title}
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, flex: "1 1 auto", minWidth: 0 }}>
                {ROSTER_LEVEL_SLOTS.map((level, index) => {
                    const creatureId = creatureIds[index] ?? 0;
                    const src = creatureId ? UNIT_ID_TO_IMAGE[creatureId] : undefined;
                    const name = creatureId
                        ? (UNIT_ID_TO_NAME[creatureId] ?? `Creature ${creatureId}`)
                        : "Not revealed";
                    return (
                        <Tooltip key={`${title}-slot-${index}`} title={`${name} · Lvl ${level}`} variant="soft">
                            <Box
                                sx={{
                                    width: 38,
                                    height: 38,
                                    borderRadius: "8px",
                                    overflow: "hidden",
                                    border: `1px solid ${borderColor}`,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    bgcolor: "rgba(0,0,0,0.35)",
                                    color: accent,
                                    fontSize: 15,
                                    fontWeight: 700,
                                }}
                            >
                                {src ? (
                                    <Box
                                        component="img"
                                        src={src}
                                        alt={name}
                                        sx={{ width: "100%", height: "100%", objectFit: "cover" }}
                                    />
                                ) : (
                                    "?"
                                )}
                            </Box>
                        </Tooltip>
                    );
                })}
            </Box>
        </Box>
    </Box>
);

// Both rosters as the placement sidebar shows them: your six slots, and the opponent's full army. Slots the
// server has not revealed yet (creatureId 0 during the split Setup stage) render as "?" rather than vanish,
// so the army always reads as six slots.
const RankedPlacementRosters: React.FC<{ snapshot: PlaySnapshot; userTeam: TeamType }> = ({ snapshot, userTeam }) => {
    if (snapshot.phase !== PlayPhase.PLACEMENT) {
        return null;
    }

    const myIds = snapshot.units.filter((unit) => unit.team === userTeam && !unit.dead).map((unit) => unit.creatureId);
    const opponentIds = snapshot.units
        .filter((unit) => unit.team !== userTeam && !unit.dead)
        .map((unit) => unit.creatureId);
    if (!myIds.length && !opponentIds.length) {
        return null;
    }

    return (
        <Stack spacing={1.75}>
            <RankedRosterRow
                title="Opponent"
                accent="#ff9d9d"
                borderColor="rgba(138,43,43,0.6)"
                bgcolor="#241416"
                creatureIds={opponentIds}
            />
            <RankedRosterRow
                title="Your army"
                accent="#dcb158"
                borderColor="rgba(255,255,255,0.12)"
                bgcolor="#171a23"
                creatureIds={myIds}
            />
        </Stack>
    );
};

// Top-left HUD panel showing both armies' active synergies once the fight has started. The server only
// populates snapshot.*Synergies after fight start (empty during placement), so this stays hidden until the
// fight begins — and it never reveals picks during placement. (Restored by owner request: synergies read
// better pinned up here than folded into the selected unit's Buffs well.)
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
    // The perk sets the upgrade-point budget (5/6/7 via getUpgradePoints).
    const userPerkId = ((userTeam === TeamVals.LOWER ? snapshot?.lowerPerk : snapshot?.upperPerk) ||
        Perk.Perk.NO_PERK) as Perk.Perk;
    const augmentBudget = Perk.getUpgradePoints(userPerkId);
    // Split placement runs Setup (augments/synergies, stage 0) then Board (positioning, stage 1). A legacy
    // combined placement reports placementSplit=false and behaves as before (augments + board share one
    // window). During the split Setup stage the picker is forced open and the board is locked; during the
    // split Board stage the picker is locked shut (augments committed) and the board opens.
    const inSetupStage = snapshot.placementSplit && snapshot.placementStage === 0;
    const inBoardStage = !snapshot.placementSplit || snapshot.placementStage === 1;
    // Placement countdown for the header chip.
    const [augmentNowMs, setAugmentNowMs] = useState(Date.now());
    useEffect(() => {
        const id = setInterval(() => setAugmentNowMs(Date.now()), 1000);
        return () => clearInterval(id);
    }, []);
    const augmentSecondsLeft =
        snapshot.placementDeadlineMs > 0
            ? Math.max(0, Math.ceil((snapshot.placementDeadlineMs - augmentNowMs) / 1000))
            : -1;
    // Remaining-points / synergy-completion state, reported up by SideToggleContainer via onReadyChange
    // (setAugmentReady is stable, no render loop). Gates the "Lock in augments" button: it stays disabled
    // until every upgrade point is spent, so nobody advances with an unfinished build by accident.
    // Synergies no longer figure in it — they follow the drafted factions automatically. This can never hold the fight
    // hostage — the Setup timer advances the stage regardless and the AI auto-spends for anyone not
    // locked in (and any leftover point is always spendable: every augment step-up costs exactly 1).
    const [augmentReady, setAugmentReady] = useState<{ pointsRemaining: number; allSynergiesSelected: boolean }>({
        pointsRemaining: 1,
        allSynergiesSelected: false,
    });
    const setupComplete = augmentReady.pointsRemaining <= 0 && augmentReady.allSynergiesSelected;

    const confirmExitModal = (
        <Modal open={confirmExitOpen} onClose={() => !busy && setConfirmExitOpen(false)}>
            <ModalDialog sx={hocPanelSx}>
                <Typography level="h4" sx={{ color: hocColors.parchment }}>
                    Exit the fight?
                </Typography>
                <Stack spacing={2} sx={{ mt: 1, minWidth: 300, maxWidth: 360 }}>
                    <Typography level="body-sm" textColor={hocColors.mutedStrong}>
                        This forfeits the fight — your opponent is declared the winner immediately and it counts as a
                        loss for you. This cannot be undone.
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
    );

    // Fight phase: the sheet has nothing left to say, so it does not render one. Returning the button bare
    // — no Sheet, no outline, no panel background — is the point; wrapping it kept the gold frame and the
    // header band around a single control.
    if (gameStarted && !isObserver) {
        return (
            <>
                <Button
                    variant="soft"
                    color="danger"
                    disabled={busy}
                    onClick={() => setConfirmExitOpen(true)}
                    sx={{ width: "100%" }}
                >
                    EXIT FIGHT
                </Button>
                {confirmExitModal}
            </>
        );
    }

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
                <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                    <Typography level="title-md" textColor={hocColors.parchment}>
                        {phaseLabel(snapshot.phase)}
                    </Typography>
                    {snapshot.phase === PlayPhase.PLACEMENT && augmentSecondsLeft >= 0 && (
                        <Typography
                            sx={{
                                px: 1,
                                py: 0.25,
                                fontSize: 22,
                                fontWeight: 700,
                                lineHeight: 1.2,
                                borderRadius: "8px",
                                fontVariantNumeric: "tabular-nums",
                                color: augmentSecondsLeft <= 15 ? "#ff8f8f" : hocColors.parchment,
                                bgcolor: "rgba(255,255,255,0.06)",
                                border: "1px solid rgba(255,255,255,0.14)",
                            }}
                        >
                            {`${Math.floor(augmentSecondsLeft / 60)}:${String(augmentSecondsLeft % 60).padStart(2, "0")}`}
                        </Typography>
                    )}
                </Stack>

                {!HEALTHY_STATUSES.has(status) && (
                    <Typography
                        level="body-xs"
                        textColor={hocColors.gold}
                        sx={{
                            px: 0.75,
                            py: 0.25,
                            borderRadius: "6px",
                            bgcolor: hocColors.orangeSoft,
                            border: `1px solid ${hocColors.orangeBorder}`,
                        }}
                    >
                        {status}
                    </Typography>
                )}

                {(isObserver || currentUnit) && (
                    <Typography level="body-sm" textColor={hocColors.mutedStrong}>
                        {isObserver ? "Watching as observer" : ""}
                        {currentUnit ? `Active: ${currentUnit.name} (${teamLabel(currentUnit.team)})` : ""}
                    </Typography>
                )}

                {snapshot.phase === PlayPhase.PLACEMENT && !isObserver && (
                    <Stack spacing={0.75}>
                        <RankedPlacementRosters snapshot={snapshot} userTeam={userTeam} />
                        <RankedArtifactsPanel snapshot={snapshot} userTeam={userTeam} />
                        {/* The augment/synergy picker lives HERE in the sidebar — the pre-#129 home,
                            restored by owner request: pick augments beside the board instead of inside a
                            fullscreen draft step. Interactive while augments are still editable (the split
                            Setup stage before lock-in, or the whole legacy combined window), a read-only
                            recap afterwards. The picker routes to the authoritative server via
                            RankedPlayScene.propagateAugmentation (the AUGMENT play-action); artifacts are
                            drafted in pick/ban (read-only above), so the sandbox-only artifact picker
                            stays hidden. */}
                        {(inSetupStage || !snapshot.placementSplit) && !ready ? (
                            <SideToggleContainer
                                side={userTeam === TeamVals.LOWER ? "green" : "red"}
                                teamType={userTeam}
                                showArtifactPicker={false}
                                budgetPoints={augmentBudget}
                                onReadyChange={setAugmentReady}
                            />
                        ) : (
                            <RankedAugmentSummary snapshot={snapshot} userTeam={userTeam} budget={augmentBudget} />
                        )}
                        {/* Split Setup: lock-in advances the stage once every point is spent (both-ready or
                            the deadline advances; the AI auto-spends for anyone not locked in). The header
                            chip carries the countdown — no modal hides it anymore. */}
                        {inSetupStage && (
                            <Button
                                variant="solid"
                                disabled={!canSubmit || ready || !setupComplete}
                                onClick={() => void submitProtocolAction({ type: PlayActionType.READY_PLACEMENT })}
                                sx={setupComplete && !ready ? hocPrimaryButtonSx : hocSoftButtonSx}
                            >
                                {ready
                                    ? "Waiting for opponent…"
                                    : `Lock in augments (${augmentBudget - augmentReady.pointsRemaining}/${augmentBudget} pts)`}
                            </Button>
                        )}
                        {/* The board-stage Ready (start the fight) + per-stack split/unplace controls are hidden
                            during the split Setup stage, when the board is locked. */}
                        {inBoardStage && (
                            <Button
                                variant="solid"
                                disabled={!canSubmit || ready}
                                onClick={() => void submitProtocolAction({ type: PlayActionType.READY_PLACEMENT })}
                                sx={ready ? hocSoftButtonSx : hocPrimaryButtonSx}
                            >
                                {ready ? "Ready" : "Ready Placement"}
                            </Button>
                        )}
                        {inBoardStage && selectedUnit?.placed && selectedUnit.team === userTeam && (
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

                {confirmExitModal}
            </Stack>
        </Sheet>
    );
};
