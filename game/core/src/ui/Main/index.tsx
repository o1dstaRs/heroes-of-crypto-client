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

// Suppress native text/element selection on the game surface so a left-drag on the board never
// paints the browser's blue selection highlight over the render.
const noSelectStyle: React.CSSProperties = {
    userSelect: "none",
    WebkitUserSelect: "none",
    WebkitTouchCallout: "none",
};

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
        let cancelled = false;
        let frameId = 0;

        if (glCanvas && debugCanvas && wrapper && !initializedRef.current) {
            initializedRef.current = true;
            manager.setScene(name, SceneClass);

            const loop = (time: number) => {
                if (cancelled) {
                    return;
                }
                try {
                    manager.SimulationLoop(time);
                } catch (e) {
                    // A transient error in one frame must NOT kill the loop — otherwise the game
                    // freezes for good ("no units selected / not playable"). Log and keep going;
                    // the per-frame logic (e.g. next-unit selection) recovers on the next frame.
                    console.error("Error during simulation loop", e);
                } finally {
                    frameId = window.requestAnimationFrame(loop);
                }
            };

            const init = async () => {
                const setSceneInUrl = (test: SceneEntry) => navigate(getSceneLink(test));
                await manager.init(glCanvas, debugCanvas, wrapper, setSceneInUrl);
                if (cancelled) {
                    manager.Uninitialize();
                    return;
                }
                frameId = window.requestAnimationFrame(loop);
            };

            void init().catch((e) => console.error("Initialization failed", e));
        }

        return () => {
            cancelled = true;
            if (frameId) {
                window.cancelAnimationFrame(frameId);
            }
            initializedRef.current = false;
            manager.Uninitialize();
        };
    }, [manager, navigate, name, SceneClass]);

    // Switch active scene
    useEffect(() => {
        manager.setScene(name, SceneClass);
    }, [manager, name, SceneClass]);

    return (
        <>
            {/*
             * user-select / touch-callout are disabled on the canvases (and wrapper) so a left-drag
             * on the board can't start a native text/element selection — that would paint a
             * translucent blue selection highlight over the whole render ("whole render selected").
             */}
            <main ref={wrapperRef} style={{ position: "relative", width: "100%", height: "100%", ...noSelectStyle }}>
                {/* Pixi renders to glCanvas; debugCanvas is for picking/overlay input */}
                <canvas ref={glCanvasRef} style={{ position: "absolute", inset: 0, ...noSelectStyle }} />
                <canvas
                    ref={debugCanvasRef}
                    style={{ position: "absolute", inset: 0, pointerEvents: "auto", ...noSelectStyle }}
                />
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
