import { HoCLib, TeamType } from "@heroesofcrypto/common";
import CustomEventSource from "@heroesofcrypto/common/src/messaging/custom_event_source";

import CssBaseline from "@mui/joy/CssBaseline";
import { CssVarsProvider } from "@mui/joy/styles";
import React, { useEffect, useState, useCallback, useContext, createContext, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter as Router, Route, Routes, useParams } from "react-router";
import "typeface-open-sans";

import { useManager } from "../manager";
import LeftSideBar from "./LeftSideBar";
import DraggableToolbar from "./DraggableToolbar";
import { Main } from "./Main";
import RightSideBar from "./RightSideBar";
import "./style.scss";
import Popover from "./Popover";
import { UpNextOverlay } from "./UpNextOverlay";
import { IWindowSize } from "../state/visible_state";
import StainedGlassWindow from "./PickAndBan";
import { AuthProvider } from "./auth/context/auth_provider";
import { useAuthContext } from "./auth/context/auth_context";

const IS_PROD = HoCLib.stringToBoolean(process.env.PROD);

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

const Heroes: React.FC<{ windowSize: IWindowSize }> = ({ windowSize }) => {
    const [started, setStarted] = useState(false);
    const manager = useManager();

    useEffect(() => {
        const connection = manager.onHasStarted.connect((hasStarted) => {
            setStarted(hasStarted);
            if (hasStarted) {
                manager.HomeCamera();
            }
        });

        return () => {
            connection.disconnect();
        };
    }, [manager]);

    return (
        <div className="container" style={{ display: "flex" }}>
            <CssVarsProvider>
                <CssBaseline />
                <LeftSideBar gameStarted={started} windowSize={windowSize} />
                <RightSideBar gameStarted={started} windowSize={windowSize} />
                <UpNextOverlay />
                <DraggableToolbar />
            </CssVarsProvider>
            <Main />
            <Popover />
        </div>
    );
};

export interface IPickPhaseEventData {
    // initial creatures pairs
    ip: [number, number][];
    // pick phase
    pp: number;
    // actors
    a: TeamType[];
    // picked
    p: number[];
    // banned
    b: number[];
    // opponent picked
    op: number[];
    // time remaining
    t: number;
    // reveals remanining
    r: number;
}

// Context for SSE and pick/ban state
interface PickBanContextType {
    isConnected: boolean;
    events: IPickPhaseEventData[];
    error: string | null;
    banned: number[];
    picked: number[];
    opponentPicked: number[];
    isYourTurn: boolean | null;
    pickPhase: number;
    secondsRemaining: number;
    revealsRemaining: number;
    initialCreaturesPairs: [number, number][];
}

const PickBanContext = createContext<PickBanContextType>({
    isConnected: false,
    events: [],
    error: null,
    banned: [],
    picked: [],
    opponentPicked: [],
    isYourTurn: null,
    pickPhase: -1,
    initialCreaturesPairs: [],
    secondsRemaining: -1,
    revealsRemaining: 0,
});

// Custom hook to use the Pick Ban Context
export const usePickBanEvents = () => useContext(PickBanContext);

