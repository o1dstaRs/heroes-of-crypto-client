import Box from "@mui/joy/Box";
import { motion } from "framer-motion";
import React from "react";

import { IFightStatsSample } from "../../scenes/VisibleState";
import { t, useTranslation } from "../../i18n/i18n";
import { GOLD, GREEN, PARCHMENT, RED } from "./CasualtyChart";

const DEFAULT_CHART_W = 600;
const DEFAULT_CHART_H = 264;
const ML = 46;
const MR = 20;
const MT = 18;
const MB = 36;

/**
 * How much of the board each side still holds, as ONE line swinging around an even midline.
 *
 * Read as "who is winning, and by how much", which two rising casualty curves never quite said: those
 * answer "how much has each side lost" and leave the comparison to the eye. Here the fight opens dead
 * level on 50 and the line climbs toward whoever has more army left — green up, red down — so the shape
 * of the line IS the story of the fight.
 *
 * Share is computed from each side's REMAINING percentage of its OWN starting health, then normalised
 * against the pair. Normalising per side is what guarantees the 50/50 open: armies are built to a supply
 * budget, not to equal hit points, so raw health would start the line off-centre and read as a lead
 * nobody had earned.
 */
export const boardSharePct = (sample: IFightStatsSample): number => {
    // Prefer health; fall back to surviving head-count for series recorded before HP was tracked.
    const left = sample.leftHpPct ?? 100 - sample.leftKilledPct;
    const right = sample.rightHpPct ?? 100 - sample.rightKilledPct;
    const total = left + right;
    // Both sides wiped in the same instant: nobody holds the board, so the line stays where it started.
    if (total <= 0) {
        return 50;
    }
    return Math.min(100, Math.max(0, (left / total) * 100));
};

export const BoardShareChart: React.FC<{
    series: IFightStatsSample[];
    drawDurationSec?: number;
    viewWidth?: number;
    viewHeight?: number;
}> = ({ series, drawDurationSec = 1.1, viewWidth = DEFAULT_CHART_W, viewHeight = DEFAULT_CHART_H }) => {
    useTranslation();
    const ChartW = Math.max(ML + MR + 40, viewWidth);
    const ChartH = Math.max(MT + MB + 30, viewHeight);
    const PLOT_W = ChartW - ML - MR;
    const PLOT_H = ChartH - MT - MB;

    // A single sample would be a dot; doubling it draws the flat opening line the fight actually had.
    const pts = series.length >= 2 ? series : series.length === 1 ? [series[0], series[0]] : [];
    const n = pts.length;
    if (!n) return null;

    const xFor = (i: number): number => ML + (n <= 1 ? 0 : (i / (n - 1)) * PLOT_W);
    const yFor = (pct: number): number => MT + (1 - Math.min(100, Math.max(0, pct)) / 100) * PLOT_H;
    const MID_Y = yFor(50);

    const shares = pts.map(boardSharePct);
    const linePath = shares.map((s, i) => `${i ? "L" : "M"} ${xFor(i).toFixed(1)} ${yFor(s).toFixed(1)}`).join(" ");
    // Closed back along the midline, so the fill is the GAP between the line and even — the visual weight
    // is the size of the lead, not the distance from the floor.
    const areaPath = `${linePath} L ${xFor(n - 1).toFixed(1)} ${MID_Y.toFixed(1)} L ${xFor(0).toFixed(1)} ${MID_Y.toFixed(1)} Z`;

    const lapTicks: { x: number; lap: number }[] = [];
    let prevLap = -1;
    pts.forEach((s, i) => {
        if (s.lap !== prevLap) {
            lapTicks.push({ x: xFor(i), lap: s.lap });
            prevLap = s.lap;
        }
    });
    const labelEvery = Math.max(1, Math.ceil(lapTicks.length / 8));

    return (
        <Box
            component="svg"
            viewBox={`0 0 ${ChartW} ${ChartH}`}
            sx={{ width: "100%", height: "auto", display: "block" }}
        >
            <defs>
                {/* Both gradients fade toward the midline, so the fill is densest where the lead is widest. */}
                <linearGradient id="hocShareGreenGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={GREEN} stopOpacity={0.5} />
                    <stop offset="100%" stopColor={GREEN} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="hocShareRedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={RED} stopOpacity={0} />
                    <stop offset="100%" stopColor={RED} stopOpacity={0.5} />
                </linearGradient>
                {/* Above the midline the area is green, below it red — one path, clipped into two halves. */}
                <clipPath id="hocShareAbove">
                    <rect x={ML} y={MT} width={PLOT_W} height={Math.max(0, MID_Y - MT)} />
                </clipPath>
                <clipPath id="hocShareBelow">
                    <rect x={ML} y={MID_Y} width={PLOT_W} height={Math.max(0, MT + PLOT_H - MID_Y)} />
                </clipPath>
            </defs>

            {[0, 25, 50, 75, 100].map((g) => (
                <g key={g}>
                    <line
                        x1={ML}
                        y1={yFor(g)}
                        x2={ML + PLOT_W}
                        y2={yFor(g)}
                        stroke={GOLD}
                        strokeOpacity={g === 50 ? 0.55 : 0.14}
                        strokeWidth={g === 50 ? 1.5 : 1}
                        strokeDasharray={g === 50 ? "5 4" : undefined}
                    />
                    <text x={ML - 8} y={yFor(g) + 4} textAnchor="end" fontSize={12} fill={PARCHMENT} opacity={0.75}>
                        {g}%
                    </text>
                </g>
            ))}

            {lapTicks.map((tick, i) => (
                <g key={`lap_${tick.lap}`}>
                    <line
                        x1={tick.x}
                        y1={MT}
                        x2={tick.x}
                        y2={MT + PLOT_H}
                        stroke={GOLD}
                        strokeOpacity={0.08}
                        strokeWidth={1}
                    />
                    {i % labelEvery === 0 && (
                        <text
                            x={tick.x}
                            y={MT + PLOT_H + 18}
                            textAnchor="middle"
                            fontSize={11}
                            fill={PARCHMENT}
                            opacity={0.6}
                        >
                            L{tick.lap}
                        </text>
                    )}
                </g>
            ))}

            <motion.path
                d={areaPath}
                fill="url(#hocShareGreenGrad)"
                clipPath="url(#hocShareAbove)"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 1.0, delay: 0.2 }}
            />
            <motion.path
                d={areaPath}
                fill="url(#hocShareRedGrad)"
                clipPath="url(#hocShareBelow)"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 1.0, delay: 0.2 }}
            />

            {/* The stroke is drawn TWICE and clipped at the midline, so each stretch wears the colour of
                whoever was ahead at that moment. Colouring the whole line by the eventual winner would
                paint the loser's early lead in the winner's colour and quietly rewrite the fight. */}
            {[
                { color: GREEN, clip: "url(#hocShareAbove)" },
                { color: RED, clip: "url(#hocShareBelow)" },
            ].map(({ color, clip }) => (
                <motion.path
                    key={color}
                    d={linePath}
                    fill="none"
                    stroke={color}
                    clipPath={clip}
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: drawDurationSec, ease: "easeOut" }}
                />
            ))}

            {/* Who each half of the plot belongs to, so the direction needs no legend. */}
            <text x={ML + 6} y={MT + 14} fontSize={11} fill={GREEN} opacity={0.8}>
                {t("Green")}
            </text>
            <text x={ML + 6} y={MT + PLOT_H - 5} fontSize={11} fill={RED} opacity={0.8}>
                {t("Red")}
            </text>
        </Box>
    );
};
