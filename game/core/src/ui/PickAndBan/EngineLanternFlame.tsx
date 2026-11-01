import React, { useEffect, useRef } from "react";
import { startLanternFireEngine, type LanternFireController } from "./lanternFireEngine";
import type { PickLanternFireTuning } from "./pickLanternFireTuning";

export function EngineLanternFlame({ tuning }: { tuning: PickLanternFireTuning }) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const light = useRef<HTMLDivElement>(null);
    const engine = useRef<LanternFireController | null>(null);
    useEffect(() => {
        if (!canvas.current) return;
        const renderer = startLanternFireEngine(canvas.current, light.current, {
            speed: 0.78,
            brightness: 1.1,
            opacity: 1,
        });
        engine.current = renderer;
        return () => {
            renderer.dispose();
            engine.current = null;
        };
    }, []);
    useEffect(() => {
        engine.current?.update({ speed: tuning.playbackRate, brightness: tuning.brightness, opacity: tuning.opacity });
    }, [tuning.playbackRate, tuning.brightness, tuning.opacity]);
    return (
        <>
            <div
                style={{
                    position: "absolute",
                    inset: 0,
                    opacity: Math.min(1, tuning.glowOpacity),
                    mixBlendMode: "screen",
                }}
            >
                <div
                    ref={light}
                    style={{
                        position: "absolute",
                        left: "50%",
                        bottom: "-12%",
                        width: `${tuning.glowSize * 150}%`,
                        height: `${tuning.glowSize * 110}%`,
                        transform: "translateX(-50%)",
                        background:
                            "radial-gradient(ellipse 2% 15% at 39% 76%, rgba(255,200,115,.32), transparent 100%), radial-gradient(ellipse 2% 13% at 61% 72%, rgba(255,174,75,.25), transparent 100%), radial-gradient(ellipse at 50% 68%, rgba(255,167,64,.7), rgba(244,87,12,.22) 35%, transparent 70%)",
                    }}
                />
            </div>
            <canvas
                ref={canvas}
                data-testid="lantern-engine-canvas"
                style={{ position: "absolute", left: "-30%", bottom: 0, width: "160%", height: "160%" }}
            />
            <style>{`[data-testid="lantern-engine-canvas"][data-renderer="fallback"] { background: radial-gradient(ellipse at 50% 72%, #fff0b5 0%, #ffb038 12%, #ef671090 26%, transparent 44%); background-size: 62.5% 62.5%; background-position: center bottom; background-repeat: no-repeat; }`}</style>
        </>
    );
}
