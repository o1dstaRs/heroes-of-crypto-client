import React, { useEffect, useReducer, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import type { SceneControlGroup } from "..";
import { useManager } from "../../manager";
import { SceneEntry } from "../../scenes/scene";
import { getSceneLink } from "../../utils/reactUtils";

interface SceneComponentProps {
    entry: SceneEntry;
    setSceneControlGroups: (groups: SceneControlGroup[]) => void;
}

export type SceneTable = Array<[string, string]>;
export type SceneTableSetter = (table: SceneTable) => void;

function tableReducer(state: SceneTable, action: SceneTable) {
    if (JSON.stringify(state) !== JSON.stringify(action)) return action;
    return state;
}

interface TextTableRowProps {
    label: string;
    value: string;
}

const TextTableRow = ({ label, value }: TextTableRowProps) => {
    if (value === "!") {
        return (
            <tr>
                <th colSpan={2}>{label}</th>
            </tr>
        );
    }
    if (value === "-") {
        return (
            <tr>
                <td colSpan={2}>{label}</td>
            </tr>
        );
    }
    return (
        <tr>
            <td>{value}</td>
            <td>{label}</td>
        </tr>
    );
};

interface TextTableProps {
    id: string;
    table: SceneTable;
}

const TextTable = ({ id, table }: TextTableProps) => (
    <div id={id}>
        <table>
            <tbody>
                {table.map(([label, value], index) => (
                    <TextTableRow key={index} label={label} value={value} />
                ))}
            </tbody>
        </table>
    </div>
);

const GameScreen = ({ entry: { name, SceneClass }, setSceneControlGroups }: SceneComponentProps) => {
    const [leftTable, setLeftTable] = useReducer(tableReducer, []);
    const glCanvasRef = useRef<HTMLCanvasElement>(null);
    const debugCanvasRef = useRef<HTMLCanvasElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const manager = useManager();
    const navigate = useNavigate();

    useEffect(() => {
        const glCanvas = glCanvasRef.current;
        const debugCanvas = debugCanvasRef.current;
        const wrapper = wrapperRef.current;
        if (glCanvas && debugCanvas && wrapper) {
            const loop = () => {
                try {
                    manager.SimulationLoop();
                    window.requestAnimationFrame(loop);
                } catch (e) {
                    console.error("Error during simulation loop", e);
                }
            };
            const init = async () => {
                const setTest = (test: SceneEntry) => navigate(getSceneLink(test));
                await manager.init(glCanvas, debugCanvas, wrapper, setTest, setLeftTable, setSceneControlGroups);
                window.requestAnimationFrame(loop);
            };
            window.requestAnimationFrame(() => {
                init().catch((e) => console.error("Initialization failed", e));
            });
        }
    }, [debugCanvasRef.current, glCanvasRef.current, wrapperRef.current, manager]);

    useEffect(() => {
        manager.setScene(name, SceneClass);
    }, [manager, SceneClass]);

    return (
        <main ref={wrapperRef}>
            <canvas ref={glCanvasRef} />
            <canvas ref={debugCanvasRef} />
            <TextTable id="left_overlay" table={leftTable} />
        </main>
    );
};

export function useActiveTestEntry() {
    const location = useLocation();
    const link = decodeURIComponent(`${location.pathname}${location.hash}`);
    const manager = useManager();

    for (const scene of manager.flatScenes) {
        if (getSceneLink(scene) === link) {
            return scene;
        }
    }

    return undefined;
}

interface MainProps {
    setSceneControlGroups: (groups: SceneControlGroup[]) => void;
}

export const Main = ({ setSceneControlGroups }: MainProps) => {
    const entry = useActiveTestEntry();
    return entry ? <GameScreen entry={entry} setSceneControlGroups={setSceneControlGroups} /> : <span />;
};
