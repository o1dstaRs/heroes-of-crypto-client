import CssBaseline from "@mui/joy/CssBaseline";
import { CssVarsProvider } from "@mui/joy/styles";
import React, { useEffect, useReducer, useState, useCallback } from "react";
import ReactDOM from "react-dom";
import { HashRouter, Route, Routes, useNavigate } from "react-router-dom";
import "typeface-open-sans";

import overlayCreateLobby from "../../images/overlay_lobby.webp";
import overlayNoSelect from "../../images/overlay_no_select.webp";
import overlayPrediction from "../../images/overlay_prediction.webp";
import overlaySandbox from "../../images/overlay_sandbox.webp";
import { useManager } from "../manager";
import { SceneControl } from "../sceneControls";
import LeftSideBar from "./LeftSideBar";
import DraggableToolbar from "./DraggableToolbar";
import { Main, useActiveSceneEntry } from "./Main";
import RightSideBar from "./RightSideBar";
import "./style.scss";
import Popover from "./Popover";
import { UpNextOverlay } from "./UpNextOverlay";
import { IWindowSize } from "../state/visible_state";

const LEFT_SELECTION_RATIO = 0.375558035714286;
const CENTER_SELECTION_RATIO = 0.622209821428571;
const THROTTLE_MOUSE_MOVE_DELAY_MS = 25;

enum SelectionType {
    NO_SELECTION = 0,
    SANDBOX = 1,
    LOBBY = 2,
    PREDICTION = 3,
}

export interface SceneControlGroup {
    legend: string;
    controls: SceneControl[];
}

const defaultSceneControlGroupsState = {
    key: 0,
    groups: [] as SceneControlGroup[],
};

export type SceneControlGroupsState = typeof defaultSceneControlGroupsState;

function reduceTestControlGroups(state: SceneControlGroupsState, groups: SceneControlGroup[]) {
    return {
        key: state.key + 1,
        groups,
    };
}

interface ICoordinates {
    x: number;
    y: number;
}

const getSelectionType = (coordinates: ICoordinates, windowSize: IWindowSize): SelectionType => {
    if (!coordinates.x || !coordinates.y) {
        return SelectionType.NO_SELECTION;
    }
    if (coordinates.x / windowSize.width < LEFT_SELECTION_RATIO) {
        return SelectionType.SANDBOX;
    }
    if (coordinates.x / windowSize.width < CENTER_SELECTION_RATIO) {
        return SelectionType.LOBBY;
    }
    return SelectionType.PREDICTION;
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const throttle = (func: (...args: any[]) => void, delay: number) => {
    let lastCall = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (...args: any[]) => {
        const now = new Date().getTime();
        if (now - lastCall < delay) {
            return;
        }
        lastCall = now;
        return func(...args);
    };
};

const Home: React.FC<{ windowSize: IWindowSize }> = ({ windowSize }) => {
    const [isTracking, setIsTracking] = useState(true);
    const [needToRenderOverlay, setNeedToRenderOverlay] = useState(true);
    const [coordinates, setCoordinates] = useState({ x: 0, y: 0 });
    const manager = useManager();
    const navigate = useNavigate();
    const entry = useActiveSceneEntry();

    const handleClick = useCallback(
        (event: MouseEvent) => {
            const { clientX, clientY } = event;
            setCoordinates({ x: clientX, y: clientY });
            const sType = getSelectionType({ x: clientX, y: clientY }, windowSize);
            if (sType === SelectionType.SANDBOX) {
                setNeedToRenderOverlay(false);
                setIsTracking(false);
                navigate("/Heroes#Sandbox");
            }
        },
        [windowSize, navigate],
    );

    const handleTouch = useCallback(
        (event: TouchEvent) => {
            const touch = event.touches[0];
            const { clientX, clientY } = touch;
            setCoordinates({ x: clientX, y: clientY });
            const sType = getSelectionType({ x: clientX, y: clientY }, windowSize);
            if (sType === SelectionType.SANDBOX) {
                setNeedToRenderOverlay(false);
                setIsTracking(false);
                navigate("/Heroes#Sandbox");
            }
        },
        [windowSize, navigate],
    );

    const handleMouseMove = useCallback((event: MouseEvent) => {
        const { clientX, clientY } = event;
        setCoordinates({ x: clientX, y: clientY });
    }, []);

    const throttledMouseMove = useCallback(throttle(handleMouseMove, THROTTLE_MOUSE_MOVE_DELAY_MS), [handleMouseMove]);

    useEffect(() => {
        if (isTracking) {
            window.addEventListener("mousemove", throttledMouseMove);
            window.addEventListener("click", handleClick);
            window.addEventListener("touchstart", handleTouch);
        }

        return () => {
            window.removeEventListener("mousemove", throttledMouseMove);
            window.removeEventListener("click", handleClick);
            window.removeEventListener("touchstart", handleTouch);
        };
    }, [isTracking, throttledMouseMove, handleClick, handleTouch]);

    useEffect(() => {
        if (entry && needToRenderOverlay) {
            setNeedToRenderOverlay(false);
        } else if (!entry && !needToRenderOverlay) {
            setNeedToRenderOverlay(true);
        }
    }, [entry, needToRenderOverlay]);

    useEffect(() => {
        if (entry && isTracking) {
            setIsTracking(false);
        } else if (!entry && !isTracking) {
            setIsTracking(true);
        }
    }, [entry, isTracking]);

    const selectionType = getSelectionType(coordinates, windowSize);
    let defaultOverlay = overlayNoSelect;
    if (selectionType === SelectionType.SANDBOX) {
        defaultOverlay = overlaySandbox;
    } else if (selectionType === SelectionType.LOBBY) {
        defaultOverlay = overlayCreateLobby;
    } else if (selectionType === SelectionType.PREDICTION) {
        defaultOverlay = overlayPrediction;
    }

    // Move manager.Uninitialize() to useEffect with proper cleanup
    useEffect(() => {
        return () => {
            manager.Uninitialize();
        };
    }, [manager]);

    return (
        <div className="container" style={{ display: needToRenderOverlay ? "block" : "flex" }}>
            {needToRenderOverlay && (
                <header className="App-header">
                    <div className="image-overlay">
                        <img src={defaultOverlay} alt="OverlayWebp" className="background-image" />
                    </div>
                </header>
            )}
        </div>
    );
};

const Heroes: React.FC<{ windowSize: IWindowSize }> = ({ windowSize }) => {
    const [, setSceneControls] = useReducer(reduceTestControlGroups, defaultSceneControlGroupsState);
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
            <Main setSceneControlGroups={setSceneControls} />
            <Popover />
        </div>
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
        <HashRouter>
            <Routes>
                <Route path="/" element={<Home windowSize={windowSize} />} />
                <Route path="/heroes" element={<Heroes windowSize={windowSize} />} />
            </Routes>
        </HashRouter>
    );
};

// eslint-disable-next-line react/no-deprecated
ReactDOM.render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
    document.getElementById("root") as HTMLElement,
);
