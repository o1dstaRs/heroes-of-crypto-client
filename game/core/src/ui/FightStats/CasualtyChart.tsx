import { TeamVals, TeamType } from "@heroesofcrypto/common";

import Box from "@mui/joy/Box";
import Tooltip from "@mui/joy/Tooltip";
import { motion } from "framer-motion";
import React, { useId } from "react";

import { IFightStatsSample } from "../../scenes/VisibleState";
import { t, useTranslation } from "../../i18n/i18n";
import { creatureImgSrc, imgSrc } from "./creatureImage";

// --- "Heroes" palette (matches the in-game tooltip / overlay aesthetic) ---
export const GREEN = "#46d160";
export const RED = "#ff5a5a";
export const GOLD = "#dcb158";
export const PARCHMENT = "#efe4cc";
export const WOOD_DARK = "#1c0d03";

const teamValues = TeamVals as unknown as Record<string, number>;
const LOWER_TEAM = (teamValues.LEFT ?? teamValues.LOWER ?? 2) as TeamType;

export { creatureImgSrc, imgSrc };
export const teamColor = (team: TeamType): string => (team === LOWER_TEAM ? GREEN : RED);
export const teamName = (team: TeamType): string => t(team === LOWER_TEAM ? "Green" : "Red");

const DEFAULT_CHART_W = 600;
const DEFAULT_CHART_H = 264;
const ML = 46;
const MR = 20;
const MT = 18;
const MB = 36;

/**
 * Hand-rolled SVG chart of "% of each army killed over time". Used both in the
 * end-of-fight overlay and live in the ALT "up next" overlay.
 */
type FightStatsChartMetric = "casualties" | "damage";

