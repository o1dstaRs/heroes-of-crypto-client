/*
 * -----------------------------------------------------------------------------
 * This file is part of the browser implementation of the Heroes of Crypto game client.
 *
 * Heroes of Crypto and Heroes of Crypto AI are registered trademarks.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 * -----------------------------------------------------------------------------
 */

import { useLayoutEffect, useRef, useState } from "react";

/**
 * Last-resort "zoom out" for the unit card.
 *
 * Sizing alone cannot cover every case: a unit with eight abilities plus four buffs and four debuffs
 * simply needs more rows than a 768px-tall screen has, once the turn timer and the up-next queue have
 * taken their cut. Rather than growing a scrollbar (which hides the very stats the player is looking at),
 * the card is scaled down by exactly the shortfall.
 *
 * The transform does not re-run layout, so the measured height is stable and one pass settles it — no
 * oscillation between "fits" and "doesn't". Below `minScale` the shrink would stop being readable, so the
 * card keeps that size and the sidebar's own scroll container takes over — the "really tiny screen"
 * escape hatch.
 */
export function useFitScale(minScale = 0.6): {
    setViewport: (node: HTMLElement | null) => void;
    setContent: (node: HTMLElement | null) => void;
    scale: number;
    /** True once even `minScale` cannot fit the content: the block scrolls the remainder. */
    scrollable: boolean;
    /** Untransformed content height, so a scrolling caller can correct for the scale (see below). */
    naturalHeight: number;
} {
    const [viewport, setViewport] = useState<HTMLElement | null>(null);
    const [content, setContent] = useState<HTMLElement | null>(null);
    const [fit, setFit] = useState({ scale: 1, scrollable: false, naturalHeight: 0 });
    const frame = useRef<number | undefined>(undefined);

    useLayoutEffect(() => {
        if (!viewport || !content) return;

        const measure = () => {
            frame.current = undefined;
            const available = viewport.clientHeight;
            // scrollHeight is layout height: the CSS transform never feeds back into it, and content
            // overflowing the 100%-tall box is included, which is exactly the shortfall we need.
            const natural = content.scrollHeight;
            if (available <= 0 || natural <= 0) return;

            const needed = available / natural;
            // Below the floor, shrinking further stops being readable, so the block settles at the floor
            // and scrolls the remainder — showing as much as it legibly can rather than spilling over the
            // turn panel pinned underneath it.
            const next =
                needed >= 1
                    ? { scale: 1, scrollable: false, naturalHeight: natural }
                    : needed < minScale
                      ? { scale: minScale, scrollable: true, naturalHeight: natural }
                      : // Quantise so a one-pixel content jitter (a badge appearing, a lap number
                        // widening) does not trigger a visible re-scale every frame.
                        { scale: Math.round(needed * 100) / 100, scrollable: false, naturalHeight: natural };

            setFit((current) =>
                current.scrollable === next.scrollable &&
                Math.abs(current.scale - next.scale) < 0.011 &&
                Math.abs(current.naturalHeight - next.naturalHeight) < 2
                    ? current
                    : next,
            );
        };

        const schedule = () => {
            if (frame.current !== undefined) return;
            frame.current = window.requestAnimationFrame(measure);
        };

        const observer = new ResizeObserver(schedule);
        observer.observe(viewport);
        observer.observe(content);
        schedule();

        return () => {
            observer.disconnect();
            if (frame.current !== undefined) {
                window.cancelAnimationFrame(frame.current);
                frame.current = undefined;
            }
        };
    }, [viewport, content, minScale]);

    return {
        setViewport,
        setContent,
        scale: fit.scale,
        scrollable: fit.scrollable,
        naturalHeight: fit.naturalHeight,
    };
}
