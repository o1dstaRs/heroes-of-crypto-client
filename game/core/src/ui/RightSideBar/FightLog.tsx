import React, { useEffect, useMemo, useRef, useState } from "react";
import Box from "@mui/joy/Box";
import { keyframes } from "@emotion/react";

import { groupFightLogEntries } from "./fightLogGrouping";

/**
 * FightLog - a custom, animated combat chronicle that replaces the old read-only <Textarea>.
 *
 * The scene feeds us a single newline-joined string (newest line first). We diff it against the
 * previous render to find the freshly-prepended lines, give each a stable id, and let CSS animate
 * ONLY the new rows in: they slide down from above, fade up, and flash a warm ember highlight that
 * settles into a thin left accent bar. The panel scrolls (themed thin scrollbar) so the full history
 * remains reachable.
 *
 * The flat list renders GROUPED BY TURN: the scenes emit a marked header line whenever the active
 * unit changes ("⌖ 🟢 Fairy — Lap 2"), and groupFightLogEntries folds the stream into turn cards —
 * newest turn on top, each card's actions reading chronologically under its header.
 */

// New row drops in from above and fades up.
const rowAppear = keyframes`
  from { opacity: 0; transform: translateY(-9px); }
  to   { opacity: 1; transform: translateY(0); }
`;

// Warm ember highlight that flares on arrival then cools to a faint left accent.
const emberFlash = keyframes`
  0%   { background-color: rgba(255, 143, 0, 0.30); box-shadow: inset 3px 0 0 0 rgba(255, 170, 40, 0.95); }
  60%  { background-color: rgba(255, 143, 0, 0.10); }
  100% { background-color: rgba(255, 143, 0, 0.00); box-shadow: inset 2px 0 0 0 rgba(255, 143, 0, 0.22); }
`;

interface ILogEntry {
    id: number;
    text: string;
}

// Render the WHOLE fight (owner call 2026-08-01: the log must scroll back to the first event —
// the old 60-row cap silently discarded everything older). The bound is a runaway backstop only:
// real fights produce a few hundred lines, far below it.
const MAX_ENTRIES = 5000;

