import {
    createPickSimState,
    CreatureByLevel,
    getCurrentPickPhase,
    getOmniscientCreatureChoices,
    getPickTeamView,
    GridVals,
    isPickSimComplete,
    Doctrine,
    PickPhaseVals,
    TeamVals,
    TeamType,
    transitionPickSim,
    type IPickSimState,
    type PickAction,
    type PickRandomInt,
} from "@heroesofcrypto/common";
import { PICK_EVENT_SOURCE } from "./env";
import { installFootprintOverridesFromSearch } from "./footprintOverridesFromUrl";

import CssBaseline from "@mui/joy/CssBaseline";
import { CssVarsProvider } from "@mui/joy/styles";
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter as Router, Route, Routes, useNavigate, useParams } from "react-router";
import { TextStyle } from "pixi.js";

import { usePixiManager } from "../pixi/PixiGameManager";
import { HOC_GAME_FONT_FAMILY } from "../fontFamilies";
import { images } from "../generated/image_imports";
import { WalletProvider } from "../wallet/WalletProvider";
import LeftSideBar from "./LeftSideBar";
import { Main } from "./Main";
import RightSideBar from "./RightSideBar";
import "./style.scss";
import Popover from "./Popover";
import { UpNextOverlay } from "./UpNextOverlay";
import { FightFinishedOverlay } from "./FightFinishedOverlay";
import { AiControlBadge, aiBadgeLeft } from "./AiControlBadge";
import { NextLapHazardBadge } from "./NextLapHazardBadge";
import { ExitReplayBadge } from "./ExitReplayBadge";
import { PlayRankedBadge } from "./PlayRankedBadge";
import { LoadingFullscreenToggle } from "./LoadingFullscreenToggle";
import { useGameCursor } from "./cursor/useGameCursor";
import { IWindowSize } from "../scenes/VisibleState";
import StainedGlassWindow from "./PickAndBan";
import { AugmentStepPreview } from "./AugmentStepPreview";
import { PlacementStepPreview } from "./PlacementStepPreview";
import { SIDE_FIRE_DEFINITIONS } from "../scenes/sandbox/ambientFireTuning";
import { LocalModelDraftOpponent } from "./PickAndBan/LocalModelDraftOpponent";
import AutoPickToast from "./PickAndBan/AutoPickToast";
import { buildApiUrl, endpoints, HOST_GAME_API } from "../api/axios";
import { AuthProvider } from "./auth/context/auth_provider";
import { AuthContext, useAuthContext } from "./auth/context/auth_context";
import { LobbiesBrowse } from "./LobbiesBrowse";
import { LobbyView } from "./LobbyView";
import { LoginScreen } from "./LoginScreen/LoginScreen";
import { startBackgroundAssetPrefetch } from "./assetPrefetch";
import { MatchmakingRoute } from "./MatchmakingRoute";
import { ThemeMusic } from "./audio/ThemeMusic";
import { CurrentLobbyProvider } from "./social/CurrentLobbyContext";
import { SocialDock } from "./social/SocialDock";
import { SocialProvider } from "./social/SocialProvider";
import { setPrefightMusicActive } from "./audio/prefightMusic";
import type { SceneGameActionTransport } from "../game_action_transport";
import { fetchPickObserveSnapshot, fetchRankedPlaySnapshot } from "../api/ranked_play_client";
import ObserverPickView from "./PickAndBan/ObserverPickView";
import { PlayerPortalPage } from "./PlayerPortal/PlayerPortalPage";
import { isMockPortalEnabled } from "./PlayerPortal/mockPortal";
import { RankedGameView } from "./RankedGameView";
import { getMarkedVsAiDifficulty, isMarkedVsAiGame, vsAiDifficultyLabel } from "../utils/aiOpponent";

const LoadingScreenFireEditor = React.lazy(() => import("./LoadingScreenFireEditor"));
// Every dev editor is lazy so the production entry chunk never carries them: their routes below are
// mounted only under import.meta.env.DEV, and a literal DEV guard + dynamic import lets Rollup drop
// the whole subtree from a production build instead of shipping guarded-but-present code.
const PortraitFramingEditor = React.lazy(() =>
    import("./PortraitFramingEditor").then((m) => ({ default: m.PortraitFramingEditor })),
);
const LeftSidebarPortraitEditor = React.lazy(() =>
    import("./LeftSidebarPortraitEditor").then((m) => ({ default: m.LeftSidebarPortraitEditor })),
);
const BattlefieldCreatureFramingEditor = React.lazy(() =>
    import("./BattlefieldCreatureFramingEditor").then((m) => ({ default: m.BattlefieldCreatureFramingEditor })),
);
const BattlefieldShadowEditor = React.lazy(() =>
    import("./BattlefieldShadowEditor").then((m) => ({ default: m.BattlefieldShadowEditor })),
);
const AmbientFireTuningEditor = React.lazy(() =>
    import("./AmbientFireTuningEditor").then((m) => ({ default: m.AmbientFireTuningEditor })),
);
const LavaAnimationTuningEditor = React.lazy(() =>
    import("./LavaAnimationTuningEditor").then((m) => ({ default: m.LavaAnimationTuningEditor })),
);

const isEditableTarget = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) {
        return false;
    }

    return Boolean(target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])"));
};

const readE2ePlayerId = (): string | null => {
    if (import.meta.env.PROD || import.meta.env.VITE_IS_PROD === "true") {
        return null;
    }
    return new URL(window.location.href).searchParams.get("e2ePlayerId");
};

