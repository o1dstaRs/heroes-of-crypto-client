import { getCreatureLevel } from "@heroesofcrypto/common";
import { Box, Sheet, Tooltip, Typography } from "@mui/joy";
import React from "react";

import { tf, useTranslation } from "../../i18n/i18n";
import { CreaturePortraitImage } from "../CreaturePortraitImage";
import { UNIT_ID_TO_NAME } from "../unit_ui_constants";
import { DraftBanSlash } from "./DraftBanSlash";

// The full ban list previously rendered 51.6px portraits inside its fixed-height rail.
const BAN_ICON_HEIGHT = Number((51.6 * 1.15).toFixed(2));
const BAN_ICON_WIDTH = BAN_ICON_HEIGHT * 0.8;
const BAN_ICON_GAP = 2;
const BAN_FRAME_WIDTH = BAN_ICON_WIDTH * 2 + BAN_ICON_GAP * 3 + 2;

/** Only group identities already authorized by the private draft stream. */
export const DraftBanSidebar: React.FC<{
    banned: readonly number[];
    side?: "left" | "right";
}> = ({ banned, side = "right" }) => {
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
                top: "96px",
                [side]: `${-BAN_FRAME_WIDTH - 18}px`,
                width: `${BAN_FRAME_WIDTH}px`,
                height: "auto",
                // Keep the standard creature grid when the window has no side gutter.
                "@media (max-aspect-ratio: 3/2)": {
                    left: "22px",
                    right: "22px",
                    top: { xs: "72px", md: "132px" },
                    width: "auto",
                    height: { xs: "40px", md: "58px" },
                    "& > section": { gridTemplateColumns: "104px minmax(0, 1fr)", gridTemplateRows: "1fr", py: "5px" },
                    "& .draft-ban-heading": { flexDirection: "column", gap: 0, fontSize: "11px" },
                    "& .draft-ban-groups": { display: "flex", flexDirection: "row", gap: "8px" },
                    "& .draft-ban-group": {
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        borderTop: 0,
                        borderLeft: "1px solid #b28a4d44",
                        pl: "8px",
                        pt: 0,
                    },
                    "& .draft-ban-level": {
                        flexDirection: "column",
                        justifyContent: "center",
                        flexShrink: 0,
                        gap: "2px",
                    },
                    "& ul": { display: "flex", justifyContent: "space-evenly", flex: 1, gap: "3px" },
                    "& li": { width: { xs: "22.4px", md: "35.2px" }, height: { xs: "28px", md: "44px" } },
                    "& .draft-ban-empty": { alignSelf: "center", fontSize: "11px" },
                },
            }}
        >
            <Sheet
                component="section"
                aria-label={t("Banned creatures")}
                data-testid="draft-ban-summary"
                sx={{
                    display: "grid",
                    gridTemplateRows: "auto auto",
                    gap: "8px",
                    width: "100%",
                    height: "100%",
                    minHeight: 0,
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
                        sx={{ display: "flex", flexDirection: "column", gap: "8px", minHeight: 0 }}
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
