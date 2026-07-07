import React, { useCallback, useEffect, useRef, useState } from "react";
import Box from "@mui/joy/Box";
import { keyframes } from "@emotion/react";

/**
 * FightLog - a custom, animated combat chronicle that replaces the old read-only <Textarea>.
 *
 * The scene feeds us a single newline-joined string (newest line first). We diff it against the
 * previous render to find the freshly-prepended lines, give each a stable id, and let CSS animate
 * ONLY the new rows in: they slide down from above, fade up, and flash a warm ember highlight that
 * settles into a thin left accent bar. The panel scrolls (themed thin scrollbar) so the full history
 * is reachable, and a tiny corner button copies the whole log to the clipboard.
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

/** Copy text to clipboard, falling back to a hidden textarea if the async Clipboard API is blocked. */
const copyToClipboard = async (value: string): Promise<void> => {
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(value);
            return;
        }
    } catch {
        // fall through to the legacy path
    }
    const ta = document.createElement("textarea");
    ta.value = value;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
        document.execCommand("copy");
    } catch {
        // nothing else we can do; silently ignore
    }
    document.body.removeChild(ta);
};

export const FightLog = ({ text }: { text: string }) => {
    const [entries, setEntries] = useState<ILogEntry[]>([]);
    const [copied, setCopied] = useState(false);
    const prevLinesRef = useRef<string[]>([]);
    const idRef = useRef(0);
    const copyResetRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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

    useEffect(() => () => clearTimeout(copyResetRef.current), []);

    const handleCopy = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation();
            // Export oldest-first so a pasted log reads top-to-bottom in chronological order, even
            // though the panel shows newest-first.
            const chronological = splitLines(text).reverse().join("\n");
            if (!chronological) return;
            void copyToClipboard(chronological);
            setCopied(true);
            clearTimeout(copyResetRef.current);
            copyResetRef.current = setTimeout(() => setCopied(false), 1300);
        },
        [text],
    );

    const hasEntries = entries.length > 0;

    return (
        <Box sx={{ position: "relative", width: "100%" }}>
            {hasEntries && (
                <Box
                    component="button"
                    type="button"
                    onClick={handleCopy}
                    title={copied ? "Copied!" : "Copy fight log"}
                    aria-label="Copy fight log"
                    sx={{
                        position: "absolute",
                        top: "5px",
                        right: "9px",
                        zIndex: 2,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "20px",
                        height: "20px",
                        p: 0,
                        cursor: "pointer",
                        borderRadius: "5px",
                        border: `1px solid ${copied ? "rgba(120, 220, 120, 0.7)" : "rgba(255, 143, 0, 0.35)"}`,
                        backgroundColor: "rgba(8, 6, 4, 0.72)",
                        color: copied ? "rgb(130, 230, 130)" : "rgba(255, 167, 64, 0.75)",
                        opacity: 0.55,
                        transition: "opacity 0.15s ease, color 0.15s ease, border-color 0.15s ease",
                        "&:hover": {
                            opacity: 1,
                            color: copied ? "rgb(150, 240, 150)" : "#FFB347",
                            borderColor: copied ? "rgba(120, 220, 120, 0.9)" : "rgba(255, 143, 0, 0.7)",
                        },
                    }}
                >
                    {copied ? (
                        // check
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path
                                d="M20 6L9 17l-5-5"
                                stroke="currentColor"
                                strokeWidth="2.4"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                    ) : (
                        // copy
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="2" />
                            <path
                                d="M5 15V5a2 2 0 0 1 2-2h10"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                            />
                        </svg>
                    )}
                </Box>
            )}

            <Box
                sx={{
                    width: "100%",
                    minHeight: "56px",
                    maxHeight: "168px",
                    overflowY: "auto",
                    overflowX: "hidden",
                    // Contain wheel scrolling here so it doesn't bubble to the sidebar when over the log.
                    overscrollBehavior: "contain",
                    borderRadius: "8px",
                    border: "1px solid rgba(255, 143, 0, 0.32)",
                    // Dark ember well so the warm text glows against it.
                    background: "linear-gradient(180deg, rgba(20, 12, 6, 0.66) 0%, rgba(10, 7, 4, 0.78) 100%)",
                    boxShadow: "inset 0 0 18px rgba(0, 0, 0, 0.55)",
                    py: "4px",
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
                    entries.map((entry, idx) => (
                        <Box
                            key={entry.id}
                            sx={{
                                position: "relative",
                                // Leave room on the first row so the copy button never overlaps text.
                                pl: "10px",
                                pr: idx === 0 ? "34px" : "10px",
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
        </Box>
    );
};