const usePreventSelection = () => {
    useEffect(() => {
        // Prevent text selection via CSS
        document.body.style.userSelect = "none";

        // Prevent default mouse behaviors
        const preventMouseSelection = (e: MouseEvent) => {
            // Allow only left click (button === 0)
            if (e.button !== 0) {
                e.preventDefault();
            }
        };

        // Prevent selection on touch devices
        const preventTouchSelection = (e: TouchEvent) => {
            if (e.touches.length > 1) {
                e.preventDefault();
            }
        };

        // Prevent context menu
        const preventContextMenu = (e: Event) => {
            if (isEditableTarget(e.target)) {
                return;
            }
            e.preventDefault();
        };

        // Prevent clipboard operations
        const preventClipboard = (e: ClipboardEvent) => {
            if (isEditableTarget(e.target)) {
                return;
            }
            e.preventDefault();
        };

        // Add event listeners
        document.addEventListener("mousedown", preventMouseSelection);
        document.addEventListener("touchstart", preventTouchSelection, { passive: false });
        document.addEventListener("contextmenu", preventContextMenu);
        document.addEventListener("copy", preventClipboard);
        document.addEventListener("cut", preventClipboard);
        document.addEventListener("paste", preventClipboard);

        // Prevent drag operations
        document.addEventListener("dragstart", preventContextMenu);
        document.addEventListener("drop", preventContextMenu);

        // Cleanup function
        return () => {
            document.body.style.userSelect = "";

            document.removeEventListener("mousedown", preventMouseSelection);
            document.removeEventListener("touchstart", preventTouchSelection);
            document.removeEventListener("contextmenu", preventContextMenu);
            document.removeEventListener("copy", preventClipboard);
            document.removeEventListener("cut", preventClipboard);
            document.removeEventListener("paste", preventClipboard);
            document.removeEventListener("dragstart", preventContextMenu);
            document.removeEventListener("drop", preventContextMenu);
        };
    }, []);
};

import { ButtonProvider } from "./context/ButtonContext";

const Heroes: React.FC<{ windowSize: IWindowSize; gameActionTransport?: SceneGameActionTransport }> = ({
    windowSize,
    gameActionTransport,
}) => {
    const manager = usePixiManager();
    const navigate = useNavigate();
    const [started, setStarted] = useState(false);
    const [isLoading, setIsLoading] = useState(manager.isLoading);
    const [aiToggleOn, setAiToggleOn] = useState(false);
    const [replayPlaybackActive, setReplayPlaybackActive] = useState(false);

    // OWNER CALL: a logged-in player keeps the full four-button dock in the BOTTOM-RIGHT corner here —
    // bets, friends, notifications and sound — exactly as on every non-battle screen. The sandbox used to
    // publish setBattleSystemControlsActive(true), which collapses SocialDock into the compact top-right
    // medallion and hides those four behind a fan. Ranked still collapses it (RankedGameView), where board
    // space is genuinely contested; the offline sandbox has room and should not make the player open a menu
    // to reach controls that sit in the corner everywhere else.

    const closeSandbox = useCallback(() => {
        if (window.history.length > 1) {
            navigate(-1);
            return;
        }
        navigate("/play", { replace: true });
    }, [navigate]);

    // Themed in-game cursor (applied globally via document.body.style.cursor). Mounted at the app
    // root so the cursor covers the whole screen, not just the battle canvas.
    useGameCursor();

    useEffect(() => {
        manager.SetGameActionTransport(gameActionTransport);
        return () => {
            manager.SetGameActionTransport(undefined);
        };
    }, [gameActionTransport, manager]);

    useEffect(() => {
        const connection = manager.onVisibleStateUpdated.connect((state) => {
            setAiToggleOn(!!state.aiToggleOn);
            setReplayPlaybackActive(!!state.replayPlaybackActive);
        });
        return () => {
            connection.disconnect();
        };
    }, [manager]);

    useEffect(() => {
        const connection = manager.onHasStarted.connect((hasStarted) => {
            setStarted(hasStarted);
            if (hasStarted) {
                manager.HomeCamera();
            }
        });
        const loadingConnection = manager.onLoadingChanged.connect(setIsLoading);

        return () => {
            // Important: ensure cleanup returns void
            connection.disconnect();
            loadingConnection.disconnect();
        };
    }, [manager]);

    return (
        <ButtonProvider>
            <div className="container" style={{ display: "flex" }}>
                <CssVarsProvider>
                    <CssBaseline />
                    {isLoading && <LoadingFullscreenToggle />}
                    {!isLoading && <LeftSideBar gameStarted={started} windowSize={windowSize} />}
                    {!isLoading && (
                        <RightSideBar
                            gameStarted={started}
                            windowSize={windowSize}
                            rankedFooter={!started && !replayPlaybackActive ? <PlayRankedBadge /> : undefined}
                            onClose={!started && !replayPlaybackActive ? closeSandbox : undefined}
                        />
                    )}
                    <UpNextOverlay />
                    <FightFinishedOverlay />
                    {!isLoading && started && aiToggleOn && <AiControlBadge left={aiBadgeLeft(windowSize)} />}
                    {!isLoading && started && <NextLapHazardBadge />}
                    {!isLoading && replayPlaybackActive && (
                        // Sandbox: leaving the replay drops back to the regular (fresh) sandbox screen.
                        <ExitReplayBadge left={aiBadgeLeft(windowSize)} onExit={() => window.location.reload()} />
                    )}
                </CssVarsProvider>
                <Main />
                <Popover />
            </div>
        </ButtonProvider>
    );
};

export type { IPickPhaseEventData } from "./context/PickBanContext";
import { PickBanEventProvider, usePickBanEvents } from "./context/PickBanContext";
import { PickBanContext, PickBanContextType } from "./context/PickBanContextDefs";
export { PickBanEventProvider, usePickBanEvents };

const BUNDLE_PREVIEW_STATE: PickBanContextType = {
    isConnected: true,
    events: [],
    error: null,
    banned: [],
    picked: [],
    opponentPicked: [],
    watchedSlots: [],
    isYourTurn: true,
    isAbandoned: false,
    phaseIdentity: "bundle-preview",
    pickPhase: PickPhaseVals.INITIAL_PICK,
    secondsRemaining: 300,
    revealsRemaining: 0,
    initialBundles: [
        [12, 24, 1], // Berserker + Elf + Veteran Helm
        [31, 16, 11], // Peasant + Hyena + Helm of Focus
    ],
    tier2Offers: [],
    doctrine: 0,
    upgradePoints: 0,
    artifactTier1: 0,
    artifactTier2: 0,
    requiredLevel: 0,
    mapType: 0,
    autoPickedSignal: 0,
};

const BUNDLE_PREVIEW_MAP_TYPES: Record<string, number> = {
    normal: GridVals.NORMAL,
    barrels: GridVals.BLOCK_CENTER,
    lava: GridVals.LAVA_CENTER,
};

