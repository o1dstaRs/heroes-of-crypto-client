import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import type { SceneControlGroup } from "..";
import { useManager } from "../../manager";
import { SceneEntry } from "../../scenes/scene";
import { getSceneLink } from "../../utils/reactUtils";
import DamageBubble from "../DamageBubble";

interface SceneComponentProps {
    entry: SceneEntry;
    setSceneControlGroups: (groups: SceneControlGroup[]) => void;
}

const GameScreen = ({ entry: { name, SceneClass }, setSceneControlGroups }: SceneComponentProps) => {
    const [coordinates, setCoordinates] = useState({ x: 0, y: 0 });
    const [damage, setDamage] = useState<number>(0);
    const [started, setStarted] = useState(false);

    const manager = useManager();

    useEffect(() => {
        const connection = manager.onHasStarted.connect((hasStarted) => {
            setStarted(hasStarted);
        });

        return () => {
            connection.disconnect();
        };
    }, [manager]);

    useEffect(() => {
        const connection2 = manager.onDamageReceived.connect((damage) => {
            setDamage(damage);
        });

        return () => {
            connection2.disconnect();
        };
    }, [manager]);

    const handleMouseMove = (event: MouseEvent) => {
        const { clientX, clientY } = event;
        setCoordinates({ x: clientX, y: clientY });
    };

    useEffect(() => {
        if (started) {
            window.addEventListener("mousemove", handleMouseMove);
        } else {
            window.removeEventListener("mousemove", handleMouseMove);
        }

        // Cleanup function to ensure the event listener is removed if the component unmounts
        return () => {
            window.removeEventListener("mousemove", handleMouseMove);
        };
    }, [started]);

    const glCanvasRef = useRef<HTMLCanvasElement>(null);
    const debugCanvasRef = useRef<HTMLCanvasElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
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
        <>
            <main ref={wrapperRef}>
                <canvas ref={glCanvasRef} />
                <canvas ref={debugCanvasRef} />
            </main>
            <DamageBubble damages={[damage]} coordinates={coordinates} />
        </>
    );
};

export function useActiveSceneEntry() {
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
    const entry = useActiveSceneEntry();
    return entry ? <GameScreen entry={entry} setSceneControlGroups={setSceneControlGroups} /> : <span />;
};
