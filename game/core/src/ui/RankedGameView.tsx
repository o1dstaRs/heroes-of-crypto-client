import {
    Artifact,
    Augment,
    FightStateManager,
    Doctrine,
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
import { useLocation, useNavigate } from "react-router";
import { v4 as uuidv4 } from "uuid";

import { createPlayActionFromGameAction } from "../api/game_action_play_codec";
import { isPreviewPlayGame } from "../api/previewPlaySession";
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
import { createInitialPlayerPlacementActions, createModelPlacementActions } from "./rankedPlacementGeometry";
import { setPrefightMusicActive } from "./audio/prefightMusic";
import type { PlayAction, PlaySnapshot, PlayUnitState } from "../api/play_protocol";
import type { SceneGameActionTransport, SceneGameActionTransportOptions } from "../game_action_transport";
import { axiosMMInstance, endpoints } from "../api/axios";
import { images } from "../generated/image_imports";
import { t, useTranslation } from "../i18n/i18n";
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
import LeftSideBar from "./LeftSideBar";
import SynergiesRow from "./LeftSideBar/SynergiesRow";
import { Main } from "./Main";
import { LoadingFullscreenToggle } from "./LoadingFullscreenToggle";
import Popover from "./Popover";
import RightSideBar from "./RightSideBar";
import { MapBadge } from "./PickAndBan/MapReveal";
import {
    DRAFT_ARMIES_HEIGHT,
    DRAFT_HEADER_HEIGHT,
    DRAFT_ZONE_GAP,
    DraftBottomControls,
    CreatureDetailPanel,
    draftBoardSx,
    draftShellSx,
    DraftTitle,
    MyDraftBar,
    OpponentDraftBar,
    PhasePanel,
    PickCommitButton,
    useDraftScale,
} from "./PickAndBan";
import { PickLanternFire } from "./PickAndBan/PickLanternFire";
import SandboxToggleContainer from "./RightSideBar/SandboxToggleContainer";
import SideToggleContainer from "./RightSideBar/SideToggleContainer";
import { UpNextOverlay } from "./UpNextOverlay";
import { AiControlBadge, aiBadgeLeft } from "./AiControlBadge";
import { NextLapHazardBadge } from "./NextLapHazardBadge";
import { ExitReplayBadge } from "./ExitReplayBadge";
import { setBattleSystemControlsActive } from "./social/systemControlsMode";
import { CreaturePortraitImage } from "./CreaturePortraitImage";
import { UNIT_ID_TO_NAME } from "./unit_ui_constants";
import { ButtonProvider } from "./context/ButtonContext";
import { exitFightButtonSx } from "./exitFightButtonSx";
import { useFullscreenActive } from "./useFullscreenActive";
import { ViewerTeamContext } from "./context/ViewerTeamContext";
import {
    hocColors,
    hocDangerAlertSx,
    hocDisplayFontFamily,
    hocDisplayLetterSpacing,
    hocPanelSx,
    hocSidebarImageButtonSx,
    hocSidebarSectionSx,
    hocSoftButtonSx,
    hocSplitterSliderSx,
    hocSpinnerSx,
} from "./hocTheme";
import {
    hasOffGridSubmitCell,
    rejectionErrorFromPlayEvent,
    resolveEffectiveLocalModelOpponentConfig,
    shouldApplyActionResponseSnapshotToViewer,
    shouldPlayAuthoritativeAction,
    shouldRecoverRejectedMoveFollowUp,
} from "./rankedActionResponse";
import {
    isRankedBoardPlacementStage,
    rankedPlacementLockActionType,
    shouldHideRankedSetupOpponentRoster,
    shouldShowRankedAugmentPicker,
    shouldShowRankedPlacementRosters,
} from "./rankedPlacementStage";
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
    if (team === TeamVals.LEFT) return "Green";
    if (team === TeamVals.RIGHT) return "Red";
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
    // Re-renders the ranked chrome when the profile's language changes; render sites use the module t().
    useTranslation();
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
    // the ranked client never picks these locally. Doctrine also drives the placement augment sidebar's
    // upgrade-point budget. Defined BEFORE the snapshot-apply effect below, so FightProperties is populated
    // before hydration. Opponent values are hidden (0) during placement and revealed at fight start, so we
    // sync each team verbatim (0 clears to NO_ARTIFACT / NO_AUGMENT / NO_DOCTRINE).
    useEffect(() => {
        if (!snapshot) {
            return;
        }
        const fp = FightStateManager.getInstance().getFightProperties();
        const syncTeam = (team: TeamType, side: "lower" | "upper"): void => {
            const s = snapshot;
            fp.setDoctrinePerTeam(
                team,
                ((side === "lower" ? s.leftDoctrine : s.rightDoctrine) ||
                    Doctrine.Doctrine.NO_DOCTRINE) as Doctrine.Doctrine,
            );
            fp.setArtifactPerTeam(
                team,
                Artifact.ArtifactTier.TIER_1,
                (side === "lower" ? s.leftArtifactTier1 : s.rightArtifactTier1) ?? 0,
            );
            fp.setArtifactPerTeam(
                team,
                Artifact.ArtifactTier.TIER_2,
                (side === "lower" ? s.leftArtifactTier2 : s.rightArtifactTier2) ?? 0,
            );
            const aug = (kind: Augment.AugmentType["type"], v: number | undefined): void => {
                fp.setAugmentPerTeam(team, { type: kind, value: v ?? 0 } as Augment.AugmentType);
            };
            aug("Placement", side === "lower" ? s.leftAugmentPlacement : s.rightAugmentPlacement);
            aug("Armor", side === "lower" ? s.leftAugmentArmor : s.rightAugmentArmor);
            aug("Might", side === "lower" ? s.leftAugmentMight : s.rightAugmentMight);
            aug("Empower", side === "lower" ? s.leftAugmentEmpower : s.rightAugmentEmpower);
            aug("Sniper", side === "lower" ? s.leftAugmentSniper : s.rightAugmentSniper);
            aug("Movement", side === "lower" ? s.leftAugmentMovement : s.rightAugmentMovement);
        };
        syncTeam(TeamVals.LEFT, "lower");
        syncTeam(TeamVals.RIGHT, "upper");
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
            if (!shouldPlayAuthoritativeAction(record.action)) {
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
        // Replay page, mid-playback: the sandbox replay engine owns the scene. This effect's `snapshot`
        // is still the PRE-FIGHT one it was seeded with, and playback changes the selected unit on every
        // action — each selection re-ran this effect and re-applied that stale placement snapshot over the
        // running playback. The two pipelines interleaved re-created the opponent's placement roster again
        // and again: the prod replay "wall of duplicated units on one side" (game b3f81f5c). Playback's own
        // finally-clause applies the final snapshot after setReplayPlaybackActive(false), so skipping here
        // still leaves the board settled on the end state.
        if (replayOnly && replayPlaybackActive) {
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
    }, [
        drainPendingAuthoritativeRecords,
        manager,
        pixiReady,
        replayOnly,
        replayPlaybackActive,
        selectedUnitId,
        snapshot,
        toSceneSnapshot,
    ]);

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
        // The preview session (/preview/placement) has no event stream to connect to — its snapshot lives
        // in memory and every action returns the next one, so the 4s poll above is the whole sync story.
        if (replayOnly || isPreviewPlayGame(gameId)) {
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
    // ("ai:v0.8:brutal:…" — authoritative, survives refresh/other browsers); the local marker covers the
    // pre-snapshot window. Legacy tier-less seats degrade to their version-only label, e.g. "AI (v0.8)".
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
    // Where "back" leads depends on how the viewer got here (owner 2026-08-06): a watcher who came
    // through a lobby room returns to THAT lobby; any other observer (the website's Watch links do a
    // full page load, so they carry no router state) goes to the website's main page; participants
    // keep the ranked play screen (or match history for a portal replay).
    const location = useLocation();
    const observerOrigin = (location.state ?? null) as { from?: string; lobbyId?: string } | null;
    const cameFromLobby = observerOrigin?.from === "lobby";
    const handleBackToLobby = useCallback(() => {
        if (isObserver && !replayOnly) {
            if (cameFromLobby) {
                navigate(observerOrigin?.lobbyId ? `/lobby/${observerOrigin.lobbyId}` : "/lobbies");
            } else {
                window.location.assign("https://heroesofcrypto.io");
            }
            return;
        }
        navigate(replayOnly ? "/portal" : "/play");
    }, [navigate, replayOnly, isObserver, cameFromLobby, observerOrigin]);
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

    // Placement and combat share the compact top-right system-controls medallion. Publishing the whole
    // ranked-board lifetime (rather than only the first combat turn) removes the three loose bottom-right
    // social buttons during placement too.
    useEffect(() => {
        setBattleSystemControlsActive(true);
        return () => setBattleSystemControlsActive(false);
    }, []);

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
            // No in-flight gate on placement drags. Refusing a second drag while the first is airborne
            // dropped it silently on any real latency — the scene skips its local apply when completed is
            // false, and Sandbox then clears the selection, so a click within one round trip did nothing at
            // all and deselected the stack. Ordering was never the exposure: queueActionSubmission
            // serializes submissions and builds each envelope INSIDE the queued closure off a freshly read
            // sequence, and the server deliberately exempts place/split/delete from the placement sequence
            // gate ("your units, your zone, no cross-team ordering dependency"). Stale optimistic state is
            // repaired by reconciling from the authoritative snapshot — see shouldPlayAuthoritativeAction —
            // not by throwing the player's input away.
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
    const playerInitialPlacementRunKeyRef = useRef("");
    useEffect(() => {
        if (
            replayOnly ||
            isObserver ||
            !snapshot ||
            snapshot.phase !== PlayPhase.PLACEMENT ||
            (snapshot.placementSplit && snapshot.placementStage !== 1)
        ) {
            return;
        }
        const player = snapshot.players.find((candidate) => candidate.team === userTeam);
        if (!player || snapshot.readyPlayerIds.includes(player.playerId)) {
            return;
        }
        const runKey = `${snapshot.gameId}:${player.playerId}:${snapshot.placementSplit ? snapshot.placementStage : "legacy"}`;
        if (playerInitialPlacementRunKeyRef.current === runKey) {
            return;
        }
        playerInitialPlacementRunKeyRef.current = runKey;

        void (async () => {
            for (const action of createInitialPlayerPlacementActions(snapshot, userTeam)) {
                await submitProtocolAction(action);
            }
        })();
    }, [isObserver, replayOnly, snapshot, submitProtocolAction, userTeam]);

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
                const runBoard = isRankedBoardPlacementStage(latestSnapshot);
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
                    { type: rankedPlacementLockActionType(latestSnapshot) },
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
            <Box
                sx={{
                    position: "fixed",
                    inset: 0,
                    zIndex: 9999,
                    width: "100vw",
                    height: "100dvh",
                    display: "grid",
                    placeItems: "center",
                    bgcolor: "#07090d",
                    color: "#fff",
                }}
            >
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
            gameId={gameId}
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
    const rankedFooter =
        snapshot.phase === PlayPhase.PLACEMENT && !isObserver && isRankedBoardPlacementStage(snapshot) ? (
            <RankedReadyPlacementButton
                canSubmit={canSubmit}
                ready={ready}
                snapshot={snapshot}
                submitProtocolAction={submitProtocolAction}
            />
        ) : undefined;

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
                    {!pixiReady && <LoadingFullscreenToggle />}
                    {/* The gold rule closing the gap between the board and each bar. It was mounted only in
                        the sandbox and on the pick screen, so a ranked fight — which builds its own layout
                        around the same two sidebars — never drew it and the board simply ran into the
                        leather. It is anchored to the BOARD's edges, so it belongs beside the bars wherever
                        they are used. */}
                    {pixiReady && (
                        <ViewerTeamContext.Provider value={viewerTeam}>
                            <LeftSideBar gameStarted={gameStarted} windowSize={windowSize} />
                        </ViewerTeamContext.Provider>
                    )}
                    {pixiReady && (
                        <RightSideBar
                            gameStarted={gameStarted}
                            windowSize={windowSize}
                            rankedPanel={rankedPanel}
                            rankedFooter={rankedFooter}
                        />
                    )}
                    {pixiReady && gameStarted && <UpNextOverlay />}
                    {pixiReady && gameStarted && <NextLapHazardBadge />}
                    {pixiReady && gameStarted && (aiToggleOn || !!myPlayer?.aiControlled) && (
                        <AiControlBadge left={aiBadgeLeft(windowSize)} />
                    )}
                    {pixiReady && (replayOnly || replayPlaybackActive) && (
                        // Ranked: leaving the replay returns to the account / game-selection screen.
                        <ExitReplayBadge
                            left={aiBadgeLeft(windowSize)}
                            onExit={() => window.location.assign("/portal")}
                        />
                    )}
                    {pixiReady && gameStarted && (
                        <FightFinishedOverlay
                            backLabel={
                                replayOnly
                                    ? "Match History"
                                    : isObserver
                                      ? cameFromLobby
                                          ? t("Back to lobby")
                                          : t("Back to website")
                                      : undefined
                            }
                            canReplay={snapshot.phase === PlayPhase.FINISHED || snapshot.fightFinished}
                            gameId={gameId}
                            mode="ranked"
                            players={snapshot.players.map((player) => ({
                                playerId: player.playerId,
                                team: player.team as TeamType,
                                label: player.playerId === aiSeatPlayerId ? vsAiOpponentLabel : undefined,
                                isAi: player.playerId === aiSeatPlayerId,
                            }))}
                            viewerPlayerId={myPlayer?.playerId}
                            onReplay={replayRankedFight}
                            onPlayAgainVsAi={isVsAiMatch && !isObserver ? handlePlayAgainVsAi : undefined}
                            onBackToLobby={handleBackToLobby}
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
    gameId: string;
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
    userTeam: TeamType;
}

const RankedPlacementStackActions: React.FC<RankedPlacementStackActionsProps> = ({
    canSubmit,
    selectedUnit,
    snapshot,
    submitGameAction,
    userTeam,
}) => {
    const amountAlive = Math.max(0, Math.floor(selectedUnit.amountAlive));
    const maxSplitAmount = Math.max(0, amountAlive - 1);
    // Delete permanently destroys the stack — no bench, no undo — so one stray click must not be
    // enough. The first press arms the button; only a second press on the SAME unit commits, and
    // the armed state falls back to normal after a few seconds or when the selection changes.
    const [deleteArmed, setDeleteArmed] = useState(false);
    useEffect(() => {
        setDeleteArmed(false);
    }, [selectedUnit.id]);
    useEffect(() => {
        if (!deleteArmed) {
            return undefined;
        }
        const disarm = window.setTimeout(() => setDeleteArmed(false), 4000);
        return () => window.clearTimeout(disarm);
    }, [deleteArmed]);
    // Default to peeling a single off (1 / N-1), not a 50/50 split — the common ranked use is splitting a
    // lone unit to screen/body-block or bait a spell, so 1 is the far more frequent starting point.
    const [splitAmount, setSplitAmount] = useState(1);
    const maxUnits = userTeam === TeamVals.LEFT ? snapshot.maxLeftUnits : snapshot.maxRightUnits;
    const effectiveMaxUnits = maxUnits > 0 ? maxUnits : Number.POSITIVE_INFINITY;
    const teamUnitCount = snapshot.units.filter((unit) => unit.team === userTeam && !unit.dead).length;
    const hasStackCapacity = teamUnitCount < effectiveMaxUnits;
    const canSplit = canSubmit && maxSplitAmount >= 1 && hasStackCapacity;
    const sliderValue = Math.min(Math.max(1, splitAmount), Math.max(1, maxSplitAmount));

    useEffect(() => {
        // Reset to a single-unit split (1 / N-1) whenever a different stack is selected — see above.
        setSplitAmount(1);
    }, [amountAlive, selectedUnit.id]);

    // A 1-unit stack cannot split, but it can still be DELETED — with auto-deploy there is no
    // bench, so hiding the whole panel here removed the only way to act on single-unit screens.
    const canShowSplit = maxSplitAmount >= 1;

    return (
        <Box
            sx={{
                width: "100%",
                mx: "auto",
                mt: "auto !important",
                mb: 0.25,
                px: 0.75,
                pt: 1,
                pb: 0.75,
                border: "1px solid rgba(222,176,91,.58)",
                borderRadius: "8px",
                background: "linear-gradient(180deg, rgba(52,37,19,.13), rgba(5,5,5,.12))",
                boxShadow:
                    "inset 0 0 0 1px rgba(13,9,6,.96), inset 0 0 0 3px rgba(134,91,49,.34), inset 0 0 14px rgba(221,166,75,.05), 0 2px 7px rgba(0,0,0,.5)",
            }}
        >
            <Stack
                spacing={1.25}
                alignItems="center"
                sx={{
                    px: "16px",
                    "& .MuiTypography-root": {
                        color: "rgba(216,194,156,.7)",
                        fontFamily: hocDisplayFontFamily,
                        fontSynthesis: "none",
                        transition: "color .2s ease",
                    },
                    "&:hover .MuiTypography-root": { color: hocColors.orange },
                }}
            >
                {canShowSplit && (
                    <Box sx={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
                        <Typography level="body-sm">{sliderValue}</Typography>
                        <Typography level="body-sm">{amountAlive - sliderValue}</Typography>
                    </Box>
                )}
                {canShowSplit && (
                    <Slider
                        sx={hocSplitterSliderSx}
                        min={1}
                        max={Math.max(1, maxSplitAmount)}
                        value={sliderValue}
                        disabled={!canSplit}
                        step={1}
                        aria-label="Ranked unit split slider"
                        onChange={(_, value) => setSplitAmount(Array.isArray(value) ? value[0] : value)}
                    />
                )}
            </Stack>
            <Stack direction="row" spacing={2} sx={{ width: "93%", mx: "auto", mt: 1.5 }}>
                {canShowSplit && (
                    <Button
                        variant="plain"
                        size="sm"
                        disabled={!canSplit}
                        onClick={() =>
                            void submitGameAction({
                                type: "split_unit",
                                unitId: selectedUnit.id,
                                amount: sliderValue,
                            })
                        }
                        sx={{
                            ...hocSidebarImageButtonSx("neutral"),
                            flex: 1,
                            minWidth: 0,
                            height: "29.25px",
                            minHeight: "29.25px",
                            maxHeight: "29.25px",
                            py: 0,
                        }}
                    >
                        Split
                    </Button>
                )}
                <Button
                    variant="plain"
                    size="sm"
                    disabled={!canSubmit}
                    onClick={() => {
                        if (!deleteArmed) {
                            setDeleteArmed(true);
                            return;
                        }
                        setDeleteArmed(false);
                        void submitGameAction({
                            type: "delete_unit",
                            unitId: selectedUnit.id,
                        });
                    }}
                    sx={{
                        ...hocSidebarImageButtonSx("danger"),
                        flex: 1,
                        minWidth: 0,
                        height: "29.25px",
                        minHeight: "29.25px",
                        maxHeight: "29.25px",
                        py: 0,
                        ...(deleteArmed ? { fontWeight: "lg", textDecoration: "underline" } : {}),
                    }}
                >
                    {deleteArmed ? "Sure?" : "Delete"}
                </Button>
            </Stack>
            {!hasStackCapacity && maxUnits > 0 && (
                <Typography level="body-xs" sx={{ mt: 0.75, px: 1.5, textAlign: "center", color: hocColors.muted }}>
                    Board stack limit reached ({teamUnitCount}/{maxUnits})
                </Typography>
            )}
        </Box>
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
    const left = { tier1: snapshot.leftArtifactTier1 ?? 0, tier2: snapshot.leftArtifactTier2 ?? 0 };
    const right = { tier1: snapshot.rightArtifactTier1 ?? 0, tier2: snapshot.rightArtifactTier2 ?? 0 };
    const yours = userTeam === TeamVals.RIGHT ? right : left;
    const theirs = userTeam === TeamVals.RIGHT ? left : right;
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

// Observer HUD: both teams' pre-fight setup (doctrine, artifacts, augments, synergies) read
// straight off the authoritative snapshot. Participants have richer interactive panels for their
// own side; spectators get this compact two-column recap instead — values appear exactly when the
// server reveals them (opponent artifacts at fight start, synergies once the fight begins).
const observerDoctrineName = (doctrineId?: number): string => {
    if (!doctrineId) {
        return "None";
    }
    const raw = (Doctrine.Doctrine as unknown as Record<number, string>)[doctrineId] ?? `#${doctrineId}`;
    const pretty = raw.replaceAll("_", " ").toLowerCase();
    return pretty.charAt(0).toUpperCase() + pretty.slice(1);
};

const observerSynergyLabel = (key: string): string => key.replaceAll(":", " · ");

const ObserverTeamSetup: React.FC<{
    label: string;
    identityLine?: string;
    snapshot: PlaySnapshot;
    side: "lower" | "upper";
}> = ({ label, identityLine, snapshot, side }) => {
    const doctrineId = side === "lower" ? snapshot.leftDoctrine : snapshot.rightDoctrine;
    const tier1 = (side === "lower" ? snapshot.leftArtifactTier1 : snapshot.rightArtifactTier1) ?? 0;
    const tier2 = (side === "lower" ? snapshot.leftArtifactTier2 : snapshot.rightArtifactTier2) ?? 0;
    const synergies = (side === "lower" ? snapshot.leftSynergies : snapshot.rightSynergies) ?? [];
    const augments: Array<{ category: string; level: number }> = [
        {
            category: "Placement",
            level: (side === "lower" ? snapshot.leftAugmentPlacement : snapshot.rightAugmentPlacement) ?? 0,
        },
        { category: "Armor", level: (side === "lower" ? snapshot.leftAugmentArmor : snapshot.rightAugmentArmor) ?? 0 },
        { category: "Might", level: (side === "lower" ? snapshot.leftAugmentMight : snapshot.rightAugmentMight) ?? 0 },
        {
            category: "Empower",
            level: (side === "lower" ? snapshot.leftAugmentEmpower : snapshot.rightAugmentEmpower) ?? 0,
        },
        {
            category: "Sniper",
            level: (side === "lower" ? snapshot.leftAugmentSniper : snapshot.rightAugmentSniper) ?? 0,
        },
        {
            category: "Movement",
            level: (side === "lower" ? snapshot.leftAugmentMovement : snapshot.rightAugmentMovement) ?? 0,
        },
    ].filter((entry) => entry.level > 0);

    return (
        <Stack spacing={0.5} sx={{ minWidth: 130 }}>
            <Typography level="body-xs" textColor={hocColors.gold}>
                {label}
            </Typography>
            {identityLine && (
                <Typography level="body-xs" textColor={hocColors.parchment}>
                    {identityLine}
                </Typography>
            )}
            <Typography level="body-xs" textColor={hocColors.mutedStrong}>
                {`Doctrine: ${observerDoctrineName(doctrineId)}`}
            </Typography>
            {(tier1 > 0 || tier2 > 0) && <ArtifactTierIcons tier1Id={tier1} tier2Id={tier2} />}
            {augments.length > 0 && (
                <Stack direction="row" spacing={0.75} flexWrap="wrap" alignItems="center">
                    {augments.map(({ category, level }) => {
                        const imageKey = AUGMENT_SIDEBAR_IMAGES[category];
                        const src = imageKey ? images[imageKey] : undefined;
                        return (
                            <Stack key={category} direction="row" spacing={0.25} alignItems="center">
                                {src && (
                                    <Box
                                        component="img"
                                        src={src}
                                        alt={category}
                                        sx={{ width: 18, height: 18, borderRadius: "4px" }}
                                    />
                                )}
                                <Typography level="body-xs" textColor={hocColors.mutedStrong}>
                                    {`${category} ${level}`}
                                </Typography>
                            </Stack>
                        );
                    })}
                </Stack>
            )}
            {synergies.length > 0 && (
                <Typography level="body-xs" textColor={hocColors.muted}>
                    {`Synergies: ${synergies.map(observerSynergyLabel).join(", ")}`}
                </Typography>
            )}
        </Stack>
    );
};

// Spectators had no idea WHO was fighting at what rating: the play snapshot carries only player
// ids, so name + MMR come from the public ranked-profile endpoint (placed MMR only — calibrating
// players read as "Calibrating", exactly like the public ladder). AI seats without a ranked profile
// simply show no identity line.
interface IObserverIdentity {
    username: string;
    mmr: number;
    leagueName: string;
    placed: boolean;
}

const useObserverIdentities = (snapshot: PlaySnapshot): Record<string, IObserverIdentity> => {
    const [identities, setIdentities] = useState<Record<string, IObserverIdentity>>({});
    const playerIds = snapshot.players
        .map((player) => player.playerId)
        .sort()
        .join(",");
    useEffect(() => {
        let cancelled = false;
        for (const playerId of playerIds.split(",").filter(Boolean)) {
            axiosMMInstance
                .get(`${endpoints.mm.rankedProfile}/${encodeURIComponent(playerId)}`)
                .then((response) => {
                    if (cancelled || !response.data) {
                        return;
                    }
                    const data = response.data as {
                        username?: string;
                        mmr?: number;
                        leagueName?: string;
                        state?: string;
                    };
                    setIdentities((current) => ({
                        ...current,
                        [playerId]: {
                            username: data.username ?? "",
                            mmr: data.mmr ?? 0,
                            leagueName: data.leagueName ?? "",
                            placed: data.state === "placed",
                        },
                    }));
                })
                .catch(() => {});
        }
        return () => {
            cancelled = true;
        };
    }, [playerIds]);
    return identities;
};

const observerIdentityLine = (identity: IObserverIdentity | undefined): string => {
    if (!identity || !identity.username) {
        return "";
    }
    return identity.placed
        ? `${identity.username} · ${identity.mmr} MMR (${identity.leagueName})`
        : `${identity.username} · ${t("Calibrating")}`;
};

const ObserverSetupPanel: React.FC<{ snapshot: PlaySnapshot }> = ({ snapshot }) => {
    const identities = useObserverIdentities(snapshot);
    const identityFor = (team: number): IObserverIdentity | undefined => {
        const player = snapshot.players.find((candidate) => candidate.team === team);
        return player ? identities[player.playerId] : undefined;
    };
    return (
        <Stack spacing={0.5}>
            <Typography level="body-sm" textColor={hocColors.parchment}>
                Army setups
            </Typography>
            <Stack direction="row" spacing={2} flexWrap="wrap">
                <ObserverTeamSetup
                    label={teamLabel(TeamVals.LEFT)}
                    identityLine={observerIdentityLine(identityFor(TeamVals.LEFT))}
                    snapshot={snapshot}
                    side="lower"
                />
                <ObserverTeamSetup
                    label={teamLabel(TeamVals.RIGHT)}
                    identityLine={observerIdentityLine(identityFor(TeamVals.RIGHT))}
                    snapshot={snapshot}
                    side="upper"
                />
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
    const isRight = userTeam === TeamVals.RIGHT;
    const pick = (leftVal?: number, rightVal?: number): number => (isRight ? rightVal : leftVal) ?? 0;
    const rows = [
        { label: "Placement", level: pick(snapshot.leftAugmentPlacement, snapshot.rightAugmentPlacement) },
        { label: "Armor", level: pick(snapshot.leftAugmentArmor, snapshot.rightAugmentArmor) },
        { label: "Might", level: pick(snapshot.leftAugmentMight, snapshot.rightAugmentMight) },
        { label: "Empower", level: pick(snapshot.leftAugmentEmpower, snapshot.rightAugmentEmpower) },
        { label: "Sniper", level: pick(snapshot.leftAugmentSniper, snapshot.rightAugmentSniper) },
        { label: "Movement", level: pick(snapshot.leftAugmentMovement, snapshot.rightAugmentMovement) },
    ];
    // Point cost equals the augment level value (Placement LEVEL_1 == 0 == free); the server enforces
    // the same sum against the doctrine budget (getUpgradePoints / canAugment).
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
            {/* Selected synergies read as their own block under augments, at the same tile size as augments
                and artifacts. */}
            <Typography level="body-sm" textColor={hocColors.parchment} sx={{ mt: 0.75 }}>
                Synergies
            </Typography>
            {synergies.length ? (
                <SynergiesRow synergies={synergies} size={36} />
            ) : (
                <Typography level="body-xs" textColor={hocColors.muted}>
                    None yet — field two units of a faction, then choose one bonus
                </Typography>
            )}
        </Stack>
    );
};

// Fixed six level slots, in the order the draft fills them.
const ROSTER_LEVEL_SLOTS: number[] = [1, 1, 2, 2, 3, 4];

// Sidebar roster row. The own-army draft rail is laid out for the 1340px draft column and gets clipped at
// the ~340px sidebar width, so board placement renders this compact variant instead.
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
            <Box
                sx={{
                    display: "flex",
                    flexWrap: "nowrap",
                    gap: 0.375,
                    flex: "1 1 auto",
                    minWidth: 0,
                }}
            >
                {ROSTER_LEVEL_SLOTS.map((level, index) => {
                    const creatureId = creatureIds[index] ?? 0;
                    const name = creatureId
                        ? (UNIT_ID_TO_NAME[creatureId] ?? `Creature ${creatureId}`)
                        : "Not revealed";
                    return (
                        <Tooltip key={`${title}-slot-${index}`} title={`${name} · Lvl ${level}`} variant="soft">
                            <Box
                                sx={{
                                    width: 38,
                                    height: "auto",
                                    aspectRatio: "190 / 256",
                                    borderRadius: "9px",
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
                                {creatureId ? (
                                    <CreaturePortraitImage
                                        creatureId={creatureId}
                                        alt={name}
                                        sx={{ width: "100%", height: "100%" }}
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

const RankedRosterDivider: React.FC = () => (
    <Box
        aria-hidden="true"
        sx={{
            position: "relative",
            width: "100%",
            height: "9.6px",
            flex: "0 0 9.6px",
            "&::before": {
                content: '\"\"',
                position: "absolute",
                top: "50%",
                left: 0,
                right: 0,
                height: "1.6px",
                transform: "translateY(-50%)",
                background:
                    "linear-gradient(90deg, transparent, rgba(118,56,29,.72) 6%, #bd6537 50%, rgba(118,56,29,.72) 94%, transparent)",
                boxShadow: "0 2px 8px rgba(211,70,26,.2), 0 -1px 0 rgba(0,0,0,.9)",
            },
            "&::after": {
                content: '\"\"',
                position: "absolute",
                top: "50%",
                left: "50%",
                width: "6.4px",
                height: "6.4px",
                transform: "translate(-50%, -50%) rotate(45deg)",
                background: "#d06d36",
                border: "1.6px solid #1a0e09",
                boxShadow: "0 0 7px rgba(231,83,32,.46)",
            },
        }}
    />
);

// Preserve the draft header's own-army / map / opponent balance when the server opts this Setup into roster
// privacy. Its footprint matches OpponentDraftBar, but it contains no slots or unit data.
const RankedOpponentArmyPrivacyCard: React.FC = () => (
    <Box sx={{ flex: "0 0 auto", width: 496, display: "flex", justifyContent: "center" }}>
        <Sheet
            variant="soft"
            sx={{
                width: "100%",
                minHeight: 62,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 0.25,
                borderRadius: "14px",
                bgcolor: "#241416",
                border: "1px solid rgba(138,43,43,0.6)",
                color: "#f0e7e9",
            }}
        >
            <Typography level="title-sm" sx={{ color: "#ffb0b0", fontWeight: 700 }}>
                Opponent army
            </Typography>
            <Typography level="body-xs" sx={{ color: "rgba(240,231,233,0.64)" }}>
                Revealed during board placement
            </Typography>
        </Sheet>
    </Box>
);

// Both rosters during BOARD placement: your six slots, and the opponent's full army. Any slot not present in
// a legacy/sanitized snapshot renders as "?" rather than vanishing, so each army still reads as six slots.
const RankedPlacementRosters: React.FC<{ snapshot: PlaySnapshot; userTeam: TeamType }> = ({ snapshot, userTeam }) => {
    const myIds = snapshot.units.filter((unit) => unit.team === userTeam && !unit.dead).map((unit) => unit.creatureId);
    const opponentIds = snapshot.units
        .filter((unit) => unit.team !== userTeam && !unit.dead)
        .map((unit) => unit.creatureId);
    if (!myIds.length && !opponentIds.length) {
        return null;
    }

    return (
        <Stack spacing={1.1}>
            <RankedRosterRow
                title="Opponent"
                accent="#ff9d9d"
                borderColor="rgba(138,43,43,0.6)"
                bgcolor="#241416"
                creatureIds={opponentIds}
            />
            <RankedRosterDivider />
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

// The READY action occupies the same bottom-centre footer slot as EXIT FIGHT. Unlike the compact exit
// control it stretches across the complete centre column, while the green halo makes the positive lock-in
// action unmistakable against the dark sidebar material.
const rankedReadyPlacementButtonSx = {
    ...hocSidebarImageButtonSx("neutral"),
    width: "100%",
    minWidth: 0,
    height: "39.48px",
    minHeight: "39.48px",
    maxHeight: "39.48px",
    justifySelf: "center",
    py: 0,
    px: 0,
    fontSize: "clamp(.72rem, 4.65cqw, 1.08rem)",
    fontWeight: 880,
    whiteSpace: "nowrap",
    display: "flex",
    alignItems: "stretch",
    gap: 0,
    backgroundImage: `linear-gradient(rgba(24,92,39,.46),rgba(24,92,39,.46)), url(${images.ui_start_button_plate_trimmed})`,
    backgroundBlendMode: "color, normal",
    boxShadow: "inset 0 0 0 1px rgba(0,0,0,.52), 0 3px 8px rgba(0,0,0,.42)",
    filter: "brightness(.96) saturate(.94)",
    transition: "filter 140ms ease, transform 80ms ease, box-shadow 160ms ease",
    "&:hover:not(:disabled)": {
        backgroundColor: "transparent",
        color: "#d8ab80",
        filter: "brightness(1.1) contrast(1.04) drop-shadow(0 0 8px rgba(70,209,96,.58))",
        boxShadow: "0 0 0 1px rgba(70,209,96,.72), 0 0 17px rgba(70,209,96,.62), 0 0 32px rgba(70,209,96,.24)",
        transform: "translateY(-1px)",
    },
    "&:active": { transform: "translateY(1px)" },
    "&.Mui-disabled": {
        opacity: 0.68,
        color: "rgba(232,211,173,.72)",
        filter: "grayscale(.3) brightness(.82)",
        boxShadow: "inset 0 0 0 1px rgba(0,0,0,.48), 0 2px 6px rgba(0,0,0,.38)",
    },
    "@keyframes hocRankedPlacementTimerBlink": {
        "0%, 100%": { opacity: 1 },
        "50%": { opacity: 0.25 },
    },
} as const;

const RankedReadyPlacementButton: React.FC<{
    canSubmit: boolean;
    ready: boolean;
    snapshot: PlaySnapshot;
    submitProtocolAction: (action: Partial<PlayAction>) => Promise<void>;
}> = ({ canSubmit, ready, snapshot, submitProtocolAction }) => {
    const [nowMs, setNowMs] = useState(Date.now());
    useEffect(() => {
        const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, []);
    const secondsLeft =
        snapshot.placementDeadlineMs > 0 ? Math.max(0, Math.ceil((snapshot.placementDeadlineMs - nowMs) / 1000)) : -1;

    return (
        <Button
            variant="plain"
            disabled={!canSubmit || ready}
            onClick={() => void submitProtocolAction({ type: PlayActionType.READY_PLACEMENT })}
            sx={rankedReadyPlacementButtonSx}
        >
            <Box
                component="span"
                sx={{
                    flex: "1 1 auto",
                    display: "grid",
                    alignItems: "center",
                    justifyItems: "center",
                    textAlign: "center",
                    minWidth: 0,
                    overflow: "hidden",
                    fontSize: "93%",
                    transform: "translateX(2%)",
                }}
            >
                {ready ? "READY" : "READY PLACEMENT"}
            </Box>
            {secondsLeft >= 0 && (
                <Box
                    component="span"
                    sx={{
                        position: "relative",
                        width: "22%",
                        minWidth: 0,
                        flex: "0 0 22%",
                        display: "grid",
                        alignItems: "center",
                        justifyItems: "center",
                        fontVariantNumeric: "tabular-nums",
                        color: secondsLeft <= 15 ? "#ff3b2f" : "#c0b7a6",
                        textShadow: secondsLeft <= 15 ? "0 0 12px rgba(255,59,47,.75)" : "none",
                        animation: secondsLeft <= 15 ? "hocRankedPlacementTimerBlink 1s ease-in-out infinite" : "none",
                        "&::before": {
                            content: '\"\"',
                            position: "absolute",
                            left: 0,
                            top: "10%",
                            bottom: "10%",
                            width: "1px",
                            background: "rgba(121, 91, 65, .82)",
                        },
                    }}
                >
                    {`${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`}
                </Box>
            )}
        </Button>
    );
};

const RankedOverlay: React.FC<RankedOverlayProps> = ({
    busy,
    canSubmit,
    currentUnit,
    embedded = false,
    error,
    gameId,
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
    const isFullscreen = useFullscreenActive();
    const navigate = useNavigate();
    const [confirmExitOpen, setConfirmExitOpen] = useState(false);
    const [augmentInspectedCreatureId, setAugmentInspectedCreatureId] = useState(0);
    // The doctrine sets the upgrade-point budget (5/6/7 via getUpgradePoints).
    const userDoctrineId = ((userTeam === TeamVals.LEFT ? snapshot?.leftDoctrine : snapshot?.rightDoctrine) ||
        Doctrine.Doctrine.NO_DOCTRINE) as Doctrine.Doctrine;
    const augmentBudget = Doctrine.getUpgradePoints(userDoctrineId);
    // Ranked placement opens the augment step as its own screen; the player picks there, locks in, and
    // the chosen upgrades collapse to a read-only sidebar summary. null = not yet interacted -> open by
    // default at placement start.
    const [augmentOverlayOpenState, setAugmentOverlayOpen] = useState<boolean | null>(null);
    // Split placement runs Setup (augments/synergies, stage 0) then Board (positioning, stage 1). A legacy
    // combined placement reports placementSplit=false and behaves as before (augments + board share one
    // window). During the split Setup stage the picker is forced open and the board is locked; during the
    // split Board stage the picker is locked shut (augments committed) and the board opens.
    const inSetupStage = snapshot.placementSplit && snapshot.placementStage === 0;
    const inBoardStage = isRankedBoardPlacementStage(snapshot);
    // The augment step is its own screen again (owner request): forced open through the whole split Setup
    // stage, and in the legacy combined window it opens once and closes on lock-in.
    const augmentOverlayOpen = inSetupStage
        ? true
        : snapshot.placementSplit
          ? false
          : (augmentOverlayOpenState ?? true);
    // Same fit-to-window scale the pick/ban board uses, so the augment step never re-flows either.
    const draftScale = useDraftScale();
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
    // Each eligible faction needs one of its two synergy choices before setup can be locked. The Setup timer
    // still advances and autofill chooses any missing entries for a player who runs out of time.
    const [augmentReady, setAugmentReady] = useState<{ pointsRemaining: number; allSynergiesSelected: boolean }>({
        pointsRemaining: 1,
        allSynergiesSelected: false,
    });
    // The committed augment build, straight from the authoritative snapshot. Shared by the Setup step's
    // full-screen picker and the sidebar picker below so the two can never describe different builds.
    const augmentAuthoritativeSelections = useMemo(
        () => ({
            placement:
                (userTeam === TeamVals.LEFT ? snapshot.leftAugmentPlacement : snapshot.rightAugmentPlacement) ?? 0,
            armor: (userTeam === TeamVals.LEFT ? snapshot.leftAugmentArmor : snapshot.rightAugmentArmor) ?? 0,
            might: (userTeam === TeamVals.LEFT ? snapshot.leftAugmentMight : snapshot.rightAugmentMight) ?? 0,
            empower: (userTeam === TeamVals.LEFT ? snapshot.leftAugmentEmpower : snapshot.rightAugmentEmpower) ?? 0,
            sniper: (userTeam === TeamVals.LEFT ? snapshot.leftAugmentSniper : snapshot.rightAugmentSniper) ?? 0,
            movement: (userTeam === TeamVals.LEFT ? snapshot.leftAugmentMovement : snapshot.rightAugmentMovement) ?? 0,
        }),
        [
            userTeam,
            snapshot.leftAugmentPlacement,
            snapshot.rightAugmentPlacement,
            snapshot.leftAugmentArmor,
            snapshot.rightAugmentArmor,
            snapshot.leftAugmentMight,
            snapshot.rightAugmentMight,
            snapshot.leftAugmentEmpower,
            snapshot.rightAugmentEmpower,
            snapshot.leftAugmentSniper,
            snapshot.rightAugmentSniper,
            snapshot.leftAugmentMovement,
            snapshot.rightAugmentMovement,
        ],
    );
    /**
     * Augments stay adjustable in the sidebar while you position the board.
     *
     * The SERVER has always allowed this — validateAction gates AUGMENT only on team ownership, and
     * play_session says so outright: "Setup choices (augments/synergies) stay EDITABLE through the board
     * stage — a player may re-spend their points while positioning, right up until their own board-ready",
     * noting that "the client hides those controls after ready, so only the UI was holding the rule up".
     * When the augment step became its own screen the sidebar was left with a read-only recap, which took
     * that ability away for no reason on the server's side. This puts the picker back beside the board.
     *
     * Not shown while the Setup step's own full-screen picker is up (that would be two live pickers on one
     * build), and it collapses to the read-only recap once you lock in — which is exactly where the server
     * stops accepting changes.
     */
    const augmentsEditableInSidebar = shouldShowRankedAugmentPicker(snapshot, augmentOverlayOpen, isObserver, ready);
    const setupComplete = augmentReady.pointsRemaining <= 0 && augmentReady.allSynergiesSelected;
    const augmentInspectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const cancelAugmentInspectEnd = useCallback(() => {
        if (augmentInspectTimer.current) {
            clearTimeout(augmentInspectTimer.current);
            augmentInspectTimer.current = null;
        }
    }, []);
    const beginAugmentInspect = useCallback(
        (creatureId: number) => {
            cancelAugmentInspectEnd();
            setAugmentInspectedCreatureId(creatureId);
        },
        [cancelAugmentInspectEnd],
    );
    const endAugmentInspect = useCallback(() => {
        cancelAugmentInspectEnd();
        augmentInspectTimer.current = setTimeout(() => setAugmentInspectedCreatureId(0), 90);
    }, [cancelAugmentInspectEnd]);
    useEffect(() => cancelAugmentInspectEnd, [cancelAugmentInspectEnd]);
    useEffect(() => {
        if (!augmentOverlayOpen) {
            cancelAugmentInspectEnd();
            setAugmentInspectedCreatureId(0);
        }
    }, [augmentOverlayOpen, cancelAugmentInspectEnd]);

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
                    sx={exitFightButtonSx(isFullscreen)}
                >
                    EXIT FIGHT
                </Button>
                {confirmExitModal}
            </>
        );
    }

    return (
        <Sheet
            variant="plain"
            sx={{
                position: embedded ? "static" : "fixed",
                top: embedded ? undefined : 12,
                right: embedded ? undefined : 12,
                zIndex: embedded ? "auto" : 20,
                width: embedded ? "100%" : { xs: "calc(100vw - 24px)", sm: 340 },
                height: embedded ? "100%" : undefined,
                minHeight: embedded ? 0 : undefined,
                maxHeight: embedded ? "none" : "calc(100vh - 24px)",
                overflowX: embedded ? "visible" : "auto",
                overflowY: embedded ? "visible" : "auto",
                scrollbarWidth: embedded ? "none" : undefined,
                "&::-webkit-scrollbar": embedded ? { display: "none" } : undefined,
                mx: embedded ? "auto" : undefined,
                p: 1.25,
                ...(snapshot.phase === PlayPhase.PLACEMENT ? hocSidebarSectionSx("army") : hocPanelSx),
                // The base section surface is alpha .66. Ten additional percentage points of
                // transparency therefore means .56 (not .8/.9, which made it more opaque).
                ...(snapshot.phase === PlayPhase.PLACEMENT
                    ? {
                          background: "rgba(18, 12, 9, .56) !important",
                          boxShadow: "0 7px 16px rgba(0,0,0,.35)",
                      }
                    : {}),
                backdropFilter: snapshot.phase === PlayPhase.PLACEMENT ? "none" : "blur(10px)",
                fontFamily: hocDisplayFontFamily,
                containerType: "inline-size",
                // Joy components carry their own theme font, so inheriting on the Sheet alone is not
                // sufficient. Keep every textual element in this ranked command panel on HoC Forge.
                "& .MuiTypography-root, & .MuiButton-root, & .MuiInput-root, & input": {
                    fontFamily: hocDisplayFontFamily,
                    fontSynthesis: "none",
                },
            }}
        >
            <Stack spacing={1} sx={{ height: "100%", minHeight: 0, flex: "1 1 auto" }}>
                <Stack direction="row" spacing={1} alignItems="center" justifyContent="center">
                    <Typography
                        level="title-md"
                        textColor={hocColors.parchment}
                        sx={{
                            width: "100%",
                            textAlign: "center",
                            textTransform: "uppercase",
                            letterSpacing: hocDisplayLetterSpacing,
                        }}
                    >
                        {phaseLabel(snapshot.phase)}
                    </Typography>
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
                        {t(status)}
                    </Typography>
                )}

                {(isObserver || currentUnit) && (
                    <Typography level="body-sm" textColor={hocColors.mutedStrong}>
                        {isObserver ? t("Watching as observer") : ""}
                        {currentUnit ? `${t("Active")}: ${currentUnit.name} (${teamLabel(currentUnit.team)})` : ""}
                    </Typography>
                )}

                {snapshot.phase === PlayPhase.PLACEMENT && !isObserver && (
                    <Stack spacing={0.75} sx={{ flex: "1 1 0", minHeight: 0 }}>
                        {shouldShowRankedPlacementRosters(snapshot, augmentOverlayOpen) && (
                            <RankedPlacementRosters snapshot={snapshot} userTeam={userTeam} />
                        )}
                        <RankedArtifactsPanel snapshot={snapshot} userTeam={userTeam} />
                        {/* The augment/synergy picker lives HERE in the sidebar — the pre-#129 home,
                            restored by owner request: pick augments beside the board instead of inside a
                            fullscreen draft step. Interactive while augments are still editable (the split
                            Setup stage before lock-in, or the whole legacy combined window), a read-only
                            recap afterwards. The picker routes to the authoritative server via
                            RankedPlayScene.propagateAugmentation (the AUGMENT play-action); artifacts are
                            drafted in pick/ban (read-only above), so the sandbox-only artifact picker
                            stays hidden. */}
                        {/* The Setup step picks augments on its own screen, but they stay EDITABLE while you
                            position — so the sidebar carries the live picker until you lock in, then the
                            read-only recap. See augmentsEditableInSidebar for why the server allows it. */}
                        {augmentsEditableInSidebar ? (
                            // The SIDEBAR uses the compact sandbox shape: one row of augment icons with only
                            // the chosen augment's options underneath. SideToggleContainer expands every
                            // augment card at once, which is right on the full-screen Setup step but in this
                            // narrow column stacks three tall radio groups and pushes the artifacts and the
                            // rest of the panel off the bottom. Same picker underneath — both route their
                            // choice through the pixi manager — so this is layout only.
                            <SandboxToggleContainer
                                side={userTeam === TeamVals.LEFT ? "green" : "red"}
                                teamType={userTeam}
                                showArtifactPicker={false}
                                budgetPoints={augmentBudget}
                                authoritativeSelections={augmentAuthoritativeSelections}
                                onReadyChange={setAugmentReady}
                            />
                        ) : (
                            <RankedAugmentSummary snapshot={snapshot} userTeam={userTeam} budget={augmentBudget} />
                        )}
                        {/* The augment step is its own full screen, built like every draft phase before it:
                            same gradient, same 1340px column, army rails on top and the progress rail at the
                            bottom — not a dialog floating over the placement board. */}
                        <Modal
                            keepMounted
                            open={augmentOverlayOpen}
                            onClose={() => {
                                if (!inSetupStage) {
                                    setAugmentOverlayOpen(false);
                                }
                            }}
                        >
                            <ModalDialog
                                layout="fullscreen"
                                variant="plain"
                                sx={{ ...draftShellSx, height: "100%", border: "none" }}
                            >
                                <PickLanternFire slot={0} />
                                <PickLanternFire slot={1} />
                                {/* The same fixed 1340x800 board every draft phase uses, so this step is
                                    pixel-identical to the ones before it and only scales with the window. */}
                                <Box sx={draftBoardSx(draftScale)} onMouseLeave={endAugmentInspect}>
                                    {/* Show the shared placement countdown INSIDE the pop-up — the header chip is
                                    hidden behind this modal while the player picks augments/synergies. */}
                                    <Box
                                        sx={{
                                            width: "100%",
                                            height: DRAFT_HEADER_HEIGHT,
                                            minHeight: DRAFT_HEADER_HEIGHT,
                                            maxHeight: DRAFT_HEADER_HEIGHT,
                                            flex: "0 0 auto",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            overflow: "hidden",
                                        }}
                                        onMouseEnter={cancelAugmentInspectEnd}
                                        onMouseLeave={endAugmentInspect}
                                    >
                                        {augmentInspectedCreatureId ? (
                                            <CreatureDetailPanel creatureId={augmentInspectedCreatureId} />
                                        ) : (
                                            <DraftTitle>{t("Choose your augments")}</DraftTitle>
                                        )}
                                    </Box>
                                    {/* Setup always recaps the player's draft. Opponent visibility follows the
                                    snapshot's explicit policy: normal rail by default, privacy card when set. */}
                                    <Stack
                                        direction="row"
                                        spacing={1.5}
                                        sx={{
                                            width: "100%",
                                            height: DRAFT_ARMIES_HEIGHT,
                                            minHeight: DRAFT_ARMIES_HEIGHT,
                                            maxHeight: DRAFT_ARMIES_HEIGHT,
                                            flex: "0 0 auto",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            flexWrap: "nowrap",
                                        }}
                                    >
                                        <MyDraftBar
                                            doctrine={
                                                (userTeam === TeamVals.LEFT
                                                    ? snapshot.leftDoctrine
                                                    : snapshot.rightDoctrine) ?? 0
                                            }
                                            picked={snapshot.units
                                                .filter((unit) => unit.team === userTeam && !unit.dead)
                                                .map((unit) => unit.creatureId)}
                                            artifactTier1={
                                                (userTeam === TeamVals.LEFT
                                                    ? snapshot.leftArtifactTier1
                                                    : snapshot.rightArtifactTier1) ?? 0
                                            }
                                            artifactTier2={
                                                (userTeam === TeamVals.LEFT
                                                    ? snapshot.leftArtifactTier2
                                                    : snapshot.rightArtifactTier2) ?? 0
                                            }
                                            onInspect={beginAugmentInspect}
                                            onInspectEnd={endAugmentInspect}
                                            gameId={gameId}
                                        />
                                        {/* Same centred map sign the pick phases show between the armies. */}
                                        <Box sx={{ flex: "0 0 auto", display: "flex", alignItems: "center" }}>
                                            <MapBadge mapType={snapshot.gridType ?? 0} />
                                        </Box>
                                        {shouldHideRankedSetupOpponentRoster(snapshot) ? (
                                            <RankedOpponentArmyPrivacyCard />
                                        ) : (
                                            <OpponentDraftBar
                                                opponentPicked={snapshot.units
                                                    .filter(
                                                        (unit) =>
                                                            unit.team !== userTeam && !unit.dead && unit.creatureId > 0,
                                                    )
                                                    .map((unit) => unit.creatureId)}
                                                opponentLabel={t("Opponent")}
                                                watchedSlots={[0, 1, 2, 3, 4, 5]}
                                                onInspect={beginAugmentInspect}
                                                onInspectEnd={endAugmentInspect}
                                                gameId={gameId}
                                            />
                                        )}
                                    </Stack>
                                    <Box
                                        sx={{
                                            display: "flex",
                                            flexDirection: "column",
                                            alignItems: "center",
                                            gap: DRAFT_ZONE_GAP,
                                            width: "100%",
                                            flex: "1 1 0",
                                            minHeight: 0,
                                        }}
                                    >
                                        <Box
                                            sx={{
                                                position: "relative",
                                                display: "flex",
                                                justifyContent: "center",
                                                alignItems: "stretch",
                                                width: "100%",
                                                flex: "1 1 0",
                                                minHeight: 0,
                                                overflow: "visible",
                                            }}
                                        >
                                            <PhasePanel>
                                                <Box
                                                    component="fieldset"
                                                    disabled={ready}
                                                    aria-disabled={ready}
                                                    sx={{
                                                        minWidth: 0,
                                                        m: 0,
                                                        p: 0,
                                                        border: 0,
                                                        height: "100%",
                                                        pointerEvents: ready ? "none" : "auto",
                                                        opacity: ready ? 0.64 : 1,
                                                    }}
                                                >
                                                    <SideToggleContainer
                                                        side={userTeam === TeamVals.LEFT ? "green" : "red"}
                                                        teamType={userTeam}
                                                        showArtifactPicker={false}
                                                        budgetPoints={augmentBudget}
                                                        authoritativeSelections={augmentAuthoritativeSelections}
                                                        onReadyChange={setAugmentReady}
                                                    />
                                                </Box>
                                            </PhasePanel>
                                        </Box>
                                        {/* Split Setup: this is the setup-ready that advances to the board (both-ready
                                    or the setup deadline advances; the AI auto-spends for anyone not locked in).
                                    Legacy: choices commit as clicked, so this just closes the pop-up.
                                    Disabled until the build is complete (all points spent + all synergies
                                    picked) — see the setupComplete comment; the ready-locked state stays
                                    disabled regardless. */}
                                        {/* One bar carries the action, the budget and the clock: gold while points are
                                    still unspent, green once the build is complete. */}
                                        <PickCommitButton
                                            label={inSetupStage && ready ? "Waiting for opponent…" : "Lock in augments"}
                                            armed={
                                                !((!ready && !setupComplete) || (inSetupStage && (!canSubmit || ready)))
                                            }
                                            isYourTurn
                                            tone={setupComplete ? "green" : "gold"}
                                            blockedHint={
                                                augmentReady.pointsRemaining > 0
                                                    ? `You still have ${augmentReady.pointsRemaining} upgrade point${
                                                          augmentReady.pointsRemaining === 1 ? "" : "s"
                                                      } to spend — pick augments until the budget is empty.`
                                                    : undefined
                                            }
                                            seconds={augmentSecondsLeft}
                                            extra={`${augmentBudget - augmentReady.pointsRemaining} / ${augmentBudget}`}
                                            onCommit={() => {
                                                if (inSetupStage) {
                                                    void submitProtocolAction({
                                                        type: rankedPlacementLockActionType(snapshot),
                                                    });
                                                } else {
                                                    setAugmentOverlayOpen(false);
                                                }
                                            }}
                                        />
                                    </Box>
                                </Box>
                                <DraftBottomControls step={7} userTeam={userTeam} draftScale={draftScale} />
                            </ModalDialog>
                        </Modal>
                        {/* Split Setup: lock-in advances the stage once every point is spent (both-ready or
                            the deadline advances; the AI auto-spends for anyone not locked in). The header
                            chip carries the countdown — no modal hides it anymore. */}

                        {/* The board-stage Ready (start the fight) + per-stack split/unplace controls are hidden
                            during the split Setup stage, when the board is locked. */}
                        {inBoardStage && selectedUnit?.placed && selectedUnit.team === userTeam && (
                            <RankedPlacementStackActions
                                canSubmit={canSubmit}
                                selectedUnit={selectedUnit}
                                snapshot={snapshot}
                                submitGameAction={submitGameAction}
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
                {isObserver && <ObserverSetupPanel snapshot={snapshot} />}

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
