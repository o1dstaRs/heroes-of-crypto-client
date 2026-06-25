import { TeamVals, TeamType } from "@heroesofcrypto/common";

import Box from "@mui/joy/Box";
import { motion } from "framer-motion";
import React from "react";

import { images } from "../../generated/image_imports";
import { IFightStatsSample } from "../../scenes/VisibleState";

// --- "Heroes" palette (matches the in-game tooltip / overlay aesthetic) ---
export const GREEN = "#46d160";
export const RED = "#ff5a5a";
export const GOLD = "#dcb158";
export const PARCHMENT = "#efe4cc";
export const WOOD_DARK = "#1c0d03";

export const imgSrc = (name: string): string | undefined => (images as Record<string, string>)[name];
export const teamColor = (team: TeamType): string => (team === TeamVals.LOWER ? GREEN : RED);
export const teamName = (team: TeamType): string => (team === TeamVals.LOWER ? "Green" : "Red");

const ChartW = 600;
const ChartH = 264;
const ML = 46;
const MR = 20;
const MT = 18;
const MB = 36;
const PLOT_W = ChartW - ML - MR;
const PLOT_H = ChartH - MT - MB;
const BASE_Y = MT + PLOT_H;

/**
 * Hand-rolled SVG chart of "% of each army killed over time". Used both in the
 * end-of-fight overlay and live in the ALT "up next" overlay.
 */
type FightStatsChartMetric = "casualties" | "damage";

export const CasualtyChart: React.FC<{
    series: IFightStatsSample[];
    drawDurationSec?: number;
    metric?: FightStatsChartMetric;
}> = ({ series, drawDurationSec = 1.1, metric = "casualties" }) => {
    const pts = series.length >= 2 ? series : series.length === 1 ? [series[0], series[0]] : [];
    const n = pts.length;
    if (!n) return null;

    const xFor = (i: number): number => ML + (n <= 1 ? 0 : (i / (n - 1)) * PLOT_W);
    const yFor = (pct: number): number => MT + (1 - Math.min(100, Math.max(0, pct)) / 100) * PLOT_H;

    const linePath = (acc: (s: IFightStatsSample) => number): string =>
        pts.map((s, i) => `${i ? "L" : "M"} ${xFor(i).toFixed(1)} ${yFor(acc(s)).toFixed(1)}`).join(" ");
    const areaPath = (acc: (s: IFightStatsSample) => number): string =>
        `${linePath(acc)} L ${xFor(n - 1).toFixed(1)} ${BASE_Y} L ${xFor(0).toFixed(1)} ${BASE_Y} Z`;

    const useDamage = metric === "damage";
    const accGreen = (s: IFightStatsSample): number =>
        useDamage ? (s.lowerDamagePct ?? s.lowerKilledPct) : s.lowerKilledPct;
    const accRed = (s: IFightStatsSample): number =>
        useDamage ? (s.upperDamagePct ?? s.upperKilledPct) : s.upperKilledPct;

    // Lap boundary ticks
    const lapTicks: { x: number; lap: number }[] = [];
    let prevLap = -1;
    pts.forEach((s, i) => {
        if (s.lap !== prevLap) {
            lapTicks.push({ x: xFor(i), lap: s.lap });
            prevLap = s.lap;
        }
    });
    const labelEvery = Math.max(1, Math.ceil(lapTicks.length / 8));

    const finalGreen = accGreen(pts[n - 1]);
    const finalRed = accRed(pts[n - 1]);

    return (
        <Box
            component="svg"
            viewBox={`0 0 ${ChartW} ${ChartH}`}
            sx={{ width: "100%", height: "auto", display: "block" }}
        >
            <defs>
                <linearGradient id="hocGreenGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={GREEN} stopOpacity={0.45} />
                    <stop offset="100%" stopColor={GREEN} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="hocRedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={RED} stopOpacity={0.45} />
                    <stop offset="100%" stopColor={RED} stopOpacity={0} />
                </linearGradient>
            </defs>

            {/* Horizontal gridlines + Y labels */}
            {[0, 25, 50, 75, 100].map((g) => (
                <g key={g}>
                    <line
                        x1={ML}
                        y1={yFor(g)}
                        x2={ML + PLOT_W}
                        y2={yFor(g)}
                        stroke={GOLD}
                        strokeOpacity={g === 0 ? 0.5 : 0.16}
                        strokeWidth={1}
                    />
                    <text x={ML - 8} y={yFor(g) + 4} textAnchor="end" fontSize={12} fill={PARCHMENT} opacity={0.75}>
                        {g}%
                    </text>
                </g>
            ))}

            {/* Lap ticks */}
            {lapTicks.map((t, i) => (
                <g key={`lap_${t.lap}`}>
                    <line x1={t.x} y1={MT} x2={t.x} y2={BASE_Y} stroke={GOLD} strokeOpacity={0.08} strokeWidth={1} />
                    {i % labelEvery === 0 && (
                        <text x={t.x} y={BASE_Y + 18} textAnchor="middle" fontSize={11} fill={PARCHMENT} opacity={0.6}>
                            L{t.lap}
                        </text>
                    )}
                </g>
            ))}

            {/* Areas */}
            <motion.path
                d={areaPath(accRed)}
                fill="url(#hocRedGrad)"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 1.0, delay: 0.2 }}
            />
            <motion.path
                d={areaPath(accGreen)}
                fill="url(#hocGreenGrad)"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 1.0, delay: 0.2 }}
            />

            {/* Lines */}
            <motion.path
                d={linePath(accRed)}
                fill="none"
                stroke={RED}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: drawDurationSec, ease: "easeInOut" }}
            />
            <motion.path
                d={linePath(accGreen)}
                fill="none"
                stroke={GREEN}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: drawDurationSec, ease: "easeInOut" }}
            />

            {/* Final value markers */}
            <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: drawDurationSec }}>
                <circle cx={xFor(n - 1)} cy={yFor(finalRed)} r={3.5} fill={RED} />
                <circle cx={xFor(n - 1)} cy={yFor(finalGreen)} r={3.5} fill={GREEN} />
            </motion.g>
        </Box>
    );
};

/** Compact two-team "% of army lost" readout with mini bars. */
export const CasualtyPercents: React.FC<{
    lowerKilledPct: number;
    upperKilledPct: number;
}> = ({ lowerKilledPct, upperKilledPct }) => {
    const rows: { team: TeamType; pct: number }[] = [
        { team: TeamVals.LOWER as TeamType, pct: lowerKilledPct },
        { team: TeamVals.UPPER as TeamType, pct: upperKilledPct },
    ];
    return (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75, width: "100%" }}>
            {rows.map(({ team, pct }) => {
                const color = teamColor(team);
                return (
                    <Box key={team} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Box component="span" sx={{ color, fontWeight: 700, fontSize: "0.8rem", width: 48 }}>
                            {teamName(team)}
                        </Box>
                        <Box sx={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.12)" }}>
                            <Box
                                sx={{
                                    width: `${Math.min(100, Math.max(0, pct))}%`,
                                    height: "100%",
                                    borderRadius: 4,
                                    backgroundColor: color,
                                    boxShadow: `0 0 6px ${color}`,
                                    transition: "width 0.4s ease",
                                }}
                            />
                        </Box>
                        <Box
                            component="span"
                            sx={{
                                color: PARCHMENT,
                                fontWeight: 700,
                                fontSize: "0.8rem",
                                width: 48,
                                textAlign: "right",
                            }}
                        >
                            {Math.round(pct)}%
                        </Box>
                    </Box>
                );
            })}
        </Box>
    );
};