// Provider component that manages SSE connection
export const PickBanEventProvider: React.FC<{
    children: React.ReactNode;
    url: string;
    userTeam: TeamType;
}> = ({ children, url, userTeam }) => {
    const [isConnected, setIsConnected] = useState(false);
    const [events, setEvents] = useState<IPickPhaseEventData[]>([]);
    const [banned, setBanned] = useState<number[]>([]);
    const [picked, setPicked] = useState<number[]>([]);
    const [opponentPicked, setOpponentPicked] = useState<number[]>([]);
    const [isYourTurn, setIsYourTurn] = useState<boolean | null>(null);
    const [pickPhase, setPickPhase] = useState<number>(-1);
    const [secondsRemaining, setSecondsRemaining] = useState<number>(-1);
    const [revealsRemaining, setRevealsRemaining] = useState<number>(0);
    const [initialCreaturesPairs, setInitialCreaturesPairs] = useState<[number, number][]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const STORAGE_KEY = "accessToken";

        const getCookie = (name: string) => {
            const value = `; ${document.cookie}`;
            const parts = value.split(`; ${name}=`);
            if (parts.length === 2) return parts.pop()?.split(";").shift();
            return undefined;
        };

        const refreshLocalStorageFromCookie = () => {
            const accessTokenCookie = getCookie(STORAGE_KEY);
            if (accessTokenCookie) {
                localStorage.setItem(STORAGE_KEY, accessTokenCookie);
            }
        };
        refreshLocalStorageFromCookie();

        const token = localStorage.getItem(STORAGE_KEY);

        // Create SSE connection
        const eventSource = new CustomEventSource<IPickPhaseEventData>(url, {
            token: token ?? undefined,
            debug: !IS_PROD ?? false,
        });

        eventSource.onmessage = (event: IPickPhaseEventData) => {
            setEvents((prevEvents) => [...prevEvents, event]);
            setIsConnected(true);
            setBanned(event.b);
            setPicked(event.p);
            setOpponentPicked(event.op);
            setPickPhase(event.pp);
            setIsYourTurn(event.a.includes(userTeam));
            setSecondsRemaining(Math.ceil(event.t / 1000));
            setRevealsRemaining(event.r);
            setError(null);
            setInitialCreaturesPairs(event.ip);
        };

        eventSource.onerror = (error: Error) => {
            console.error("SSE Connection Error:", error);
            setError(error.message);
            setIsConnected(false);
        };

        // Cleanup on unmount
        return () => {
            eventSource.close();
        };
    }, [url]);

    // Memoize context value to prevent unnecessary re-renders
    const contextValue = useMemo(
        () => ({
            isConnected,
            events,
            error,
            banned,
            picked,
            opponentPicked,
            isYourTurn,
            pickPhase,
            secondsRemaining,
            revealsRemaining,
            initialCreaturesPairs,
        }),
        [
            isConnected,
            events,
            error,
            banned,
            picked,
            opponentPicked,
            isYourTurn,
            pickPhase,
            secondsRemaining,
            revealsRemaining,
            initialCreaturesPairs,
        ],
    );

    return <PickBanContext.Provider value={contextValue}>{children}</PickBanContext.Provider>;
};

const PickAndBanView: React.FC<{ windowSize: IWindowSize; userTeam: TeamType }> = ({ windowSize, userTeam }) => {
    const [started, setStarted] = useState(false);
    const manager = useManager();

    useEffect(() => {
        const connection = manager.onHasStarted.connect((hasStarted) => {
            setStarted(hasStarted);
            if (hasStarted) {
                manager.HomeCamera();
            }
        });

        return () => {
            connection.disconnect();
        };
    }, [manager]);

    return (
        <PickBanEventProvider url={process.env.PICK_EVENT_SOURCE ?? ""} userTeam={userTeam}>
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
                    <LeftSideBar gameStarted={started} windowSize={windowSize} />
                    <RightSideBar gameStarted={started} windowSize={windowSize} />
                </CssVarsProvider>
                <StainedGlassWindow />
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
    const [userTeam, setUserTeam] = useState<TeamType>(TeamType.NO_TEAM);

    useEffect(() => {
        const fetchGame = async () => {
            try {
                const currentGame = await getCurrentGame?.();
                setErrorMessage("");

                // store the user's team
                setUserTeam(currentGame?.team ?? TeamType.NO_TEAM);

                if (!gameId || currentGame?.id !== gameId) {
                    setShowOverlay(true);
                    setErrorMessage("The game is no longer active or you don't have access to it");
                } else {
                    setShowOverlay(false);
                }
            } catch (err) {
                console.error(err);
                setShowOverlay(true);
                setErrorMessage((err as Error).message || "An unexpected error occurred");
            }
        };

        fetchGame();
    }, [gameId, getCurrentGame]);

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
            {(userTeam !== TeamType.NO_TEAM || errorMessage) && (
                <PickAndBanView windowSize={windowSize} userTeam={userTeam} />
            )}
        </>
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
        window.addEventListener("wheel", updateWindowSize);
        document.addEventListener("fullscreenchange", updateWindowSize);

        return () => {
            window.removeEventListener("resize", updateWindowSize);
            window.removeEventListener("wheel", updateWindowSize);
            document.removeEventListener("fullscreenchange", updateWindowSize);
        };
    }, [updateWindowSize]);

    return (
        <AuthProvider>
            <Router>
                <Routes>
                    <Route path="/" element={<Heroes windowSize={windowSize} />} />
                    {/* <Route path="/game" element={<PickAndBanView windowSize={windowSize} />} /> */}
                    <Route path="/game/:gameId" element={<GameRoute windowSize={windowSize} />} />
                </Routes>
            </Router>
        </AuthProvider>
    );
};

const root = createRoot(document.getElementById("root") as HTMLElement);
root.render(<App />);