/** Stable, backend-free canvas for iterating on the bundle-pick presentation. */
const BundlePickPreview: React.FC = () => {
    const requestedMap = new URLSearchParams(window.location.search).get("map")?.toLowerCase() ?? "";
    const previewState = {
        ...BUNDLE_PREVIEW_STATE,
        mapType: BUNDLE_PREVIEW_MAP_TYPES[requestedMap] ?? BUNDLE_PREVIEW_STATE.mapType,
    };
    return (
        <PickBanContext.Provider value={previewState}>
            <div className="container" style={{ display: "flex" }}>
                <CssVarsProvider>
                    <CssBaseline />
                </CssVarsProvider>
                <StainedGlassWindow
                    userTeam={TeamVals.LEFT as TeamType}
                    gameId="bundle-pick-preview"
                    opponentLabel="Opponent"
                    showOpponentRosterDuringAugmentHandoff={false}
                />
            </div>
        </PickBanContext.Provider>
    );
};

const LEVEL_ONE_PICK_PREVIEW_STATE: PickBanContextType = {
    ...BUNDLE_PREVIEW_STATE,
    picked: [12, 24],
    initialBundles: [],
    artifactTier1: 1,
    pickPhase: PickPhaseVals.PICK,
    requiredLevel: 1,
};

/** Stable, backend-free canvas for the first creature-pick step. */
const LevelOnePickPreview: React.FC = () => (
    <PickBanContext.Provider value={LEVEL_ONE_PICK_PREVIEW_STATE}>
        <div className="container" style={{ display: "flex" }}>
            <CssVarsProvider>
                <CssBaseline />
            </CssVarsProvider>
            <StainedGlassWindow
                userTeam={TeamVals.LEFT as TeamType}
                gameId="level-one-pick-preview"
                opponentLabel="Opponent"
                showOpponentRosterDuringAugmentHandoff={false}
            />
        </div>
    </PickBanContext.Provider>
);

/**
 * BACKEND-FREE PLAYABLE DRAFT.
 *
 * The other two /preview/picks routes are frozen fixtures — one pose each, nothing to click. This one is
 * the real thing minus the network: the same StainedGlassWindow the ranked game renders, but its state
 * comes from common's pick_sim state machine instead of the server's SSE stream, and its four submit
 * calls (doctrine / bundle / creature / tier-2 artifact) drive that machine instead of POSTing.
 *
 * So the whole ladder is clickable — doctrine, starting bundle, the four creature picks, the tier-2
 * artifact — and it ends exactly where the ranked flow ends, on the AUGMENTS handoff to placement.
 * Placement itself is a real game session and is NOT part of this route.
 *
 * The opponent is a random-legal chooser, not the drafting model: this route exists to click through the
 * UI, not to evaluate draft quality. For that, use the e2e stack with a real bot seat.
 */
const localDraftRng: PickRandomInt = (maxExclusive) => Math.floor(Math.random() * maxExclusive);
const LOCAL_DRAFT_TEAM = TeamVals.LEFT;
const LOCAL_DRAFT_OPPONENT = TeamVals.RIGHT;
// The six draft slots, level-ordered, exactly as the opponent rail lays them out.
const LOCAL_DRAFT_SLOT_LEVELS = [1, 1, 2, 2, 3, 4] as const;

const creatureLevelOf = (creatureId: number): number => {
    for (let level = 1; level <= 4; level += 1) {
        if ((CreatureByLevel[level - 1] ?? []).includes(creatureId)) {
            return level;
        }
    }
    return 0;
};

/** One legal action for the opponent in whatever phase the sim is on, or null if it is not their move. */
const localDraftOpponentAction = (state: IPickSimState): PickAction | null => {
    const phase = getCurrentPickPhase(state);
    if (!phase.actors.includes(LOCAL_DRAFT_OPPONENT)) {
        return null;
    }
    switch (phase.phase) {
        case PickPhaseVals.DOCTRINE:
            return { type: "select_doctrine", team: LOCAL_DRAFT_OPPONENT, doctrine: Doctrine.Doctrine.SEE_NONE };
        case PickPhaseVals.INITIAL_PICK:
            return { type: "select_bundle", team: LOCAL_DRAFT_OPPONENT, bundleIndex: localDraftRng(2) };
        case PickPhaseVals.ARTIFACT_2: {
            const offers = getPickTeamView(state, LOCAL_DRAFT_OPPONENT).tier2Offers;
            return offers.length
                ? {
                      type: "select_tier2",
                      team: LOCAL_DRAFT_OPPONENT,
                      artifactId: offers[localDraftRng(offers.length)],
                  }
                : null;
        }
        case PickPhaseVals.PICK: {
            const choices = getOmniscientCreatureChoices(state, LOCAL_DRAFT_OPPONENT);
            return choices.length
                ? {
                      type: "pick_creature",
                      team: LOCAL_DRAFT_OPPONENT,
                      creatureId: choices[localDraftRng(choices.length)],
                  }
                : null;
        }
        default:
            return null;
    }
};

/**
 * Run the opponent until the ball is back in the player's court. A rejected action is the loop's exit
 * condition, not an error: in the simultaneous phases (doctrine, bundle, tier-2) the opponent has already
 * moved and is simply waiting on the human, which the sim reports as a rejection.
 */
const runLocalDraftOpponent = (start: IPickSimState): IPickSimState => {
    let state = start;
    for (let guard = 0; guard < 64; guard += 1) {
        if (isPickSimComplete(state)) {
            return state;
        }
        const action = localDraftOpponentAction(state);
        if (!action) {
            return state;
        }
        const transition = transitionPickSim(state, action, localDraftRng);
        if (transition.status === "rejected") {
            return state;
        }
        state = transition.state;
    }
    return state;
};

