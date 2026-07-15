import { PickPhaseVals, TeamVals, TeamType } from "@heroesofcrypto/common";
import { PICK_EVENT_SOURCE } from "./env";

import CssBaseline from "@mui/joy/CssBaseline";
import { CssVarsProvider } from "@mui/joy/styles";
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter as Router, Route, Routes, useParams } from "react-router";
import "typeface-open-sans";

import { usePixiManager } from "../pixi/PixiGameManager";
import { WalletProvider } from "../wallet/WalletProvider";
import LeftSideBar from "./LeftSideBar";
import DraggableToolbar from "./DraggableToolbar";
import { Main } from "./Main";
import RightSideBar from "./RightSideBar";
import "./style.scss";
import Popover from "./Popover";
import { UpNextOverlay } from "./UpNextOverlay";
import { FightFinishedOverlay } from "./FightFinishedOverlay";
import { AiControlBadge, aiBadgeLeft } from "./AiControlBadge";
import { ExitReplayBadge } from "./ExitReplayBadge";
import { PlayRankedBadge } from "./PlayRankedBadge";
import { IWindowSize } from "../scenes/VisibleState";
import StainedGlassWindow from "./PickAndBan";
import { LocalModelDraftOpponent } from "./PickAndBan/LocalModelDraftOpponent";
import AutoPickToast from "./PickAndBan/AutoPickToast";
import { buildApiUrl, endpoints, HOST_GAME_API } from "../api/axios";
import { AuthProvider } from "./auth/context/auth_provider";
import { useAuthContext } from "./auth/context/auth_context";
import { LobbiesBrowse } from "./LobbiesBrowse";
import { LobbyView } from "./LobbyView";
import { LoginScreen } from "./LoginScreen/LoginScreen";
import { MatchmakingRoute } from "./MatchmakingRoute";
import type { SceneGameActionTransport } from "../game_action_transport";
import { fetchRankedPlaySnapshot } from "../api/ranked_play_client";
import { PlayerPortalPage } from "./PlayerPortal/PlayerPortalPage";
import { isMockPortalEnabled } from "./PlayerPortal/mockPortal";
import { RankedGameView } from "./RankedGameView";
import { getMarkedVsAiDifficulty, isMarkedVsAiGame, vsAiDifficultyLabel } from "../utils/aiOpponent";

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
    const [started, setStarted] = useState(false);
    const [isLoading, setIsLoading] = useState(manager.isLoading);
    const [aiToggleOn, setAiToggleOn] = useState(false);
    const [replayPlaybackActive, setReplayPlaybackActive] = useState(false);

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
                    {!isLoading && <LeftSideBar gameStarted={started} windowSize={windowSize} />}
                    {!isLoading && <RightSideBar gameStarted={started} windowSize={windowSize} />}
                    <UpNextOverlay />
                    <FightFinishedOverlay />
                    {!isLoading && started && aiToggleOn && <AiControlBadge left={aiBadgeLeft(windowSize)} />}
                    {!isLoading && replayPlaybackActive && (
                        // Sandbox: leaving the replay drops back to the regular (fresh) sandbox screen.
                        <ExitReplayBadge left={aiBadgeLeft(windowSize)} onExit={() => window.location.reload()} />
                    )}
                    {!isLoading && !replayPlaybackActive && <PlayRankedBadge left={aiBadgeLeft(windowSize)} />}
                    {!isLoading && started && <DraggableToolbar />}
                </CssVarsProvider>
                <Main />
                <Popover />
            </div>
        </ButtonProvider>
    );
};

export type { IPickPhaseEventData } from "./context/PickBanContext";
import { PickBanEventProvider, usePickBanEvents } from "./context/PickBanContext";
export { PickBanEventProvider, usePickBanEvents };

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
    }, [gameId]);

    useEffect(() => {
        const openObserverMode = async (): Promise<boolean> => {
            if (!gameId) {
                return false;
            }

            try {
                const snapshot = await fetchRankedPlaySnapshot(gameId);
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
            .then(() => {
                if (!cancelled) {
                    setRouteMode("play");
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
                await fetchRankedPlaySnapshot(gameId);
                if (!cancelled) {
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
                    {routeMode === "pick" && (
                        <PickAndBanView
                            windowSize={windowSize}
                            userTeam={userTeam}
                            gameId={gameId}
                            onPickPhaseChange={handlePickPhaseChange}
                        />
                    )}
                    {routeMode === "play" && (
                        <RankedGameView windowSize={windowSize} gameId={gameId} userTeam={userTeam} />
                    )}
                </>
            )}
        </>
    );
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
                LoginScreen uses wagmi hooks, so the unauthenticated fallback must sit inside WalletProvider. */}
            <Route
                path="/lobbies"
                element={
                    activated ? (
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
            <Router>
                <AuthedRoutes windowSize={windowSize} />
            </Router>
        </AuthProvider>
    );
};

// Reuse an existing root across hot-reloads / re-evaluations instead of calling createRoot()
// on the same #root container twice (React warns and leaks the previous root otherwise).
const container = document.getElementById("root") as HTMLElement & {
    __appRoot?: ReturnType<typeof createRoot>;
};
const root = container.__appRoot ?? createRoot(container);
container.__appRoot = root;
root.render(<App />);
