import CssBaseline from "@mui/joy/CssBaseline";
import { CssVarsProvider } from "@mui/joy/styles";
import { Router, useRouteLink } from "@react-nano/router";
import React, { useEffect, useReducer, useState } from "react";
import ReactDOM from "react-dom";
import "typeface-open-sans";

import overlayCreateLobby from "../../images/overlay_lobby.webp";
import overlayNoSelect from "../../images/overlay_no_select.webp";
import overlayPrediction from "../../images/overlay_prediction.webp";
import overlaySandbox from "../../images/overlay_sandbox.webp";
import { useManager } from "../manager";
import { SceneControl } from "../sceneControls";
import { Box2dBar } from "./Box2dBar";
import LeftSideBar from "./LeftSideBar";
import { Main, useActiveTestEntry } from "./Main";
import RightSideBar from "./RightSideBar";
import "./style.scss";

// based on the overlays width ratio
// do not change
const LEFT_SELECTION_RATIO = 0.375558035714286;
const CENTER_SELECTION_RATIO = 0.622209821428571;

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

interface ILinkButtonProps {
    href: string;
    onClick?: () => void;
}

interface ICoordinates {
    x: number;
    y: number;
}

export function LinkButton(props: React.PropsWithChildren<ILinkButtonProps>) {
    const routeLink = useRouteLink(props.href, props.onClick);
    return <button {...props} onClick={routeLink.onClick} />;
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

function App() {
    const [sceneControlGroups, setSceneControls] = useReducer(reduceTestControlGroups, defaultSceneControlGroupsState);
    const [started, setStarted] = useState(false);
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

    const handleClick = (event: MouseEvent) => {
        const { clientX, clientY } = event;
        setCoordinates({ x: clientX, y: clientY });
        const sType = getSelectionType({ x: clientX, y: clientY });
        if (sType === SelectionType.SANDBOX) {
            window.location.href = "/#/Heroes#TestFight";
            setNeedToRenderOverlay(false);
        }
    };

    const handleTouch = (event: TouchEvent) => {
        const touch = event.touches[0];
        const { clientX, clientY } = touch;
        setCoordinates({ x: clientX, y: clientY });
        const sType = getSelectionType({ x: clientX, y: clientY });
        if (sType === SelectionType.SANDBOX) {
            window.location.href = "/#/Heroes#TestFight";
            setNeedToRenderOverlay(false);
        }
    };

    const handleMouseMove = (event: MouseEvent) => {
        const { clientX, clientY } = event;
        setCoordinates({ x: clientX, y: clientY });
    };

    useEffect(() => {
        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("click", handleClick);
        window.addEventListener("touchstart", handleTouch);

        return () => {
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("click", handleClick);
            window.removeEventListener("touchstart", handleTouch);
        };
    }, []);

    useEffect(() => {
        const connection = manager.onHasStarted.connect(setStarted);
        return () => {
            connection.disconnect();
        };
    });

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

    return (
        <div className="container" style={{ display: cssContainerDisplay }}>
            {needToRenderOverlay && (
                <header className="App-header">
                    <div className="image-overlay">
                        <img src={defaultOverlay} alt="OverlayWebp" className="background-image" />
                    </div>
                </header>
            )}
            {!needToRenderOverlay && (
                <CssVarsProvider>
                    <CssBaseline />
                    <LeftSideBar started={started} />
                    {started ? <RightSideBar /> : <span />}
                </CssVarsProvider>
            )}
            {!needToRenderOverlay && <Main setSceneControlGroups={setSceneControls} />}
            {!needToRenderOverlay && <Box2dBar sceneControlGroups={sceneControlGroups} />}
        </div>
    );
}

document.title = "Heroes of Crypto Beta";

// eslint-disable-next-line react/no-deprecated
ReactDOM.render(
    <Router mode="hash">
        <App />
    </Router>,
    document.getElementById("root") as HTMLElement,
);