const LocalPlayableDraft: React.FC = () => {
    const [state, setState] = useState<IPickSimState>(() => runLocalDraftOpponent(createPickSimState(localDraftRng)));

    // The opponent must take a beat. Not for flavour: PickCommitButton only clears its own "submitted"
    // lock when isYourTurn CHANGES, and resolving the player's move and the opponent's inside one state
    // update leaves isYourTurn true throughout — so the button never unlocks and every step after the
    // bundle reads "waiting opponent" forever. The live game gets this flip for free from the server
    // round-trip; here it has to be real state.
    const [resolving, setResolving] = useState(false);

    const apply = useCallback((action: PickAction) => {
        setState((current) => {
            const transition = transitionPickSim(current, action, localDraftRng);
            // A collision still advances the sim (the creature was taken); a rejection leaves it be.
            const settled = transition.status === "rejected" ? current : transition.state;
            // Dev-only window hook: this route has no server and no devtools story of its own, so the
            // last action, its verdict and the resulting phase are parked where they can be read.
            (window as unknown as Record<string, unknown>).__hocDraft = {
                action,
                status: transition.status,
                reason: (transition as { reason?: string }).reason,
                phaseBefore: current.phaseSequence,
                phaseAfter: settled.phaseSequence,
                lowerCreatures: settled.left.creatures,
                upperCreatures: settled.right.creatures,
                state: settled,
            };
            return settled;
        });
        setResolving(true);
    }, []);

    useEffect(() => {
        if (!resolving) {
            return undefined;
        }
        const timer = setTimeout(() => {
            setState((current) => runLocalDraftOpponent(current));
            setResolving(false);
        }, 420);
        return () => clearTimeout(timer);
    }, [resolving]);

    const view = useMemo(() => getPickTeamView(state, LOCAL_DRAFT_TEAM), [state]);

    // Has the player already moved in this phase? Only meaningful for the three simultaneous phases —
    // the creature picks belong to one side at a time, so being an actor there IS your turn.
    const alreadyActed =
        (view.phase === PickPhaseVals.DOCTRINE && state.left.doctrine !== Doctrine.Doctrine.NO_DOCTRINE) ||
        (view.phase === PickPhaseVals.INITIAL_PICK && state.left.selectedBundleIndex !== undefined) ||
        (view.phase === PickPhaseVals.ARTIFACT_2 && state.left.tier2Artifact !== undefined);

    // The opponent rail wants a SLOT-ALIGNED array, not a flat list: each known creature has to land in the
    // level-ordered slot it actually occupies, or a revealed level-2 shows up under a level-1 heading.
    const opponentPicked = useMemo(() => {
        const slots = LOCAL_DRAFT_SLOT_LEVELS.map(() => 0);
        for (const creatureId of view.knownOpponentCreatures) {
            const level = creatureLevelOf(creatureId);
            const slot = LOCAL_DRAFT_SLOT_LEVELS.findIndex((l, i) => l === level && slots[i] === 0);
            if (slot >= 0) {
                slots[slot] = creatureId;
            }
        }
        return slots;
    }, [view.knownOpponentCreatures]);

    const watchedSlots = useMemo(() => {
        const mode = Doctrine.DOCTRINES[state.left.doctrine]?.revealMode;
        if (mode === "all") {
            return LOCAL_DRAFT_SLOT_LEVELS.map((_, i) => i);
        }
        if (mode === "random3") {
            return [0, 2, 4];
        }
        return [];
    }, [state.left.doctrine]);

    const pickBanValue: PickBanContextType = useMemo(
        () => ({
            isConnected: true,
            events: [],
            error: null,
            banned: view.creaturesBanned,
            picked: view.creaturesPicked,
            opponentPicked,
            watchedSlots,
            isYourTurn: !resolving && view.actors.includes(LOCAL_DRAFT_TEAM) && !alreadyActed && !view.complete,
            isAbandoned: false,
            phaseIdentity: `local-model:${view.phase}`,
            pickPhase: view.phase,
            secondsRemaining: 300,
            revealsRemaining: 0,
            initialBundles: view.bundles.map((bundle) => [...bundle] as [number, number, number]),
            tier2Offers: view.tier2Offers,
            doctrine: state.left.doctrine,
            upgradePoints: Doctrine.DOCTRINES[state.left.doctrine]?.upgradePoints ?? 0,
            artifactTier1: view.artifacts.find(([tier]) => tier === 1)?.[1] ?? 0,
            artifactTier2: view.artifacts.find(([tier]) => tier === 2)?.[1] ?? 0,
            requiredLevel: view.requiredCreatureLevel,
            mapType: GridVals.NORMAL,
            autoPickedSignal: 0,
        }),
        [view, opponentPicked, watchedSlots, alreadyActed, resolving, state.left.doctrine],
    );

    // Only the four submit calls are replaced; StainedGlassWindow reads nothing else off the auth context.
    const authValue = useMemo(
        () =>
            ({
                doctrine: async (doctrineId: number) =>
                    apply({ type: "select_doctrine", team: LOCAL_DRAFT_TEAM, doctrine: doctrineId }),
                pickPair: async (pairIndex: number) =>
                    apply({ type: "select_bundle", team: LOCAL_DRAFT_TEAM, bundleIndex: pairIndex }),
                pick: async (creatureId: number) =>
                    apply({ type: "pick_creature", team: LOCAL_DRAFT_TEAM, creatureId }),
                artifact: async (artifactId: number) =>
                    apply({ type: "select_tier2", team: LOCAL_DRAFT_TEAM, artifactId }),
            }) as unknown as ReturnType<typeof useAuthContext>,
        [apply],
    );

    return (
        <AuthContext.Provider value={authValue}>
            <PickBanContext.Provider value={pickBanValue}>
                <div className="container" style={{ display: "flex" }}>
                    <CssVarsProvider>
                        <CssBaseline />
                    </CssVarsProvider>
                    <StainedGlassWindow
                        userTeam={LOCAL_DRAFT_TEAM as TeamType}
                        gameId="local-playable-draft"
                        opponentLabel="Local opponent"
                        showOpponentRosterDuringAugmentHandoff={false}
                    />
                    {/* The draft's last phase is a HANDOFF: StainedGlassWindow shows a spinner and waits for
                        the server to move the game from PICK to PLAY. There is no server and no game here,
                        so that spinner would turn forever and read as a freeze. Say the draft is done, show
                        what it produced, and offer another one. */}
                    {view.complete && (
                        <div
                            style={{
                                position: "fixed",
                                inset: 0,
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 14,
                                background: "rgba(4,6,8,0.86)",
                                color: "#efe4cc",
                                fontFamily: '"Open Sans", Verdana, sans-serif',
                                textAlign: "center",
                                zIndex: 40,
                            }}
                        >
                            <div style={{ fontSize: 26, letterSpacing: "0.06em" }}>ДРАФТ ЗАВЕРШЁН</div>
                            <div style={{ maxWidth: 560, lineHeight: 1.5, color: "rgba(239,228,204,0.72)" }}>
                                Дальше идёт расстановка — это уже игровая сессия, и локальному роуту её передать некому.
                                В ранкеде здесь сервер переводит партию из PICK в PLAY.
                            </div>
                            <div style={{ color: "rgba(239,228,204,0.9)" }}>
                                Ваша армия: {view.creaturesPicked.join(", ") || "—"}
                            </div>
                            <div style={{ color: "rgba(239,228,204,0.9)" }}>
                                Артефакты: {view.artifacts.map(([tier, id]) => `T${tier}:${id}`).join(", ") || "—"}
                                {" · "}
                                очки прокачки: {Doctrine.DOCTRINES[state.left.doctrine]?.upgradePoints ?? 0}
                            </div>
                            <button
                                type="button"
                                onClick={() => setState(runLocalDraftOpponent(createPickSimState(localDraftRng)))}
                                style={{
                                    marginTop: 8,
                                    padding: "10px 22px",
                                    fontSize: 15,
                                    letterSpacing: "0.09em",
                                    color: "#efe4cc",
                                    background: "#7a4405",
                                    border: "1px solid #dcb158",
                                    borderRadius: 3,
                                    cursor: "pointer",
                                }}
                            >
                                ЕЩЁ ОДИН ДРАФТ
                            </button>
                        </div>
                    )}
                </div>
            </PickBanContext.Provider>
        </AuthContext.Provider>
    );
};