const splitLines = (text: string): string[] => (text ? text.split("\n").filter((l) => l.length > 0) : []);
const formatFightLogLine = (text: string): string => text.replace(/\bto\s*\(/gi, "TO (");

export const FightLog = ({ text }: { text: string }) => {
    const [entries, setEntries] = useState<ILogEntry[]>([]);
    const prevLinesRef = useRef<string[]>([]);
    const idRef = useRef(0);

    useEffect(() => {
        const lines = splitLines(text);
        const prev = prevLinesRef.current;
        prevLinesRef.current = lines;

        if (lines.length === 0) {
            setEntries([]);
            return;
        }

        const rebuildAll = (): void => {
            const rebuilt = lines.slice(0, MAX_ENTRIES).map((t) => ({ id: idRef.current++, text: t }));
            setEntries(rebuilt);
        };

        // Newest-first: any growth is prepended at the front. The old lines should still be a suffix
        // of the new list - if they aren't (log cleared / reset between fights), rebuild from scratch.
        const newCount = lines.length - prev.length;
        if (newCount < 0) {
            rebuildAll();
            return;
        }
        for (let i = 0; i < prev.length; i++) {
            if (lines[i + newCount] !== prev[i]) {
                rebuildAll();
                return;
            }
        }
        if (newCount === 0) {
            return;
        }
        const fresh = lines.slice(0, newCount).map((t) => ({ id: idRef.current++, text: t }));
        setEntries((curr) => [...fresh, ...curr].slice(0, MAX_ENTRIES));
    }, [text]);

    const hasEntries = entries.length > 0;
    const groups = useMemo(() => groupFightLogEntries(entries, (entry) => entry.text), [entries]);
    const newestEntryId = entries[0]?.id;

    return (
        // Grows upward into the bar's spare height, stopping under the button column. The 168px floor lives
        // here rather than on the well inside: put it on the well and a short sidebar hands this box less
        // than that, the well overruns it, and the log spills over the controls below. On the box, the
        // whole block simply stops shrinking and the sidebar scrolls.
        <Box
            sx={{
                position: "relative",
                width: "100%",
                flex: "1 1 auto",
                minHeight: "168px",
                display: "flex",
                flexDirection: "column",
                textTransform: "uppercase",
            }}
        >
            <Box
                sx={{
                    width: "100%",
                    // Sized by the bar, never by its contents: the well used to start at 56px and grow to
                    // 168px as entries arrived, which nudged everything around it for the first few turns
                    // of every fight. It now opens at whatever height the block above hands it and simply
                    // fills up. The floor lives on that block, so here it must be free to shrink to it.
                    flex: "1 1 auto",
                    minHeight: 0,
                    overflowY: "auto",
                    overflowX: "hidden",
                    // Contain wheel scrolling here so it doesn't bubble to the sidebar when over the log.
                    overscrollBehavior: "contain",
                    border: "none",
                    // Near-black worn leather behind the chronicle, matching the selected concept while
                    // leaving the raised turn plaques and bronze event rail readable at sidebar scale.
                    background:
                        "radial-gradient(ellipse at 50% 0%, rgba(62, 37, 16, .14), transparent 52%), linear-gradient(180deg, rgba(10, 8, 6, .92), rgba(5, 5, 4, .96))",
                    boxShadow: "inset 0 0 22px rgba(0, 0, 0, 0.78)",
                    py: "5px",
                    // Thin, themed scrollbar (no chunky default, no resize grip).
                    scrollbarWidth: "thin",
                    scrollbarColor: "rgba(124, 78, 27, .82) transparent",
                    "&::-webkit-scrollbar": { width: "6px" },
                    "&::-webkit-scrollbar-track": { background: "transparent" },
                    "&::-webkit-scrollbar-thumb": {
                        backgroundColor: "rgba(124, 78, 27, .82)",
                        borderRadius: "3px",
                        border: "1px solid rgba(205, 151, 67, .26)",
                    },
                    "&::-webkit-scrollbar-thumb:hover": { backgroundColor: "rgba(158, 101, 35, .9)" },
                }}
            >
                {!hasEntries ? (
                    <Box
                        sx={{
                            px: "10px",
                            py: "8px",
                            fontSize: "10px",
                            fontStyle: "italic",
                            letterSpacing: "0.04em",
                            color: "rgba(255, 143, 0, 0.4)",
                            userSelect: "none",
                        }}
                    >
                        Fight log
                    </Box>
                ) : (
                    groups.map((group, groupIdx) => (
                        <Box
                            key={group.headerEntry?.id ?? group.entries[0]?.id ?? `tail-${groupIdx}`}
                            sx={{ pb: "4px" }}
                        >
                            {group.headerEntry && (
                                <Box
                                    sx={{
                                        position: "relative",
                                        mt: groupIdx === 0 ? 0 : "5px",
                                        mx: "5px",
                                        px: "10px",
                                        pr: "28px",
                                        py: "5px",
                                        fontSize: "10.5px",
                                        fontWeight: 700,
                                        lineHeight: 1.3,
                                        letterSpacing: "0.05em",
                                        color: "#d9b36c",
                                        whiteSpace: "normal",
                                        wordBreak: "break-word",
                                        // One even leather fill from edge to edge. A horizontal fade made the
                                        // right half look unpainted beside the richer brown behind the label.
                                        backgroundColor: "#311d0f",
                                        backgroundImage: "none",
                                        border: "1px solid rgba(118, 76, 30, .86)",
                                        boxShadow:
                                            "inset 0 1px 0 rgba(220, 177, 88, .13), inset 0 0 12px rgba(0,0,0,.56), 0 1px 3px rgba(0,0,0,.72)",
                                        "&::after": {
                                            content: '"⌄"',
                                            position: "absolute",
                                            right: "10px",
                                            top: "50%",
                                            transform: "translateY(-58%)",
                                            fontSize: "13px",
                                            fontWeight: 400,
                                            color: "rgba(205,151,67,.72)",
                                        },
                                        // The plaque keeps its carved shadow after arriving; the regular ember
                                        // animation replaces box-shadow, so headers use only the drop-in motion.
                                        animation: `${rowAppear} 280ms cubic-bezier(0.22, 1, 0.36, 1)`,
                                    }}
                                >
                                    {group.headerLabel}
                                </Box>
                            )}
                            {group.entries.map((entry) => (
                                <Box
                                    key={entry.id}
                                    sx={{
                                        position: "relative",
                                        // Turn rows sit indented under their header, hanging off a faint
                                        // rail; the pre-turn block (no header) keeps the flush layout.
                                        pl: group.headerEntry ? "23px" : "10px",
                                        ml: group.headerEntry ? "14px" : 0,
                                        borderLeft: group.headerEntry ? "1px solid rgba(148, 98, 37, .72)" : "none",
                                        pr: "10px",
                                        py: "3px",
                                        fontSize: "10.5px",
                                        lineHeight: 1.32,
                                        letterSpacing: "0.015em",
                                        color: "rgba(220, 177, 100, .94)",
                                        whiteSpace: "normal",
                                        wordBreak: "break-word",
                                        ...(group.headerEntry
                                            ? {
                                                  "&::before": {
                                                      content: '""',
                                                      position: "absolute",
                                                      left: "-4px",
                                                      top: "50%",
                                                      width: "7px",
                                                      height: "7px",
                                                      borderRadius: "50%",
                                                      border: "1px solid rgba(205,151,67,.78)",
                                                      background:
                                                          "radial-gradient(circle, #d6a44b 0 24%, #3c270f 28% 58%, #0c0905 62%)",
                                                      boxShadow: "0 0 0 1px rgba(0,0,0,.72)",
                                                      transform: "translateY(-50%)",
                                                  },
                                              }
                                            : {}),
                                        // The very newest line glows a touch hotter than the rest.
                                        ...(entry.id === newestEntryId
                                            ? {
                                                  color: "#FFB347",
                                                  textShadow: "0 0 6px rgba(255, 143, 0, 0.45)",
                                              }
                                            : {}),
                                        // Only freshly-mounted rows run the entrance + ember flash; existing rows
                                        // keep their key, so React never remounts them and they stay calm.
                                        animation: `${rowAppear} 280ms cubic-bezier(0.22, 1, 0.36, 1), ${emberFlash} 1200ms ease-out`,
                                    }}
                                >
                                    {formatFightLogLine(entry.text)}
                                </Box>
                            ))}
                        </Box>
                    ))
                )}
            </Box>
        </Box>
    );
};
