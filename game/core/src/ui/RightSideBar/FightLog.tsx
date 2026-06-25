import React, { useEffect, useRef, useState } from "react";
import Box from "@mui/joy/Box";
import { keyframes } from "@emotion/react";

/**
 * FightLog - a custom, animated combat chronicle that replaces the old read-only <Textarea>.
 *
 * The scene feeds us a single newline-joined string (newest line first). We diff it against the
 * previous render to find the freshly-prepended lines, give each a stable id, and let CSS animate
 * ONLY the new rows in: they slide down from above, fade up, and flash a warm ember highlight that
 * settles into a thin left accent bar. Older lines dim toward the bottom via a mask gradient, so the
 * panel reads like a glowing battle log rather than a text field with scrollbars/resize grips.
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

// Cap the rendered rows: a long fight produces a lot of lines and we only ever see the newest.
const MAX_ENTRIES = 60;

const splitLines = (text: string): string[] => (text ? text.split("\n").filter((l) => l.length > 0) : []);

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

    return (
        <Box
            sx={{
                width: "100%",
                minHeight: "56px",
                maxHeight: "168px",
                overflowY: "auto",
                overflowX: "hidden",
                borderRadius: "8px",
                border: "1px solid rgba(255, 143, 0, 0.32)",
                // Dark ember well so the warm text glows against it.
                background: "linear-gradient(180deg, rgba(20, 12, 6, 0.66) 0%, rgba(10, 7, 4, 0.78) 100%)",
                boxShadow: "inset 0 0 18px rgba(0, 0, 0, 0.55)",
                py: "4px",
                // Fade the oldest rows toward the bottom so the list dissolves instead of hard-cutting.
                maskImage: "linear-gradient(180deg, #000 78%, transparent 100%)",
                WebkitMaskImage: "linear-gradient(180deg, #000 78%, transparent 100%)",
                // Thin, themed scrollbar (no chunky default, no resize grip).
                scrollbarWidth: "thin",
                scrollbarColor: "rgba(255, 143, 0, 0.35) transparent",
                "&::-webkit-scrollbar": { width: "6px" },
                "&::-webkit-scrollbar-track": { background: "transparent" },
                "&::-webkit-scrollbar-thumb": {
                    backgroundColor: "rgba(255, 143, 0, 0.32)",
                    borderRadius: "3px",
                },
                "&::-webkit-scrollbar-thumb:hover": { backgroundColor: "rgba(255, 143, 0, 0.55)" },
            }}
        >
            {entries.length === 0 ? (
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
                entries.map((entry, idx) => (
                    <Box
                        key={entry.id}
                        sx={{
                            position: "relative",
                            px: "10px",
                            py: "2.5px",
                            fontSize: "10.5px",
                            lineHeight: 1.32,
                            letterSpacing: "0.015em",
                            color: "rgba(255, 167, 64, 0.92)",
                            whiteSpace: "normal",
                            wordBreak: "break-word",
                            // The very newest line glows a touch hotter than the rest.
                            ...(idx === 0
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
                        {entry.text}
                    </Box>
                ))
            )}
        </Box>
    );
};