// Bridges the live pick-phase SSE stream (only reachable from inside PickBanEventProvider) up to
// GameRoute, which has no context of its own. GameRoute uses this to gate its play-snapshot polling
// fallback on phase — see the "nearingPlay" note on that effect.
const PickPhaseReporter: React.FC<{ onPhaseChange?: (phase: number) => void }> = ({ onPhaseChange }) => {
    const { pickPhase } = usePickBanEvents();
    useEffect(() => {
        onPhaseChange?.(pickPhase);
    }, [pickPhase, onPhaseChange]);
    return null;
};

const appendEncodedPath = (baseUrl: string, value: string): string =>
    `${baseUrl.replace(/\/+$/, "")}/${encodeURIComponent(value)}`;

const pickEventUrl = (gameId: string): string => {
    if (PICK_EVENT_SOURCE) {
        return appendEncodedPath(PICK_EVENT_SOURCE, gameId);
    }
    return appendEncodedPath(buildApiUrl(HOST_GAME_API, endpoints.game.pickEvents), gameId);
};

const PickAndBanView: React.FC<{
    windowSize: IWindowSize;
    userTeam: TeamType;
    gameId: string;
    onPickPhaseChange?: (phase: number) => void;
}> = ({ windowSize, userTeam, gameId, onPickPhaseChange }) => {
    const manager = usePixiManager();
    const [started, setStarted] = useState(false);
    const [isLoading, setIsLoading] = useState(manager.isLoading);
    const pickEventsUrl = useMemo(() => pickEventUrl(gameId), [gameId]);

    useEffect(() => {
        const connection = manager.onHasStarted.connect((hasStarted) => {
            setStarted(hasStarted);
            if (hasStarted) {
                manager.HomeCamera();
            }
        });
        const loadingConnection = manager.onLoadingChanged.connect(setIsLoading);

        return () => {
            connection.disconnect();
            loadingConnection.disconnect();
        };
    }, [manager]);

    return (
        <PickBanEventProvider url={pickEventsUrl} userTeam={userTeam}>
            <PickPhaseReporter onPhaseChange={onPickPhaseChange} />
            <div
                className="container"
                style={{
                    display: "flex",
                    backgroundColor: "rgba(0, 0, 128, 0.05)",
                    // boxShadow: "0 0 150px 500px rgba(0, 0, 0, 0.5) inset",
                }}
            >
                <CssVarsProvider>
                    <CssBaseline />
                    {!isLoading && <LeftSideBar gameStarted={started} windowSize={windowSize} />}
                    {!isLoading && <RightSideBar gameStarted={started} windowSize={windowSize} />}
                </CssVarsProvider>
                <StainedGlassWindow
                    userTeam={userTeam}
                    gameId={gameId}
                    showOpponentRosterDuringAugmentHandoff={false}
                    opponentLabel={
                        isMarkedVsAiGame(gameId)
                            ? (() => {
                                  // Show the tier when this browser created the match ("AI — Hard (v0.7)");
                                  // a legacy/foreign marker degrades to the bare "AI".
                                  const difficulty = getMarkedVsAiDifficulty(gameId);
                                  return difficulty ? vsAiDifficultyLabel(difficulty) : "AI";
                              })()
                            : "Opponent"
                    }
                />
                <LocalModelDraftOpponent eventUrl={pickEventsUrl} userTeam={userTeam} />
                <AutoPickToast />
                <Popover />
            </div>
        </PickBanEventProvider>
    );
};

const MatchLoadingOverlay: React.FC = () => (
    <div
        style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "#0f1117",
            color: "#f8fafc",
            display: "grid",
            placeItems: "center",
            zIndex: 1000,
            padding: 24,
        }}
    >
        <style>
            {`
                @keyframes hoc-route-progress {
                    0% { transform: translateX(-80%); }
                    50% { transform: translateX(20%); }
                    100% { transform: translateX(140%); }
                }
            `}
        </style>
        <div style={{ width: "min(440px, 100%)" }}>
            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Opening match</div>
            <div style={{ color: "#aeb7c5", fontSize: 14, lineHeight: 1.4, marginBottom: 18 }}>
                Syncing your seat and loading the latest match state.
            </div>
            <div
                style={{
                    height: 8,
                    overflow: "hidden",
                    borderRadius: 999,
                    backgroundColor: "rgba(148, 163, 184, 0.24)",
                }}
            >
                <div
                    style={{
                        width: "55%",
                        height: "100%",
                        borderRadius: 999,
                        background: "linear-gradient(90deg, #f97316, #22c55e)",
                        animation: "hoc-route-progress 1.25s ease-in-out infinite",
                    }}
                />
            </div>
        </div>
    </div>
);

