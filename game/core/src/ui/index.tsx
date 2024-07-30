import CssBaseline from "@mui/joy/CssBaseline";
import { CssVarsProvider } from "@mui/joy/styles";
import React, { useEffect, useReducer, useState } from "react";
import { useTheme } from "@mui/joy";
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
import { Main, useActiveTestEntry } from "./Main";
import RightSideBar from "./RightSideBar";
import "./style.scss";
import Popover from "./Popover";

// based on the overlays width ratio
// do not change
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

function getSelectionType(coordinates: ICoordinates): SelectionType {
    if (!coordinates.x || !coordinates.y) {
        return SelectionType.NO_SELECTION;
    }
    if (coordinates.x / window.innerWidth < LEFT_SELECTION_RATIO) {
        return SelectionType.SANDBOX;
    }

    if (coordinates.x / window.innerWidth < CENTER_SELECTION_RATIO) {
        return SelectionType.LOBBY;
    }

    return SelectionType.PREDICTION;
}

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

function Home() {
    const [isTracking, setIsTracking] = useState(true);
    const [needToRenderOverlay, setNeedToRenderOverlay] = useState(true);
    const [coordinates, setCoordinates] = useState({ x: 0, y: 0 });
    const manager = useManager();

    const selectionType = getSelectionType(coordinates);
    let defaultOverlay = overlayNoSelect;
    if (selectionType === SelectionType.SANDBOX) {
        defaultOverlay = overlaySandbox;
    } else if (selectionType === SelectionType.LOBBY) {
        defaultOverlay = overlayCreateLobby;
    } else if (selectionType === SelectionType.PREDICTION) {
        defaultOverlay = overlayPrediction;
    }

    const navigate = useNavigate();

    const handleClick = (event: MouseEvent) => {
        const { clientX, clientY } = event;
        setCoordinates({ x: clientX, y: clientY });
        const sType = getSelectionType({ x: clientX, y: clientY });
        if (sType === SelectionType.SANDBOX) {
            setNeedToRenderOverlay(false);
            setIsTracking(false);
            navigate("/Heroes#Sandbox");
        }
    };

    const handleTouch = (event: TouchEvent) => {
        const touch = event.touches[0];
        const { clientX, clientY } = touch;
        setCoordinates({ x: clientX, y: clientY });
        const sType = getSelectionType({ x: clientX, y: clientY });
        if (sType === SelectionType.SANDBOX) {
            setNeedToRenderOverlay(false);
            setIsTracking(false);
            navigate("/Heroes#Sandbox");
        }
    };

    const handleMouseMove = (event: MouseEvent) => {
        const { clientX, clientY } = event;
        setCoordinates({ x: clientX, y: clientY });
    };

    const throttledMouseMove = throttle(handleMouseMove, THROTTLE_MOUSE_MOVE_DELAY_MS);

    useEffect(() => {
        if (isTracking) {
            window.addEventListener("mousemove", throttledMouseMove);
            window.addEventListener("click", handleClick);
            window.addEventListener("touchstart", handleTouch);
        } else {
            window.removeEventListener("mousemove", throttledMouseMove);
            window.removeEventListener("click", handleClick);
            window.removeEventListener("touchstart", handleTouch);
        }

        // Cleanup function to ensure the event listener is removed if the component unmounts
        return () => {
            window.removeEventListener("mousemove", throttledMouseMove);
            window.removeEventListener("click", handleClick);
            window.removeEventListener("touchstart", handleTouch);
        };
    }, [isTracking]);

    const entry = useActiveTestEntry();

    if (entry && needToRenderOverlay) {
        setNeedToRenderOverlay(false);
    }

    if (!needToRenderOverlay && !entry) {
        setNeedToRenderOverlay(true);
    }

    let cssContainerDisplay = "flex";
    if (needToRenderOverlay) {
        cssContainerDisplay = "block";
    }

    if (entry && isTracking) {
        setIsTracking(false);
    }

    if (!entry && !isTracking) {
        setIsTracking(true);
    }

    manager.Uninitialize();

    return (
        <div className="container" style={{ display: cssContainerDisplay }}>
            {needToRenderOverlay && (
                <header className="App-header">
                    <div className="image-overlay">
                        <img src={defaultOverlay} alt="OverlayWebp" className="background-image" />
                    </div>
                </header>
            )}
        </div>
    );
}

function Heroes() {
    const [, setSceneControls] = useReducer(reduceTestControlGroups, defaultSceneControlGroupsState);
    const [started, setStarted] = useState(false);

    const manager = useManager();
    const theme = useTheme();

    useEffect(() => {
        const connection2 = manager.onHasStarted.connect(setStarted);
        return () => {
            connection2.disconnect();
        };
    });

    console.log(theme);

    return (
        <div className="container" style={{ display: "flex" }}>
            <CssVarsProvider>
                <CssBaseline />
                <LeftSideBar gameStarted={started} />
                <RightSideBar gameStarted={started} />
                <DraggableToolbar />
            </CssVarsProvider>
            <Main setSceneControlGroups={setSceneControls} />
            <Popover />
        </div>
    );
}

document.title = "Heroes of Crypto Beta";

const App: React.FC = () => (
    <HashRouter>
        <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/heroes" element={<Heroes />} />
        </Routes>
    </HashRouter>
);

// eslint-disable-next-line react/no-deprecated
ReactDOM.render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
    document.getElementById("root") as HTMLElement,
);
