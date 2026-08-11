import Avatar from "@mui/joy/Avatar";
import Box from "@mui/joy/Box";
import Stack from "@mui/joy/Stack";
import Tooltip from "@mui/joy/Tooltip";
import Typography from "@mui/joy/Typography";
import { motion } from "framer-motion";
import React from "react";

import { IFightDamageEntry } from "../../scenes/VisibleState";
import { GOLD, PARCHMENT, WOOD_DARK, imgSrc, teamColor, teamName } from "./CasualtyChart";

const fmt = (n: number): string => Math.round(n).toLocaleString("en-US");

/** One creature: icon, name, share-of-the-best bar, damage number. */
const DamageRow: React.FC<{ entry: IFightDamageEntry; max: number; index: number }> = ({ entry, max, index }) => {
    const color = teamColor(entry.team);
    // Bars are relative to the single best performer of the fight, so the two armies stay
    // directly comparable on one scale (a per-team scale would make a losing army look equal).
    const share = max > 0 ? Math.max(0, entry.damage / max) : 0;
    const src = entry.smallTextureName ? imgSrc(entry.smallTextureName) : undefined;

    return (
        <Tooltip
            title={`${entry.name} (${teamName(entry.team)}): ${fmt(entry.damage)} damage dealt`}
            placement="top"
            sx={{
                backgroundColor: "#2d1606",
                border: `2px solid ${GOLD}`,
                color: PARCHMENT,
                zIndex: 10001,
            }}
        >
            <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", py: 0.4 }}>
                {src ? (
                    <Avatar
                        src={src}
                        variant="plain"
                        sx={{
                            width: 34,
                            height: 34,
                            flexShrink: 0,
                            borderRadius: "14%",
                            border: "none",
                            boxShadow: "none",
                        }}
                    />
                ) : (
                    <Box
                        sx={{
                            width: 34,
                            height: 34,
                            flexShrink: 0,
                            borderRadius: "14%",
                            border: "none",
                            boxShadow: "none",
                            backgroundColor: WOOD_DARK,
                            color,
                            fontWeight: 800,
                            fontSize: "0.9rem",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                        }}
                    >
                        {entry.name.charAt(0).toUpperCase()}
                    </Box>
                )}

                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" sx={{ alignItems: "baseline", gap: 1 }}>
                        <Typography
                            sx={{
                                color: GOLD,
                                fontWeight: 700,
                                fontSize: "0.82rem",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                            }}
                        >
                            {entry.name}
                        </Typography>
                        <Typography
                            sx={{
                                color,
                                fontWeight: 800,
                                fontSize: "0.82rem",
                                ml: "auto",
                                flexShrink: 0,
                                opacity: entry.damage > 0 ? 1 : 0.45,
                            }}
                        >
                            {fmt(entry.damage)}
                        </Typography>
                    </Stack>
                    <Box
                        sx={{
                            mt: 0.4,
                            height: 8,
                            position: "relative",
                            mx: 1.25,
                            border: "2px solid #6b3a10",
                            backgroundColor: "rgba(4,3,2,.72)",
                            boxShadow: "inset 0 0 0 1px rgba(205,128,35,.18), 0 1px 2px rgba(0,0,0,.65)",
                            "&::before": {
                                content: '\"\"',
                                position: "absolute",
                                left: -7,
                                top: "50%",
                                width: 9,
                                height: 9,
                                transform: "translateY(-50%) rotate(45deg)",
                                backgroundColor: "#17100a",
                                border: "2px solid #6b3a10",
                                boxSizing: "border-box",
                                zIndex: 2,
                            },
                            "&::after": {
                                content: '\"\"',
                                position: "absolute",
                                right: -7,
                                top: "50%",
                                width: 9,
                                height: 9,
                                transform: "translateY(-50%) rotate(45deg)",
                                backgroundColor: "#17100a",
                                border: "2px solid #6b3a10",
                                boxSizing: "border-box",
                                zIndex: 2,
                            },
                        }}
                    >
                        <Box
                            component={motion.div}
                            initial={{ width: 0 }}
                            animate={{ width: `${share * 100}%` }}
                            transition={{ duration: 0.7, delay: 0.1 + Math.min(index, 12) * 0.04, ease: "easeOut" }}
                            sx={{
                                height: "100%",
                                position: "relative",
                                zIndex: 1,
                                backgroundColor: color,
                                boxShadow: `inset 0 1px rgba(255,255,255,.35), 0 0 5px ${color}88`,
                            }}
                        />
                    </Box>
                </Box>
            </Stack>
        </Tooltip>
    );
};