const GameRoute: React.FC<{ windowSize: IWindowSize }> = ({ windowSize }) => {
    const { gameId } = useParams<{ gameId: string }>();
    const { authenticated, getCurrentGame } = useAuthContext();
    const [showOverlay, setShowOverlay] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [userTeam, setUserTeam] = useState<TeamType>(TeamVals.NO_TEAM as TeamType);
    const [routeMode, setRouteMode] = useState<"checking" | "pick" | "play">("checking");
    // True when this viewer is a SPECTATOR (not a participant): during the draft it swaps the
    // interactive pick screen for the read-only observer view; the play route already handles
    // observers via userTeam === NO_TEAM.
    const [observerMode, setObserverMode] = useState(false);

    // "Iron and Silk" covers everything between the match being found and the first turn: the match check,
    // picks and augments here, then placement inside RankedGameView, which takes over the flag once the
    // board is up (it is the only screen that sees the phase). Cleared on unmount so leaving mid-draft — a
    // decline, a reload, a navigation away — never leaves the pre-fight track playing over the menus.
    useEffect(() => {
        setPrefightMusicActive(!!gameId && !showOverlay && routeMode !== "play");
    }, [gameId, showOverlay, routeMode]);
    useEffect(() => () => setPrefightMusicActive(false), []);

    // Drafting is the one stretch of this route where the player is thinking and the network is idle, so
    // pull the board's art down now. Without it nothing downloads until RankedGameView boots Pixi, which
    // BLOCKS on the core tier behind a loading screen — landing a load between the draft and choosing
    // augments. Warming the HTTP cache here means that blocking step resolves from cache instead.
    // Best-effort and abortable: leaving the draft stops it mid-flight.
    useEffect(() => {
        if (!gameId || routeMode !== "pick") {
            return undefined;
        }
        return startBackgroundAssetPrefetch();
    }, [gameId, routeMode]);
    // Set once the live pick-phase SSE (already open inside PickAndBanView) reports one of the two
    // phases that hand the completed draft off to placement/play (see LIVE_PICK_PHASES in
    // common/picks/pick_sim.ts — AUGMENTS/AUGMENTS_SCOUT are last, PICK/BAN/ARTIFACT_* come first).
    // Gates the play-snapshot poll below so it isn't hit every 2.5s for the many minutes a match
    // spends in the early pick/ban/artifact phases (that route 400s until a play session exists).
    const [pickNearingPlay, setPickNearingPlay] = useState(false);
    const handlePickPhaseChange = useCallback((phase: number) => {
        if (phase === PickPhaseVals.AUGMENTS || phase === PickPhaseVals.AUGMENTS_SCOUT) {
            setPickNearingPlay(true);
        }
    }, []);

    useEffect(() => {
        setPickNearingPlay(false);
        setObserverMode(false);
    }, [gameId]);

    useEffect(() => {
        const openObserverMode = async (): Promise<boolean> => {
            if (!gameId) {
                return false;
            }

            try {
                const snapshot = await fetchRankedPlaySnapshot(gameId);
                if (!snapshot) {
                    // Still drafting — spectate the draft itself via the public, spoiler-safe
                    // pick-observe snapshot instead of dead-ending on "not available yet".
                    try {
                        const draft = await fetchPickObserveSnapshot(gameId);
                        if (draft?.stage === "pick") {
                            setObserverMode(true);
                            setUserTeam(TeamVals.NO_TEAM as TeamType);
                            setRouteMode("pick");
                            setShowOverlay(false);
                            setErrorMessage("");
                            return true;
                        }
                    } catch (draftErr) {
                        console.error(draftErr);
                    }
                    return false;
                }
                const e2ePlayerId = readE2ePlayerId();
                const e2ePlayer = e2ePlayerId
                    ? snapshot.players.find((player) => player.playerId === e2ePlayerId)
                    : undefined;

                setUserTeam((e2ePlayer?.team as TeamType | undefined) ?? (TeamVals.NO_TEAM as TeamType));
                setRouteMode("play");
                setShowOverlay(false);
                setErrorMessage("");
                return true;
            } catch (snapshotErr) {
                console.error(snapshotErr);
                return false;
            }
        };

        const fetchGame = async () => {
            if (!authenticated) {
                if (await openObserverMode()) {
                    return;
                }

                setShowOverlay(true);
                setErrorMessage("This game is not available to observe yet");
                return;
            }

            try {
                const currentGame = await getCurrentGame?.();

                if (currentGame?.abandoned) {
                    setShowOverlay(true);
                    setErrorMessage("This game has been abandoned!");
                } else {
                    setErrorMessage("");

                    // store the user's team
                    setUserTeam((currentGame?.team as TeamType) ?? TeamVals.NO_TEAM);

                    if (!gameId || currentGame?.id !== gameId) {
                        if (await openObserverMode()) {
                            return;
                        }
                        setShowOverlay(true);
                        setErrorMessage("The game is no longer active or you don't have access to it");
                    } else {
                        setRouteMode("checking");
                        setShowOverlay(false);
                    }
                }
            } catch (err) {
                console.error(err);
                if (await openObserverMode()) {
                    return;
                }
                setShowOverlay(true);
                setErrorMessage((err as Error).message || "An unexpected error occurred");
            }
        };

        fetchGame();
    }, [authenticated, gameId, getCurrentGame]);

    // One-shot: resolve "checking" into "pick" or "play" as soon as we know which (e.g. a fresh load
    // or a mid-fight reconnect). Not an interval — the gated poll below picks up from "pick".
    useEffect(() => {
        if (!gameId || showOverlay || userTeam === TeamVals.NO_TEAM || routeMode !== "checking") {
            return;
        }

        let cancelled = false;
        fetchRankedPlaySnapshot(gameId)
            // undefined = the game is still drafting (204), which is the COMMON case for a match that
            // just formed. Route to pick, exactly as a thrown error used to.
            .then((snapshot) => {
                if (!cancelled) {
                    setRouteMode(snapshot ? "play" : "pick");
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setRouteMode("pick");
                }
            });

        return () => {
            cancelled = true;
        };
    }, [gameId, routeMode, showOverlay, userTeam]);

    // Fallback poll for the "pick -> play" handoff: the pick-events SSE stream (open inside
    // PickAndBanView) has no "picking is done" message of its own, so this polls play-snapshot until
    // the play session exists. Always armed (so the transition can never get permanently stuck even
    // if the phase signal below is wrong or the pick UI's phase model changes), but SLOW by default —
    // the many-minute early pick/ban/artifact phases would otherwise 400 every 2.5s for nothing. Once
    // pickNearingPlay reports we've reached the draft's final phase, it speeds up for a snappy handoff.
    useEffect(() => {
        if (!gameId || showOverlay || routeMode !== "pick") {
            return;
        }

        let cancelled = false;
        const probePlaySnapshot = async () => {
            try {
                // undefined = still drafting (204). Only a real snapshot means the handoff happened.
                const snapshot = await fetchRankedPlaySnapshot(gameId);
                if (snapshot && !cancelled) {
                    setRouteMode("play");
                }
            } catch {
                // Not ready yet — keep polling until the play session is created.
            }
        };

        void probePlaySnapshot();
        const intervalId = window.setInterval(probePlaySnapshot, pickNearingPlay ? 2000 : 15000);

        return () => {
            cancelled = true;
            window.clearInterval(intervalId);
        };
    }, [gameId, routeMode, showOverlay, pickNearingPlay]);

    return (
        <>
            {showOverlay && (
                <div
                    style={{
                        position: "fixed",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: "100%",
                        backgroundColor: "rgba(139, 0, 0, 0.5)",
                        color: "white",
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                        zIndex: 1000,
                        fontSize: "28px",
                        textShadow: "0 0 10px white",
                    }}
                >
                    {errorMessage}
                </div>
            )}
            {!showOverlay && gameId && routeMode === "checking" && <MatchLoadingOverlay />}
            {!showOverlay && gameId && routeMode !== "checking" && (
                <>
                    {routeMode === "pick" &&
                        (observerMode ? (
                            <ObserverPickView gameId={gameId} onPickPhaseChange={handlePickPhaseChange} />
                        ) : (
                            <PickAndBanView
                                windowSize={windowSize}
                                userTeam={userTeam}
                                gameId={gameId}
                                onPickPhaseChange={handlePickPhaseChange}
                            />
                        ))}
                    {routeMode === "play" && (
                        <RankedGameView windowSize={windowSize} gameId={gameId} userTeam={userTeam} />
                    )}
                </>
            )}
        </>
    );
};

