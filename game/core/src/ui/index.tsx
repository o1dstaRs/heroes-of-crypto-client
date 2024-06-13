import React, { useEffect, useReducer, useState } from "react";
import ReactDOM from "react-dom";
import "typeface-open-sans";
import { Router } from "@react-nano/router";
import { CssVarsProvider } from "@mui/joy/styles";
import CssBaseline from "@mui/joy/CssBaseline";

import { Main } from "./Main";
import { SceneControl } from "../sceneControls";
import { Box2dBar } from "./Box2dBar";
import LeftSideBar from "./LeftSideBar";
import RightSideBar from "./RightSideBar";
import "./style.scss";
import { useManager } from "../manager";

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

function App() {
    const [sceneControlGroups, setSceneControls] = useReducer(reduceTestControlGroups, defaultSceneControlGroupsState);
    const [started, setStarted] = useState(false);
    const manager = useManager();

    useEffect(() => {
        const connection = manager.onHasStarted.connect(setStarted);
        return () => {
            connection.disconnect();
        };
    });

    return (
        <div className="container">
            <CssVarsProvider>
                <CssBaseline />
                <LeftSideBar started={started} />
                {started ? <RightSideBar /> : <span />}
            </CssVarsProvider>
            <Main setSceneControlGroups={setSceneControls} />
            <span /> : <Box2dBar sceneControlGroups={sceneControlGroups} />
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
