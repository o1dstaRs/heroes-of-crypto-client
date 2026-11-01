import { getCreatureLevel } from "@heroesofcrypto/common";
import { Box, Sheet, Tooltip, Typography } from "@mui/joy";
import React from "react";

import { tf, useTranslation } from "../../i18n/i18n";
import { CreaturePortraitImage } from "../CreaturePortraitImage";
import { UNIT_ID_TO_NAME } from "../unit_ui_constants";
import { DraftBanSlash } from "./DraftBanSlash";

import {
    DRAFT_BAN_ICON_HEIGHT as BAN_ICON_HEIGHT,
    DRAFT_BAN_ICON_WIDTH as BAN_ICON_WIDTH,
    DRAFT_BAN_ICON_GAP as BAN_ICON_GAP,
    DRAFT_BAN_FRAME_WIDTH as BAN_FRAME_WIDTH,
    DRAFT_BAN_SIDE_OFFSET,
    DRAFT_BAN_TOP,
} from "./draftBanLayout";

/** Only group identities already authorized by the private draft stream. */
export const DraftBanSidebar: React.FC<{
    banned: readonly number[];
    side?: "left" | "right";
    maxHeight?: number;
}> = ({ banned, side = "right", maxHeight }) => {
    const { t } = useTranslation();
    const visible = [...new Set(banned)].filter((id) => !!UNIT_ID_TO_NAME[id]);
    const groups = [1, 2, 3, 4].flatMap((level) => {
        const ids = visible.filter((id) => getCreatureLevel(id) === level);
        return ids.length ? [{ level, ids }] : [];
    });
    return (
        <Box
            data-testid="draft-ban-placement"
            data-placement={side}
            sx={{
                position: "absolute",
                zIndex: 6,
                top: `${DRAFT_BAN_TOP}px`,
                [side]: `${-BAN_FRAME_WIDTH - DRAFT_BAN_SIDE_OFFSET}px`,
                width: `${BAN_FRAME_WIDTH}px`,
                height: "auto",
            }}
        >
            <Sheet
                component="section"
                aria-label={t("Banned creatures")}
                data-testid="draft-ban-summary"
                sx={{
                    display: "grid",
                    gridTemplateRows: "auto minmax(0, 1fr)",
                    gap: "8px",
                    width: "100%",
                    height: "auto",
                    maxHeight,
                    minHeight: 0,
                    overflow: "hidden",
                    p: `${BAN_ICON_GAP}px`,
                    bgcolor: "rgba(20,13,7,.9)",
                    color: "#efe4cc",
                    border: "1px solid rgba(211,166,91,.35)",
                    borderRadius: "8px",
                    boxSizing: "border-box",
                    boxShadow: "inset 0 0 0 2px #100c0877, 0 3px 12px #0008",
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
                {groups.length ? (
                    <Box
                        className="draft-ban-groups"
                        sx={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "8px",
                            minHeight: 0,
                            overflowY: "auto",
                            overflowX: "hidden",
                            overscrollBehavior: "contain",
                            scrollbarWidth: "thin",
                            scrollbarColor: "#b28a4d #140d07",
                            "&::-webkit-scrollbar": { width: "6px" },
                        }}
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
                                    borderTop: "1px solid #b28a4d55",
                                    pt: "5px",
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
                                        lineHeight: 1,
                                    }}
                                >
                                    <span>L{level}</span>
                                </Typography>
                                <Box
                                    component="ul"
                                    sx={{
                                        display: "grid",
                                        gridTemplateColumns: `repeat(2, ${BAN_ICON_WIDTH}px)`,
                                        gridTemplateRows: `repeat(${Math.ceil(ids.length / 2)}, ${BAN_ICON_HEIGHT}px)`,
                                        justifyItems: "end",
                                        gap: `${BAN_ICON_GAP}px`,
                                        "& > li:nth-of-type(even)": { justifySelf: "start" },
                                        minHeight: 0,
                                        m: 0,
                                        p: 0,
                                        listStyle: "none",
                                    }}
                                >
                                    {ids.map((id) => (
                                        <Tooltip
                                            key={id}
                                            title={t(UNIT_ID_TO_NAME[id])}
                                            variant="soft"
                                            placement="left"
                                        >
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
                                                    border: "1px solid rgba(187,83,70,.65)",
                                                    borderRadius: "4px",
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
                                                        borderRadius: "3px",
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
                ) : (
                    <Typography
                        className="draft-ban-empty"
                        level="body-sm"
                        sx={{ color: "#c0b7a6", fontSize: "12px", alignSelf: "start", textAlign: "center" }}
                    >
                        {t("Bans are revealed when each creature level opens.")}
                    </Typography>
                )}
            </Sheet>
        </Box>
    );
};