const RankedReplayRoute: React.FC<{ windowSize: IWindowSize }> = ({ windowSize }) => {
    const { gameId } = useParams<{ gameId: string }>();
    const requestedTeam = Number(new URL(window.location.href).searchParams.get("team"));
    const userTeam =
        requestedTeam === TeamVals.LEFT || requestedTeam === TeamVals.RIGHT
            ? (requestedTeam as TeamType)
            : (TeamVals.NO_TEAM as TeamType);

    return gameId ? <RankedGameView gameId={gameId} replayOnly userTeam={userTeam} windowSize={windowSize} /> : null;
};

const AuthedRoutes: React.FC<{ windowSize: IWindowSize }> = ({ windowSize }) => {
    const { loading, authenticated, user } = useAuthContext();

    // Online play requires an activated (email-verified) account. An authenticated-but-inactive
    // user (a fresh email registration, or an old account that never verified) is funneled to the
    // LoginScreen, which renders the verification-code step so they can activate.
    const activated = authenticated && user?.is_active !== false;

    if (loading) {
        return null;
    }

    return (
        <Routes>
            {/* Offline sandbox is available without login */}
            <Route path="/" element={<Heroes windowSize={windowSize} />} />
            {/* Dev-only harnesses and calibration editors. The literal import.meta.env.DEV guard is the
                actual prod gate: a production build statically drops every route below (and, with the lazy
                imports above, their chunks), so none of these are reachable — or even shipped — in prod.
                The in-component IS_PROD guards remain as a second line of defense. */}
            {import.meta.env.DEV && (
                <>
                    {/* Backend-free visual fixture: intentionally remains on the starting-bundle phase. */}
                    <Route path="/preview/picks/bundle" element={<BundlePickPreview />} />
                    {/* Backend-free visual fixture for the first creature-pick phase. */}
                    <Route path="/preview/picks/level1" element={<LevelOnePickPreview />} />
                    {/* Backend-free but PLAYABLE draft: bundle -> picks -> tier-2 artifact -> placement handoff. */}
                    <Route path="/preview/picks/local" element={<LocalPlayableDraft />} />
                    {/* Backend-free augment step: the ranked "Choose your augments" screen with no game behind it. */}
                    <Route path="/preview/augments" element={<AugmentStepPreview />} />
                    {/* Backend-free pre-fight placement: the ranked board+sidebar driven by an in-memory session. */}
                    <Route path="/preview/placement" element={<PlacementStepPreview windowSize={windowSize} />} />
                    {/* Local-only visual calibration tool. Draft values persist in localStorage until exported. */}
                    <Route
                        path="/dev/portrait-framing"
                        element={
                            <React.Suspense fallback={null}>
                                <PortraitFramingEditor />
                            </React.Suspense>
                        }
                    />
                    {/* Per-creature art crop and linked portrait/stat sizing for the left sandbox/battle sidebar only. */}
                    <Route
                        path="/dev/left-sidebar-portraits"
                        element={
                            <React.Suspense fallback={null}>
                                <LeftSidebarPortraitEditor />
                            </React.Suspense>
                        }
                    />
                    {/* Real-map model calibration: direct drag, independent X/Y scale and local draft export. */}
                    <Route
                        path="/dev/battlefield-framing"
                        element={
                            <React.Suspense fallback={null}>
                                <BattlefieldCreatureFramingEditor windowSize={windowSize} />
                            </React.Suspense>
                        }
                    />
                    {/* Live top/bottom endpoint tuning for animated battlefield silhouette shadows. */}
                    <Route
                        path="/dev/shadow-editor"
                        element={
                            <React.Suspense fallback={null}>
                                <BattlefieldShadowEditor windowSize={windowSize} />
                            </React.Suspense>
                        }
                    />
                    {/* Real-map ambient-fire calibration with live position, size and glow controls. */}
                    <Route
                        path="/dev/fire-editor"
                        element={
                            <React.Suspense fallback={null}>
                                <AmbientFireTuningEditor windowSize={windowSize} />
                            </React.Suspense>
                        }
                    />
                    {/* Side-brazier-only calibration using the pit-style video fire requested for the map edges. */}
                    <Route
                        path="/dev/side-fire-editor"
                        element={
                            <React.Suspense fallback={null}>
                                <AmbientFireTuningEditor
                                    windowSize={windowSize}
                                    definitions={SIDE_FIRE_DEFINITIONS}
                                    title="SIDE FIRE EDITOR"
                                />
                            </React.Suspense>
                        }
                    />
                    {/* Live 60-frame lava-atlas calibration: playback, color, geometry, light and procedural splashes. */}
                    <Route
                        path="/dev/lava-editor"
                        element={
                            <React.Suspense fallback={null}>
                                <LavaAnimationTuningEditor windowSize={windowSize} />
                            </React.Suspense>
                        }
                    />
                    {/* Real loading-screen preview with independently tunable overall and lower fire zones. */}
                    <Route
                        path="/dev/loading-fire-editor"
                        element={
                            <React.Suspense fallback={null}>
                                <LoadingScreenFireEditor />
                            </React.Suspense>
                        }
                    />
                </>
            )}
            {/* Online routes require authentication */}
            <Route
                path="/play"
                element={
                    <WalletProvider>
                        {activated || isMockPortalEnabled() ? <MatchmakingRoute /> : <LoginScreen />}
                    </WalletProvider>
                }
            />
            {/* Custom-game lobbies: browse/create and the lobby room (ready-up + start).
                LoginScreen uses wagmi hooks, so the unauthenticated fallback must sit inside WalletProvider.
                The browser takes the same dev-only preview flag as the arena and the portal (?mockPortal=1),
                so its chrome can be looked at without an account; the room still needs a real lobby. */}
            <Route
                path="/lobbies"
                element={
                    activated || isMockPortalEnabled() ? (
                        <LobbiesBrowse />
                    ) : (
                        <WalletProvider>
                            <LoginScreen />
                        </WalletProvider>
                    )
                }
            />
            <Route
                path="/lobby/:lobbyId"
                element={
                    activated ? (
                        <LobbyView />
                    ) : (
                        <WalletProvider>
                            <LoginScreen />
                        </WalletProvider>
                    )
                }
            />
            {/* Player portal: full-profile dashboard (stats, matches, combos, strategies) */}
            <Route
                path="/portal"
                element={
                    activated || isMockPortalEnabled() ? (
                        <PlayerPortalPage />
                    ) : (
                        <WalletProvider>
                            <LoginScreen />
                        </WalletProvider>
                    )
                }
            />
            <Route
                path="/game/:gameId/replay"
                element={
                    <WalletProvider>
                        {activated ? <RankedReplayRoute windowSize={windowSize} /> : <LoginScreen />}
                    </WalletProvider>
                }
            />
            <Route
                path="/game/:gameId"
                element={
                    <WalletProvider>
                        <GameRoute windowSize={windowSize} />
                    </WalletProvider>
                }
            />
            <Route path="*" element={<Heroes windowSize={windowSize} />} />
        </Routes>
    );
};

