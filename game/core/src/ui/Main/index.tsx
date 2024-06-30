import React, { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import type { SceneControlGroup } from "..";
import { useManager } from "../../manager";
import { SceneEntry } from "../../scenes/scene";
import { getSceneLink } from "../../utils/reactUtils";

interface SceneComponentProps {
    entry: SceneEntry;
    setSceneControlGroups: (groups: SceneControlGroup[]) => void;
}

const GameScreen = ({ entry: { name, SceneClass }, setSceneControlGroups }: SceneComponentProps) => {
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
                await manager.init(glCanvas, debugCanvas, wrapper, setTest, setSceneControlGroups);
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