export const CasualtyChart: React.FC<{
    series: IFightStatsSample[];
    drawDurationSec?: number;
    metric?: FightStatsChartMetric;
    /**
     * viewBox size. Defaults keep every existing caller pixel-identical; a caller that owns a box of
     * its own passes ITS pixel size, so the viewBox matches the box 1:1 — the plot then fills the box
     * exactly with no letterboxing, and the axis labels stay at their intended size instead of being
     * scaled up or down with the drawing.
     */
    viewWidth?: number;
    viewHeight?: number;
}> = ({
    series,
    drawDurationSec = 1.1,
    metric = "casualties",
    viewWidth = DEFAULT_CHART_W,
    viewHeight = DEFAULT_CHART_H,
}) => {
    useTranslation();
    const eliminationClipPrefix = useId().replace(/[^a-zA-Z0-9_-]/g, "");
    const ChartW = Math.max(ML + MR + 40, viewWidth);
    const ChartH = Math.max(MT + MB + 30, viewHeight);
    const PLOT_W = ChartW - ML - MR;
    const PLOT_H = ChartH - MT - MB;
    const BASE_Y = MT + PLOT_H;

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
        useDamage ? (s.leftDamagePct ?? s.leftKilledPct) : s.leftKilledPct;
    const accRed = (s: IFightStatsSample): number =>
        useDamage ? (s.rightDamagePct ?? s.rightKilledPct) : s.rightKilledPct;

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
    const eliminationMarkers = pts.flatMap((sample, sampleIndex) => {
        // Every elimination gets a marker. A creature whose portrait cannot be resolved still draws its
        // crossed disc, so a death is never silently missing from the chart.
        const eliminations = (sample.eliminations ?? []).map((elimination) => ({
            elimination,
            imageSrc: creatureImgSrc(elimination.smallTextureName),
        }));
        const markerGap = 22;
        const markerRadius = 10;
        const availableLeft = ML + markerRadius;
        const availableRight = ML + PLOT_W - markerRadius;
        const groupSpan = Math.min(PLOT_W - markerRadius * 2, Math.max(0, eliminations.length - 1) * markerGap);
        const groupCenter = Math.min(
            availableRight - groupSpan / 2,
            Math.max(availableLeft + groupSpan / 2, xFor(sampleIndex)),
        );

        return eliminations.map(({ elimination, imageSrc }, eliminationIndex) => {
            const casualtyPct = elimination.team === LOWER_TEAM ? accGreen(sample) : accRed(sample);
            return {
                elimination,
                imageSrc,
                pointX: xFor(sampleIndex),
                pointY: yFor(casualtyPct),
                centerX: groupCenter + (eliminationIndex - (eliminations.length - 1) / 2) * markerGap,
                centerY: yFor(casualtyPct),
                clipId: `${eliminationClipPrefix}-defeat-${sampleIndex}-${eliminationIndex}`,
                lap: sample.lap,
                sampleIndex,
                eliminationIndex,
            };
        });
    });

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
                {eliminationMarkers.map((marker) => (
                    <clipPath key={marker.clipId} id={marker.clipId}>
                        <circle cx={marker.centerX} cy={marker.centerY} r={8} />
                    </clipPath>
                ))}
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

            {/* A crossed portrait marks when every deployed stack of that creature type has fallen. */}
            {eliminationMarkers.map((marker, markerIndex) => {
                const color = teamColor(marker.elimination.team);
                const label = `${marker.elimination.name}: all stacks defeated on lap ${marker.lap}`;
                return (
                    <Tooltip
                        key={`${marker.sampleIndex}:${marker.elimination.creatureKey}:${marker.eliminationIndex}`}
                        title={label}
                        placement="top"
                        variant="solid"
                        enterDelay={120}
                        sx={{
                            zIndex: 10001,
                            border: `1px solid ${color}`,
                            backgroundColor: "#211208",
                            color: PARCHMENT,
                            fontWeight: 800,
                            boxShadow: "0 5px 18px rgba(0,0,0,.72)",
                        }}
                    >
                        <motion.g
                            role="img"
                            aria-label={label}
                            tabIndex={0}
                            style={{ cursor: "help", outline: "none" }}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: drawDurationSec + markerIndex * 0.06, duration: 0.2 }}
                        >
                            {(marker.pointX !== marker.centerX || marker.pointY !== marker.centerY) && (
                                <line
                                    x1={marker.pointX}
                                    y1={marker.pointY}
                                    x2={marker.centerX}
                                    y2={marker.centerY}
                                    stroke={color}
                                    strokeOpacity={0.65}
                                    strokeWidth={1}
                                    strokeDasharray="2 2"
                                />
                            )}
                            <circle
                                cx={marker.centerX}
                                cy={marker.centerY}
                                r={10}
                                fill={WOOD_DARK}
                                stroke="rgba(0,0,0,.9)"
                                strokeWidth={3}
                            />
                            {marker.imageSrc && (
                                <image
                                    href={marker.imageSrc}
                                    x={marker.centerX - 8}
                                    y={marker.centerY - 8}
                                    width={16}
                                    height={16}
                                    preserveAspectRatio="xMidYMid slice"
                                    clipPath={`url(#${marker.clipId})`}
                                />
                            )}
                            <circle
                                cx={marker.centerX}
                                cy={marker.centerY}
                                r={9}
                                fill="none"
                                stroke={color}
                                strokeWidth={1.5}
                            />
                            <circle
                                cx={marker.centerX + 7}
                                cy={marker.centerY + 7}
                                r={4.5}
                                fill={WOOD_DARK}
                                stroke={color}
                                strokeWidth={1}
                            />
                            <path
                                d={`M ${marker.centerX + 5} ${marker.centerY + 5} L ${marker.centerX + 9} ${marker.centerY + 9} M ${marker.centerX + 9} ${marker.centerY + 5} L ${marker.centerX + 5} ${marker.centerY + 9}`}
                                fill="none"
                                stroke={PARCHMENT}
                                strokeWidth={1.2}
                                strokeLinecap="round"
                            />
                        </motion.g>
                    </Tooltip>
                );
            })}

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
    leftKilledPct: number;
    rightKilledPct: number;
}> = ({ leftKilledPct, rightKilledPct }) => {
    useTranslation();
    const rows: { team: TeamType; pct: number }[] = [
        { team: LOWER_TEAM, pct: leftKilledPct },
        { team: (teamValues.RIGHT ?? teamValues.UPPER ?? 1) as TeamType, pct: rightKilledPct },
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