const App: React.FC = () => {
    const [windowSize, setWindowSize] = useState<IWindowSize>({
        width: window.innerWidth,
        height: window.innerHeight,
    });

    const updateWindowSize = useCallback(() => {
        setWindowSize({
            width: window.innerWidth,
            height: window.innerHeight,
        });
    }, []);

    usePreventSelection();

    useEffect(() => {
        window.addEventListener("resize", updateWindowSize);
        document.addEventListener("fullscreenchange", updateWindowSize);

        return () => {
            window.removeEventListener("resize", updateWindowSize);
            document.removeEventListener("fullscreenchange", updateWindowSize);
        };
    }, [updateWindowSize]);

    return (
        <AuthProvider>
            <SocialProvider>
                {/* Tracks which lobby room the player is currently in so the SocialDock can offer
                    "Invite" and the routed LobbyView can publish/clear the current lobby id. */}
                <CurrentLobbyProvider>
                    <Router>
                        {/* Above the routes on purpose: one long-lived <audio> means walking between the menu
                            screens does not restart the theme. It decides for itself which routes sing. */}
                        <ThemeMusic />
                        {/* Floating notifications, friends, and messages; compact during fights. */}
                        <SocialDock />
                        <AuthedRoutes windowSize={windowSize} />
                    </Router>
                </CurrentLobbyProvider>
            </SocialProvider>
        </AuthProvider>
    );
};

installFootprintOverridesFromSearch(window.location.search);

// Reuse an existing root across hot-reloads / re-evaluations instead of calling createRoot()
// on the same #root container twice (React warns and leaks the previous root otherwise).
const container = document.getElementById("root") as HTMLElement & {
    __appRoot?: ReturnType<typeof createRoot>;
};
const root = container.__appRoot ?? createRoot(container);
container.__appRoot = root;
const renderApplication = async (): Promise<void> => {
    // DOM text can repaint after a font swap; already-rasterised Pixi labels cannot. Wait for the complete
    // face (letters and digits), then make it Pixi's default before any scene creates a TextStyle.
    await document.fonts?.load('16px "HoC Forge"', "START БИТВА 0123456789").catch(() => undefined);
    TextStyle.defaultTextStyle.fontFamily = HOC_GAME_FONT_FAMILY;
    document.documentElement.style.setProperty(
        "--hoc-cursor-interactive",
        `url("${images.cursor_interactive_point_x}") 0 0`,
    );
    root.render(<App />);
};

void renderApplication();
