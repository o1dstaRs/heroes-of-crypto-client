import React, { useEffect, useReducer, useRef } from "react";
import { useRouter } from "@react-nano/router";

import { useManager } from "../../manager";
import { SceneEntry } from "../../scenes/scene";
import { getSceneLink } from "../../utils/reactUtils";
import type { SceneControlGroup } from "..";
import { Button } from "../controls/Button";

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
    const router = useRouter();
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
            const init = () => {
                const setTest = (test: SceneEntry) => router.history.push(getSceneLink(test));
                manager.init(glCanvas, debugCanvas, wrapper, setTest, setLeftTable, setSceneControlGroups);
                window.requestAnimationFrame(loop);
            };
            window.requestAnimationFrame(init);
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
    const router = useRouter();
    const link = decodeURIComponent(router.path);
    const manager = useManager();
    return manager.flatScenes.find((test) => getSceneLink(test) === link);
}

interface MainProps {
    setSceneControlGroups: (groups: SceneControlGroup[]) => void;
}

export const Main = ({ setSceneControlGroups }: MainProps) => {
    const entry = useActiveTestEntry();

    //    alert(JSON.stringify(entry));
    return entry ? (
        <GameScreen entry={entry} setSceneControlGroups={setSceneControlGroups} />
    ) : (
        <div className="main">
            <h3>Welcome to Heroes of Crypto</h3>
            <Button className="button-24" label="Start playing" onClick={() => {}} />
        </div>
    );
};
