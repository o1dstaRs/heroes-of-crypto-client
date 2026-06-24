// game/core/src/react/GameScreen.tsx
import React, { useEffect, useRef } from "react";
import { useNavigate } from "react-router";

// ⬇️ use the Pixi manager + SceneEntry from your Pixi scene module
import { usePixiManager } from "../../pixi/PixiGameManager"; // adjust the path if needed
import type { SceneEntry } from "../../pixi/PixiScene"; // adjust the path if needed

import { getSceneLink } from "../../utils/reactUtils";

interface SceneComponentProps {
    entry: SceneEntry;
}

const GameScreen: React.FC<SceneComponentProps> = ({ entry: { name, SceneClass } }) => {
    const manager = usePixiManager();
    const initializedRef = useRef(false);

    // Canvases + wrapper
    const glCanvasRef = useRef<HTMLCanvasElement>(null);
    const debugCanvasRef = useRef<HTMLCanvasElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();

    // Boot + loop
    useEffect(() => {
        const glCanvas = glCanvasRef.current;
        const debugCanvas = debugCanvasRef.current;
        const wrapper = wrapperRef.current;

        if (glCanvas && debugCanvas && wrapper && !initializedRef.current) {
            initializedRef.current = true;

            const loop = (time: number) => {
                try {
                    manager.SimulationLoop(time);
                } catch (e) {
                    // A transient error in one frame must NOT kill the loop — otherwise the game
                    // freezes for good ("no units selected / not playable"). Log and keep going;
                    // the per-frame logic (e.g. next-unit selection) recovers on the next frame.
                    console.error("Error during simulation loop", e);
                } finally {
                    window.requestAnimationFrame(loop);
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
        </>
    );
};

// Helper to pick an active scene; adjust to your registry flow if needed.
import { useActiveSceneEntry } from "../hooks/useActiveSceneEntry";

export const Main: React.FC<{ entry?: SceneEntry }> = ({ entry: entryOverride }) => {
    const activeEntry = useActiveSceneEntry();
    const entry = entryOverride ?? activeEntry;
    return entry ? <GameScreen entry={entry} /> : <span />;
};
