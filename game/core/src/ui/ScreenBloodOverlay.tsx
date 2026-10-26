import React, { useEffect, useRef, useState } from "react";

import { pointInGameElement, readGameViewport } from "../viewport/gameViewport";
import { useGameLayout } from "./mobile/GameViewport";
import { t } from "../i18n/i18n";
import { usePixiManager } from "../pixi/PixiGameManager";
import { ScreenBloodCanvas } from "./screenBloodCanvas";

/** Zena's screen splatter is personal to the struck seat and never takes input away from the board. */
export const ScreenBloodOverlay: React.FC = () => {
    const manager = usePixiManager();
    const { touch } = useGameLayout();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [active, setActive] = useState(false);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        let hasBlood = false;
        const blood = new ScreenBloodCanvas(canvas, (next) => {
            hasBlood = next;
            setActive(next);
        });
        const resize = () => {
            const { width, height } = canvas.getBoundingClientRect();
            blood.resize(
                readGameViewport().touch ? canvas.clientWidth : width,
                readGameViewport().touch ? canvas.clientHeight : height,
            );
        };
        resize();
        const observer = new ResizeObserver(resize);
        observer.observe(canvas);
        const wipe = (event: PointerEvent) => {
            if (!hasBlood) return;
            const bounds = canvas.getBoundingClientRect();
            const point = pointInGameElement(
                event.clientX,
                event.clientY,
                bounds,
                canvas.clientWidth,
                canvas.clientHeight,
                readGameViewport().rotated,
            );
            blood.wipe(point.x, point.y);
        };
        const leave = () => blood.leave();
        // Hover wipes too. Passive window listeners preserve clicks, camera drags and unit selection.
        window.addEventListener("pointermove", wipe, { passive: true });
        window.addEventListener("pointerdown", wipe, { passive: true });
        window.addEventListener("blur", leave);
        document.documentElement.addEventListener("pointerleave", leave);
        const connections = [
            manager.onScreenBlood.connect((impacts) => blood.splash(impacts)),
            manager.onLoadingChanged.connect((loading) => {
                if (loading) blood.clear();
            }),
            manager.onHasStarted.connect((started) => {
                // Live snapshots also emit `true` after every action; the blood must survive those.
                if (!started) blood.clear();
            }),
            manager.onVisibleStateUpdated.connect((state) => {
                if (state.hasFinished || state.replayPlaybackActive) blood.clear();
            }),
        ];
        return () => {
            connections.forEach((connection) => connection.disconnect());
            observer.disconnect();
            window.removeEventListener("pointermove", wipe);
            window.removeEventListener("pointerdown", wipe);
            window.removeEventListener("blur", leave);
            document.documentElement.removeEventListener("pointerleave", leave);
            blood.clear();
        };
    }, [manager]);

    return (
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 2, overflow: "hidden" }}>
            <canvas ref={canvasRef} aria-hidden="true" style={{ width: "100%", height: "100%", display: "block" }} />
            {active && (
                <div
                    role="status"
                    style={{
                        position: "absolute",
                        bottom: touch ? 84 : 28,
                        left: "50%",
                        transform: "translateX(-50%)",
                        padding: "7px 14px",
                        border: "1px solid rgba(171, 91, 75, 0.4)",
                        borderRadius: 4,
                        background: "rgba(25, 10, 12, 0.86)",
                        color: "#edc5b6",
                        fontSize: 12,
                        letterSpacing: "0.02em",
                        whiteSpace: "nowrap",
                    }}
                >
                    {touch ? t("Swipe to wipe away the blood") : "Move your mouse to wipe away the blood"}
                </div>
            )}
        </div>
    );
};
