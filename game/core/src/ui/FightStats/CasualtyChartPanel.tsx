import Box from "@mui/joy/Box";
import React, { useLayoutEffect, useRef, useState } from "react";

import { IFightStatsSample } from "../../scenes/VisibleState";
import { BoardShareChart } from "./BoardShareChart";
import { GOLD } from "./CasualtyChart";

/** Below this the plot is more axis than data, so the panel hides rather than draw a sliver. */
const MIN_USEFUL_H = 96;

/** Fixed panel height. The chart holds this band whatever the fight looked like. */
export const CHART_PANEL_H = 170;

/**
 * The casualties-over-time chart in a container of its own, holding a FIXED band directly under the
 * winner banner. Fixed rather than "whatever is left" on purpose: every block of the results card
 * must land in the same place from fight to fight, so the card's spare room collects lower down
 * (between the damage stats and the roster) instead of changing this chart's size.
 *
 * The panel measures its own width and hands the chart ITS pixel size rather than letting the SVG
 * scale: a viewBox matching the box 1:1 fills the panel exactly — no letterboxing from
 * `preserveAspectRatio`, no stretched strokes or axis labels from `none`.
 */
export const CasualtyChartPanel: React.FC<{
    series: IFightStatsSample[];
    height?: number;
    ornateResultsFrame?: boolean;
}> = ({ series, height = CHART_PANEL_H, ornateResultsFrame = false }) => {
    const boxRef = useRef<HTMLDivElement | null>(null);
    const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

    useLayoutEffect(() => {
        const el = boxRef.current;
        if (!el) {
            return undefined;
        }
        // clientWidth/Height (the padding box) minus the padding ACTUALLY applied — read back from
        // the computed style rather than assumed, because the collapsed state drops the padding to
        // zero. Assuming a constant would make the measurement disagree with the layout by 16px
        // around the threshold and leave the panel flickering in and out of view there.
        const measure = (): void => {
            const cs = getComputedStyle(el);
            const w = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
            const h = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
            setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
        };

        // Measure once, synchronously, before the browser paints. The observer below only handles
        // LATER resizes — relying on its first callback would leave the panel blank on any host that
        // throttles observer delivery, and blank-until-resize is the one failure we cannot accept.
        measure();

        if (typeof ResizeObserver === "undefined") {
            return undefined;
        }
        const observer = new ResizeObserver(measure);
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    if (!series.length) {
        return null;
    }

    const innerW = Math.max(0, size.w);
    const innerH = Math.max(0, size.h);
    const roomy = innerH >= MIN_USEFUL_H;

    return (
        <Box
            ref={boxRef}
            sx={{
                height: `${height}px`,
                flexShrink: 0,
                overflow: "hidden",
                // The chart is taken OUT of flow below, so nothing inside can feed back into this
                // box's height — it is exactly `height`, measured once and never argued with.
                position: "relative",
                // Every LAYOUT property is constant; only colours react to `roomy`. A border or margin
                // that appeared together with the chart would change the box the chart was just
                // measured against, and only a ResizeObserver tick would ever reconcile the two.
                mb: 2,
                // No padding on purpose either — the chart insets its own plot with axis gutters.
                borderRadius: ornateResultsFrame ? "14px" : "10px",
                border: ornateResultsFrame
                    ? "2px solid rgba(145,104,67,.82)"
                    : `1px solid ${roomy ? `${GOLD}55` : "transparent"}`,
                backgroundColor: "transparent",
                boxShadow: ornateResultsFrame
                    ? "inset 0 0 0 1px rgba(12,9,7,.95), inset 0 0 0 3px rgba(79,68,58,.32), 0 3px 8px rgba(0,0,0,.58)"
                    : "none",
                ...(ornateResultsFrame && roomy
                    ? {
                          "&::before": {
                              content: '\"\"',
                              position: "absolute",
                              inset: "4px",
                              zIndex: 0,
                              pointerEvents: "none",
                              backgroundColor: "rgba(0,0,0,0.25)",
                              borderRadius: "10px",
                          },
                          "&::after": {
                              content: '""',
                              position: "absolute",
                              inset: "3px",
                              zIndex: 3,
                              pointerEvents: "none",
                              boxSizing: "border-box",
                              border: "1px solid rgba(52,44,38,.92)",
                              borderRadius: "11px",
                          },
                      }
                    : {}),
            }}
        >
            {roomy && innerW > 0 && (
                <Box sx={{ position: "absolute", inset: 0, zIndex: 1 }}>
                    <BoardShareChart series={series} viewWidth={innerW} viewHeight={innerH} drawDurationSec={1.1} />
                </Box>
            )}
        </Box>
    );
};
