// game/core/src/react/GameScreen.tsx
import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";

// ⬇️ use the Pixi manager + SceneEntry from your Pixi scene module
import { usePixiManager } from "../../pixi/PixiGameManager"; // adjust the path if needed
import type { SceneEntry } from "../../pixi/PixiScene"; // adjust the path if needed

import { getSceneLink } from "../../utils/reactUtils";
import DamageBubble from "../DamageBubble";

interface SceneComponentProps {
    entry: SceneEntry;
}

const GameScreen: React.FC<SceneComponentProps> = ({ entry: { name, SceneClass } }) => {
    console.log("szzolotu call GameScreen");

    const [coordinates, setCoordinates] = useState({ x: 0, y: 0 });
    const [damage, setDamage] = useState<number>(0);
    const [started, setStarted] = useState(false);

    const manager = usePixiManager();
    const initializedRef = useRef(false);

    // Started flag
    useEffect(() => {
        const connection = manager.onHasStarted.connect((hasStarted) => setStarted(hasStarted));
        return () => {
            connection.disconnect(); // ignore boolean return -> cleanup returns void
        };
    }, [manager]);

    // Damage bubble
    useEffect(() => {
        const connection = manager.onDamageReceived.connect((dmg) => setDamage(dmg));
        return () => {
            connection.disconnect(); // ignore boolean return
        };
    }, [manager]);

    // Mouse tracker for the damage bubble when game is started
    useEffect(() => {
        const handleMouseMove = (event: MouseEvent) => {
            const { clientX, clientY } = event;
            setCoordinates({ x: clientX, y: clientY });
        };

        if (started) {
            window.addEventListener("mousemove", handleMouseMove);
        }
        return () => window.removeEventListener("mousemove", handleMouseMove);
    }, [started]);

    // Canvases + wrapper
    const glCanvasRef = useRef<HTMLCanvasElement>(null);
    const debugCanvasRef = useRef<HTMLCanvasElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();

    // Boot + loop
    useEffect(() => {
        console.log("szzolotu call useEffect");

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
                const setSceneInUrl = (test: SceneEntry) => navigate(getSceneLink(test));
                await manager.init(glCanvas, debugCanvas, wrapper, setSceneInUrl);
                window.requestAnimationFrame(loop);
            };

            void init().catch((e) => console.error("Initialization failed", e));
        }
    }, [manager, navigate]);

    // Switch active scene
    useEffect(() => {
        manager.setScene(name, SceneClass);
    }, [manager, name, SceneClass]);

    return (
        <>
            <main ref={wrapperRef} style={{ position: "relative", width: "100%", height: "100%" }}>
                {/* Pixi renders to glCanvas; debugCanvas is for picking/overlay input */}
                <canvas ref={glCanvasRef} style={{ position: "absolute", inset: 0 }} />
                <canvas ref={debugCanvasRef} style={{ position: "absolute", inset: 0, pointerEvents: "auto" }} />
            </main>
            <DamageBubble damages={[damage]} coordinates={coordinates} />
        </>
    );
};

// Helper to pick an active scene; adjust to your registry flow if needed.
export function useActiveSceneEntry() {
    const manager = usePixiManager();
    console.log("szzolotu call Heroes4");
    console.log(manager.flatScenes);
    return manager.flatScenes[0];
}

export const Main: React.FC = () => {
    const entry = useActiveSceneEntry();
    return entry ? <GameScreen entry={entry} /> : <span />;
};
