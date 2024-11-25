import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";

import { useManager } from "../../manager";
import { SceneEntry } from "../../scenes/scene";
import { getSceneLink } from "../../utils/reactUtils";
import DamageBubble from "../DamageBubble";

interface SceneComponentProps {
    entry: SceneEntry;
}

const GameScreen = ({ entry: { name, SceneClass } }: SceneComponentProps) => {
    const [coordinates, setCoordinates] = useState({ x: 0, y: 0 });
    const [damage, setDamage] = useState<number>(0);
    const [started, setStarted] = useState(false);

    const manager = useManager();
    const initializedRef = useRef(false);

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

        if (glCanvas && debugCanvas && wrapper && !initializedRef.current) {
            initializedRef.current = true;

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
                await manager.init(glCanvas, debugCanvas, wrapper, setTest);
                window.requestAnimationFrame(loop);
            };

            init().catch((e) => console.error("Initialization failed", e));
        }
    }, [manager]);

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
    const manager = useManager();
    return manager.flatScenes[0];
}

export const Main = () => {
    const entry = useActiveSceneEntry();
    return entry ? <GameScreen entry={entry} /> : <span />;
};
