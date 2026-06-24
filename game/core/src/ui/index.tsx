import { TeamVals, TeamType } from "@heroesofcrypto/common";
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
import { IWindowSize } from "../scenes/VisibleState";
import StainedGlassWindow from "./PickAndBan";
import { buildApiUrl, endpoints, HOST_GAME_API } from "../api/axios";
import { AuthProvider } from "./auth/context/auth_provider";
import { useAuthContext } from "./auth/context/auth_context";
import { LoginScreen } from "./LoginScreen/LoginScreen";
import { MatchmakingRoute } from "./MatchmakingRoute";
import type { SceneGameActionTransport } from "../game_action_transport";
import { fetchRankedPlaySnapshot } from "../api/ranked_play_client";
import { RankedGameView } from "./RankedGameView";

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
            e.preventDefault();
        };

        // Prevent clipboard operations
        const preventClipboard = (e: ClipboardEvent) => {
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

    useEffect(() => {
        manager.SetGameActionTransport(gameActionTransport);
        return () => {
            manager.SetGameActionTransport(undefined);
        };
    }, [gameActionTransport, manager]);

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

const appendEncodedPath = (baseUrl: string, value: string): string =>
    `${baseUrl.replace(/\/+$/, "")}/${encodeURIComponent(value)}`;

const pickEventUrl = (gameId: string): string => {
    if (PICK_EVENT_SOURCE) {
        return appendEncodedPath(PICK_EVENT_SOURCE, gameId);
    }
    return appendEncodedPath(buildApiUrl(HOST_GAME_API, endpoints.game.pickEvents), gameId);
};

const PickAndBanView: React.FC<{ windowSize: IWindowSize; userTeam: TeamType; gameId: string }> = ({
    windowSize,
    userTeam,
    gameId,
}) => {
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
                <StainedGlassWindow userTeam={userTeam} />
                <Popover />
            </div>
        </PickBanEventProvider>
    );
};

const GameRoute: React.FC<{ windowSize: IWindowSize }> = ({ windowSize }) => {
    const { gameId } = useParams<{ gameId: string }>();
    const { getCurrentGame } = useAuthContext();
    const [showOverlay, setShowOverlay] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [userTeam, setUserTeam] = useState<TeamType>(TeamVals.NO_TEAM as TeamType);
    const [routeMode, setRouteMode] = useState<"checking" | "pick" | "play">("checking");

    useEffect(() => {
        const fetchGame = async () => {
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
                        setShowOverlay(true);
                        setErrorMessage("The game is no longer active or you don't have access to it");
                    } else {
                        setRouteMode("checking");
                        setShowOverlay(false);
                    }
                }
            } catch (err) {
                console.error(err);
                setShowOverlay(true);
                setErrorMessage((err as Error).message || "An unexpected error occurred");
            }
        };

        fetchGame();
    }, [gameId, getCurrentGame]);

    useEffect(() => {
        if (!gameId || showOverlay || userTeam === TeamVals.NO_TEAM || routeMode === "play") {
            return;
        }

        let cancelled = false;
        let intervalId: number | undefined;

        const probePlaySnapshot = async () => {
            try {
                await fetchRankedPlaySnapshot(gameId);
                if (!cancelled) {
                    setRouteMode("play");
                }
            } catch {
                if (!cancelled) {
                    setRouteMode("pick");
                }
            }
        };

        void probePlaySnapshot();
        intervalId = window.setInterval(probePlaySnapshot, 2500);

        return () => {
            cancelled = true;
            if (intervalId) {
                window.clearInterval(intervalId);
            }
        };
    }, [gameId, routeMode, showOverlay, userTeam]);

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
            {!showOverlay && userTeam !== TeamVals.NO_TEAM && gameId && (
                <>
                    {routeMode === "checking" && (
                        <div
                            style={{
                                position: "fixed",
                                inset: 0,
                                backgroundColor: "#0f1117",
                                color: "white",
                                display: "flex",
                                justifyContent: "center",
                                alignItems: "center",
                                zIndex: 1000,
                                fontSize: "20px",
                            }}
                        >
                            Loading game...
                        </div>
                    )}
                    {routeMode === "pick" && (
                        <PickAndBanView windowSize={windowSize} userTeam={userTeam} gameId={gameId} />
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
    const { loading, authenticated } = useAuthContext();

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
                element={<WalletProvider>{authenticated ? <MatchmakingRoute /> : <LoginScreen />}</WalletProvider>}
            />
            <Route
                path="/game/:gameId"
                element={
                    <WalletProvider>
                        {authenticated ? <GameRoute windowSize={windowSize} /> : <LoginScreen />}
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