/** How many rows a column shows before it starts scrolling, and what one row measures. */
const VISIBLE_ROWS = 6;
const ROW_HEIGHT_PX = 40;

/** Slim bronze scrollbar, the same one the fight log and the sidebar wells use. */
const scrollSx = {
    overscrollBehavior: "contain",
    scrollbarWidth: "thin",
    scrollbarColor: "rgba(255, 143, 0, 0.35) transparent",
    "&::-webkit-scrollbar": { width: "6px" },
    "&::-webkit-scrollbar-track": { background: "transparent" },
    "&::-webkit-scrollbar-thumb": { backgroundColor: "rgba(255, 143, 0, 0.32)", borderRadius: "3px" },
    "&::-webkit-scrollbar-thumb:hover": { backgroundColor: "rgba(255, 143, 0, 0.55)" },
} as const;

/**
 * Per-creature damage breakdown for the end-of-fight overlay: every creature that was
 * fielded, both armies on one scale, ordered by damage dealt.
 */
export const DamageBreakdown: React.FC<{ entries: IFightDamageEntry[] }> = ({ entries }) => {
    if (!entries.length) {
        return (
            <Typography sx={{ color: PARCHMENT, opacity: 0.6, fontStyle: "italic", fontSize: "0.82rem" }}>
                No damage was dealt.
            </Typography>
        );
    }

    const max = entries.reduce((acc, e) => Math.max(acc, e.damage), 0);
    // Split into two balanced columns, keeping the descending order top-to-bottom per column.
    const half = Math.ceil(entries.length / 2);
    const columns = [entries.slice(0, half), entries.slice(half)].filter((c) => c.length > 0);
    // Past this the columns scroll instead of growing. The block sits between the chart and the roster in a
    // card of fixed height, so a long list used to push the roster down onto the action buttons — and the
    // more creatures a fight had, the further everything below it moved. Six rows is what a full army needs.
    const overflows = columns.some((column) => column.length > VISIBLE_ROWS);

    return (
        <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={{ xs: 0, md: 3 }}
            sx={{
                position: "relative",
                alignItems: "flex-start",
                ...(columns.length > 1
                    ? {
                          "&::before": {
                              content: '\"\"',
                              position: "absolute",
                              top: 3,
                              bottom: 3,
                              left: "50%",
                              width: "1px",
                              transform: "translateX(-50%)",
                              display: { xs: "none", md: "block" },
                              background:
                                  "linear-gradient(180deg, transparent, rgba(184,119,54,.7) 26%, rgba(184,119,54,.7) 74%, transparent)",
                              boxShadow: "0 0 5px rgba(190,111,42,.2)",
                              pointerEvents: "none",
                          },
                      }
                    : {}),
            }}
        >
            {columns.map((column, ci) => (
                <Box
                    key={`dmgcol_${ci}`}
                    sx={{
                        flex: 1,
                        minWidth: 0,
                        width: "100%",
                        // Both columns take the cap together, even when only one is over it, so the two stay
                        // the same height and the block below them never sits at an angle.
                        ...(overflows
                            ? { maxHeight: `${VISIBLE_ROWS * ROW_HEIGHT_PX}px`, overflowY: "auto", ...scrollSx }
                            : {}),
                    }}
                >
                    {column.map((entry, i) => (
                        <DamageRow key={`${entry.team}_${entry.name}`} entry={entry} max={max} index={ci * half + i} />
                    ))}
                </Box>
            ))}
        </Stack>
    );
};
