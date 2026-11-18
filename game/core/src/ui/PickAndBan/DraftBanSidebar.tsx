import { Doctrine, getCreatureLevel } from "@heroesofcrypto/common";
import { Box, Tooltip, Typography } from "@mui/joy";
import React from "react";

import { tf, useTranslation } from "../../i18n/i18n";
import { CreaturePortraitImage } from "../CreaturePortraitImage";
import { UNIT_ID_TO_NAME } from "../unit_ui_constants";
import { DraftBanSlash } from "./DraftBanSlash";

import {
    DRAFT_BAN_ICON_HEIGHT as BAN_ICON_HEIGHT,
    DRAFT_BAN_ICON_WIDTH as BAN_ICON_WIDTH,
    DRAFT_BAN_ICON_GAP as BAN_ICON_GAP,
    DRAFT_BAN_SIDE_OFFSET,
    DRAFT_BAN_TOP,
    draftBanRailWidth,
    type DraftBanColumns,
} from "./draftBanLayout";

/** Only group identities already authorized by the private draft stream. */
export const DraftBanSidebar: React.FC<{
    banned: readonly number[];
    doctrine: number;
    side?: "left" | "right";
    columns?: DraftBanColumns;
    maxHeight?: number;
}> = ({ banned, doctrine, side = "right", columns = 2, maxHeight }) => {
    const width = draftBanRailWidth(columns);
    const { t } = useTranslation();
    if (doctrine !== Doctrine.Doctrine.THREE_REVEALS && doctrine !== Doctrine.Doctrine.SEE_ALL) return null;
    const visible = [...new Set(banned)].filter((id) => !!UNIT_ID_TO_NAME[id]);
    const groups = [1, 2, 3, 4].flatMap((level) => {
        const ids = visible.filter((id) => getCreatureLevel(id) === level);
        return ids.length ? [{ level, ids }] : [];
    });
    if (!groups.length) return null;
    return (
        <Box
            data-testid="draft-ban-placement"
            data-placement={side}
            data-ban-columns={columns}
            sx={{
                position: "absolute",
                zIndex: 6,
                top: `${DRAFT_BAN_TOP}px`,
                maxHeight: maxHeight === undefined ? "calc(100% - 120px)" : `${maxHeight}px`,
                overflowY: "auto",
                overflowX: "hidden",
                scrollbarWidth: "thin",
                [side]: `${-width - DRAFT_BAN_SIDE_OFFSET}px`,
                width: `${width}px`,
                height: "auto",
            }}
        >
            <Box
                component="section"
                aria-label={t("Banned creatures")}
                data-testid="draft-ban-summary"
                sx={{
                    display: "grid",
                    gridTemplateRows: "auto auto",
                    gap: "12px",
                    width: "100%",
                    height: "auto",
                    minHeight: 0,
                    p: `${BAN_ICON_GAP}px`,
                    pb: "8px",
                    background: "linear-gradient(90deg, transparent, #100c0877 12%, #100c0877 88%, transparent)",
                    color: "#efe4cc",
                    boxSizing: "border-box",
                }}
            >
                <Typography
                    component="h2"
                    className="draft-ban-heading"
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "8px",
                        color: "#d3a65b",
                        fontSize: "11px",
                        lineHeight: 1.25,
                    }}
                >
                    BANS
                </Typography>
                <Box
                    className="draft-ban-groups"
                    sx={{ display: "flex", flexDirection: "column", gap: "12px", minHeight: 0 }}
                >
                    {groups.map(({ level, ids }) => (
                        <Box
                            key={level}
                            className="draft-ban-group"
                            role="group"
                            aria-label={tf("Level {level}", { level })}
                            data-ban-level={level}
                            sx={{
                                flex: "0 0 auto",
                                minHeight: 0,
                                minWidth: 0,
                                display: "grid",
                                gridTemplateRows: "14px auto",
                                gap: "4px",
                            }}
                        >
                            <Typography
                                className="draft-ban-level"
                                component="h3"
                                sx={{
                                    display: "flex",
                                    justifyContent: "center",
                                    alignItems: "center",
                                    color: "#d4bb8e",
                                    fontSize: "10px",
                                    letterSpacing: "1px",
                                    gap: "8px",
                                    "&::before, &::after": {
                                        content: '""',
                                        height: "1px",
                                        flex: 1,
                                        background: "linear-gradient(90deg, transparent, #b28a4d66, transparent)",
                                    },
                                    lineHeight: 1,
                                }}
                            >
                                <span>L{level}</span>
                            </Typography>
                            <Box
                                component="ul"
                                sx={{
                                    display: "grid",
                                    gridTemplateColumns: `repeat(${columns}, ${BAN_ICON_WIDTH}px)`,
                                    gridTemplateRows: `repeat(${Math.ceil(ids.length / columns)}, ${BAN_ICON_HEIGHT}px)`,
                                    justifyContent: "center",
                                    gap: `${BAN_ICON_GAP}px`,
                                    minHeight: 0,
                                    m: 0,
                                    p: 0,
                                    listStyle: "none",
                                }}
                            >
                                {ids.map((id) => (
                                    <Tooltip key={id} title={t(UNIT_ID_TO_NAME[id])} variant="soft" placement="left">
                                        <Box
                                            component="li"
                                            aria-label={t(UNIT_ID_TO_NAME[id])}
                                            tabIndex={0}
                                            sx={{
                                                position: "relative",
                                                width: `${BAN_ICON_WIDTH}px`,
                                                height: `${BAN_ICON_HEIGHT}px`,
                                                aspectRatio: "4 / 5",
                                                maxWidth: "100%",
                                                boxSizing: "border-box",
                                                flexShrink: 0,
                                                overflow: "visible",
                                                borderRadius: "8px",
                                                boxShadow: "0 2px 6px #0008",
                                                "&:hover, &:focus-visible": {
                                                    outline: "1px solid #d3a65b",
                                                    outlineOffset: "1px",
                                                },
                                            }}
                                        >
                                            <CreaturePortraitImage
                                                creatureId={id}
                                                alt=""
                                                sx={{
                                                    width: "100%",
                                                    height: "100%",
                                                    opacity: 0.75,
                                                    borderRadius: "8px",
                                                    zIndex: 1,
                                                    isolation: "isolate",
                                                }}
                                            />
                                            <DraftBanSlash />
                                        </Box>
                                    </Tooltip>
                                ))}
                            </Box>
                        </Box>
                    ))}
                </Box>
            </Box>
        </Box>
    );
};
