import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { TeamType } from "@heroesofcrypto/common";

import { images } from "../../generated/image_imports";
import { hocDisplayFontFamily } from "../hocTheme";
import { advanceCreatureFlag, creatureFlagFraction } from "./creatureNameFlagState";
import { createCreatureNameFlagRenderer } from "./creatureNameFlagRenderer";
import { creatureNameFlagArtwork, creatureNameFlagPalette, creatureFlagPixelRatio } from "./creatureNameFlagPalette";
import type { ISidebarMetrics } from "./sidebarMetrics";

export const CreatureNameFlag: React.FC<{
    title: string;
    unitId: string;
    alive: number;
    died: number;
    metrics: ISidebarMetrics;
    team: TeamType;
}> = ({ title, unitId, alive, died, metrics, team }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const hostRef = useRef<HTMLDivElement>(null);
    const titleRef = useRef<HTMLSpanElement>(null);
    const fill = creatureFlagFraction(alive, died);
    const palette = useMemo(() => creatureNameFlagPalette(team), [team]);
    const target = useRef({ unitId, fill, palette });
    const filterId = `flag-team-${useId().replace(/:/g, "")}`;
    const wake = useRef<(() => void) | undefined>(undefined);
    const [ready, setReady] = useState(false);
    const [contextVersion, setContextVersion] = useState(0);
    const fontSize = metrics.sectionTitleRem * 1.45 * 16;
    const height = fontSize + 6;
    const artwork = creatureNameFlagArtwork();
    const source = images[artwork.cloth];

    useLayoutEffect(() => {
        target.current = { unitId, fill, palette };
        wake.current?.();
    }, [unitId, fill, palette]);

    useLayoutEffect(() => {
        const titleElement = titleRef.current;
        const host = hostRef.current;
        if (!titleElement || !host) return;
        const fit = () => {
            titleElement.style.fontSize = `${fontSize}px`;
            const room = Math.max(1, host.clientWidth - 38);
            titleElement.style.fontSize = `${Math.min(fontSize, (fontSize * room) / Math.max(1, titleElement.scrollWidth))}px`;
        };
        fit();
        const observer = new ResizeObserver(fit);
        observer.observe(host);
        document.fonts.addEventListener("loadingdone", fit);
        return () => {
            observer.disconnect();
            document.fonts.removeEventListener("loadingdone", fit);
        };
    }, [fontSize, title]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        setReady(false);
        let disposed = false;
        let frame = 0;
        let onscreen = true;
        let last = 0;
        let selected = target.current.unitId;
        let current = target.current.fill;
        let renderer: ReturnType<typeof createCreatureNameFlagRenderer>;
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
        const stop = () => {
            cancelAnimationFrame(frame);
            frame = 0;
            last = 0;
        };
        const draw = (now: number) => {
            frame = 0;
            if (disposed || !renderer || !onscreen || document.hidden) return;
            const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
            last = now;
            if (selected !== target.current.unitId || reduced.matches) {
                selected = target.current.unitId;
                current = target.current.fill;
            } else {
                current = advanceCreatureFlag(current, target.current.fill, dt);
            }
            renderer.draw(current, target.current.palette);
            if (!reduced.matches && current !== target.current.fill) frame = requestAnimationFrame(draw);
            else last = 0;
        };
        const schedule = () => {
            if (!frame && renderer && !disposed && onscreen && !document.hidden) frame = requestAnimationFrame(draw);
        };
        wake.current = schedule;
        const resize = () => {
            const bounds = canvas.getBoundingClientRect();
            const dpr = creatureFlagPixelRatio(window.devicePixelRatio || 1);
            canvas.width = Math.max(1, Math.round(bounds.width * dpr));
            canvas.height = Math.max(1, Math.round(bounds.height * dpr));
            schedule();
        };
        const resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(canvas);
        const intersectionObserver = new IntersectionObserver(([entry]) => {
            onscreen = entry.isIntersecting;
            if (onscreen) schedule();
            else stop();
        });
        intersectionObserver.observe(canvas);
        const visibility = () => {
            if (document.hidden) stop();
            else schedule();
        };
        const motionChanged = () => {
            stop();
            schedule();
        };
        const contextLost = (event: Event) => {
            event.preventDefault();
            stop();
            renderer = undefined;
            setReady(false);
        };
        const contextRestored = () => setContextVersion((version) => version + 1);
        canvas.addEventListener("webglcontextlost", contextLost);
        canvas.addEventListener("webglcontextrestored", contextRestored);
        document.addEventListener("visibilitychange", visibility);
        reduced.addEventListener("change", motionChanged);
        const image = new Image();
        image.onload = () => {
            if (disposed) return;
            renderer = createCreatureNameFlagRenderer(canvas, image);
            if (!renderer) return;
            resize();
            renderer.draw(current, target.current.palette);
            setReady(true);
        };
        image.src = source;
        return () => {
            disposed = true;
            stop();
            wake.current = undefined;
            image.onload = null;
            resizeObserver.disconnect();
            intersectionObserver.disconnect();
            document.removeEventListener("visibilitychange", visibility);
            reduced.removeEventListener("change", motionChanged);
            canvas.removeEventListener("webglcontextlost", contextLost);
            canvas.removeEventListener("webglcontextrestored", contextRestored);
            renderer?.dispose();
        };
    }, [source, contextVersion]);

    const artStyle: React.CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%" };
    return (
        <div
            ref={hostRef}
            data-creature-name-flag
            data-fill={fill}
            data-team={team}
            aria-label={`${title}: ${alive} / ${Math.max(0, alive) + Math.max(0, died || 0)}`}
            style={{ position: "relative", width: "94%", margin: "0 auto", height, pointerEvents: "none" }}
        >
            {!ready && (
                <div
                    aria-hidden="true"
                    style={{
                        ...artStyle,
                        top: "8%",
                        height: "84%",
                        opacity: 0.875,
                        clipPath: "inset(0 0 1% 0)",
                    }}
                >
                    <img alt="" src={source} style={{ ...artStyle, filter: "grayscale(1) brightness(.32)" }} />
                    <svg width="0" height="0" aria-hidden="true" style={{ position: "absolute" }}>
                        <filter id={filterId} colorInterpolationFilters="sRGB">
                            <feColorMatrix type="matrix" values="1 0 0 0 0  1 0 0 0 0  1 0 0 0 0  0 0 0 1 0" />
                            <feComponentTransfer>
                                <feFuncR type="linear" slope={1.35} intercept={0} />
                                <feFuncG type="linear" slope={1.35} intercept={0} />
                                <feFuncB type="linear" slope={1.35} intercept={0} />
                            </feComponentTransfer>
                        </filter>
                    </svg>
                    <div
                        style={{
                            ...artStyle,
                            background: palette.gradient,
                            filter: "brightness(2)",
                            maskImage: `url(${source})`,
                            maskSize: "100% 100%",
                            WebkitMaskImage: `url(${source})`,
                            WebkitMaskSize: "100% 100%",
                            clipPath: `inset(0 ${(1 - fill) * 100}% 0 0)`,
                        }}
                    >
                        <img
                            alt=""
                            src={source}
                            style={{ ...artStyle, filter: `url(#${filterId})`, mixBlendMode: "multiply" }}
                        />
                    </div>
                    <img alt="" src={images[artwork.hem]} style={artStyle} />
                </div>
            )}
            <canvas
                key={`${source}-${contextVersion}`}
                ref={canvasRef}
                aria-hidden="true"
                style={{ ...artStyle, top: "-18%", height: "136%", opacity: ready ? 0.875 : 0 }}
            />
            <span
                ref={titleRef}
                style={{
                    position: "absolute",
                    left: "50%",
                    // Centre the capital letters between the gold rails, accounting for the font’s lower leading.
                    top: "55%",
                    transform: "translate(-50%,-50%)",
                    fontFamily: hocDisplayFontFamily,
                    fontSize,
                    fontWeight: 800,
                    lineHeight: 1,
                    letterSpacing: "0.1331em",
                    whiteSpace: "nowrap",
                    color: "#ecd198",
                    textShadow: "0 1px 2px #140706, 0 0 3px #140706",
                    fontSynthesis: "weight",
                }}
            >
                {title}
            </span>
        </div>
    );
};
