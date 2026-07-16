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
    // react-router v7's useNavigate() returns a NEW function identity after every navigation (it is
    // memoized on the current pathname). It therefore must NOT be a dependency of the boot effect
    // below: with it in the deps, a same-tab route change (e.g. "Play Again vs AI" navigating from
    // /game/A to /game/B) re-ran the effect WITHOUT unmounting — cleanup called manager.Uninitialize()
    // (destroying the Pixi renderer, which force-loses the canvas's WebGL context via pixi's
    // GlContextSystem.destroy -> WEBGL_lose_context.loseContext()), then init() re-booted Pixi on the
    // SAME still-mounted canvas. getContext() then hands pixi back the same, permanently-lost context,
    // and pixi's GlLimitsSystem.contextChange -> checkMaxIfStatementsInShader spins forever (every
    // shader compile fails on a lost context and the maxIfs-halving loop can't exit once it reaches 0):
    // a TOTAL main-thread freeze of the tab (nightly QA #3's P0). Track the latest navigate in a ref
    // instead so the boot effect runs strictly once per canvas mount.
    const navigateRef = useRef(navigate);
    navigateRef.current = navigate;
    // Same reasoning for the active scene: scene switches are handled by the dedicated setScene effect
    // below (manager.setScene -> LoadGame rebuilds the scene on the LIVE pixi app). Rebooting Pixi on a
    // scene change would reuse the canvas and hit the same lost-context freeze.
    const entryRef = useRef({ name, SceneClass });
    entryRef.current = { name, SceneClass };

    // Boot + loop — strictly ONCE per canvas mount. Pixi may only ever initialize against a
    // freshly-created canvas element: a canvas that already hosted a destroyed Pixi renderer has a
    // force-lost WebGL context (see the navigateRef comment above).
    useEffect(() => {
        const glCanvas = glCanvasRef.current;
        const debugCanvas = debugCanvasRef.current;
        const wrapper = wrapperRef.current;
        let cancelled = false;
        let frameId = 0;

        if (glCanvas && debugCanvas && wrapper && !initializedRef.current) {
            initializedRef.current = true;
            manager.setScene(entryRef.current.name, entryRef.current.SceneClass);

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
                const setSceneInUrl = (test: SceneEntry) => navigateRef.current(getSceneLink(test));
                await manager.init(glCanvas, debugCanvas, wrapper, setSceneInUrl);
                if (cancelled) {
                    // This effect instance was already torn down while manager.init() was still in
                    // flight — its cleanup below already called manager.Uninitialize() unconditionally,
                    // so don't call it again here. manager is a process-wide singleton (PixiManagerContext
                    // holds one instance for the whole app), and by the time this async continuation
                    // resumes a NEWER mount may already have reinitialized it for the next match; a second
                    // Uninitialize() call here would tear down THAT instance instead of this stale one —
                    // wedging same-tab "Play Again" navigation (the Pixi canvas never re-initializes for
                    // the new game). manager.init()'s own lifecycle-id guards already self-destroy this
                    // stale local pixiApp if a newer init() call superseded it while we were awaiting.
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
        // navigate/name/SceneClass are intentionally NOT dependencies (read via refs above): they can
        // change while this mount is alive, and a teardown+re-init here would reuse the canvas whose
        // WebGL context the teardown just force-lost — freezing the tab in pixi's context re-init.
    }, [manager]);

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
