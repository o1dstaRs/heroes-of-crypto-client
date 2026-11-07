import { Doctrine, getCreatureLevel } from "@heroesofcrypto/common";
import { Box, Sheet, Tooltip, Typography } from "@mui/joy";
import React from "react";

import { useTranslation } from "../../i18n/i18n";
import { CreaturePortraitImage } from "../CreaturePortraitImage";
import { UNIT_ID_TO_NAME } from "../unit_ui_constants";

/** The scouting summary uses only the bans authorized by the server. */
export const DraftBanSummary: React.FC<{
    banned: readonly number[];
    doctrine: number;
    layout?: "inline" | "strip" | "sidebar";
}> = ({ banned, doctrine, layout = "inline" }) => {
    const { t } = useTranslation();
    const sidebar = layout === "sidebar";
    const detached = layout !== "inline";
    if (doctrine !== Doctrine.Doctrine.THREE_REVEALS && doctrine !== Doctrine.Doctrine.SEE_ALL) return null;
    const visible = [...new Set(banned)]
        .filter((id) => !!UNIT_ID_TO_NAME[id] && getCreatureLevel(id) >= 1)
        .sort((left, right) => getCreatureLevel(left) - getCreatureLevel(right));
    if (!visible.length) return null;
    return (
        <Sheet
            component="section"
            aria-label={t("Banned creatures")}
            data-testid="draft-ban-summary"
            sx={{
                display: "grid",
                gridTemplateColumns: sidebar ? "minmax(0, 1fr)" : "112px minmax(0, 1fr)",
                gridTemplateRows: sidebar ? "auto minmax(0, 1fr)" : undefined,
                alignItems: "center",
                gap: detached ? "8px" : "12px",
                width: "100%",
                height: detached ? "100%" : undefined,
                minHeight: detached ? 0 : "76px",
                flex: "0 0 auto",
                px: "12px",
                py: detached ? "6px" : "8px",
                bgcolor: "rgba(20,13,7,.88)",
                color: "#efe4cc",
                border: "1px solid rgba(211,166,91,.35)",
                borderRadius: "8px",
                boxSizing: detached ? "border-box" : undefined,
                boxShadow: detached ? "inset 0 0 0 2px #100c0877, 0 3px 12px #0008" : undefined,
            }}
        >
            <Typography
                component="h2"
                level="title-sm"
                sx={{
                    color: "#d3a65b",
                    lineHeight: 1.25,
                    textAlign: sidebar ? "center" : undefined,
                    fontSize: detached ? "12px" : undefined,
                }}
            >
                {t("Banned creatures")}
                <Box component="span" sx={{ display: "block", color: "#c0b7a6", fontSize: "12px", mt: "3px" }}>
                    {visible.length}
                </Box>
            </Typography>
            <Box
                component="ul"
                sx={{
                    display: sidebar ? "grid" : "flex",
                    gridTemplateColumns: sidebar ? "repeat(2, minmax(0, 1fr))" : undefined,
                    gridTemplateRows: sidebar ? `repeat(${Math.ceil(visible.length / 2)}, minmax(0, 1fr))` : undefined,
                    justifyItems: "center",
                    justifyContent: detached && !sidebar ? "space-evenly" : undefined,
                    flexWrap: detached ? "nowrap" : "wrap",
                    gap: detached ? "4px" : "6px",
                    minWidth: 0,
                    minHeight: 0,
                    height: sidebar ? "100%" : undefined,
                    m: 0,
                    p: 0,
                    listStyle: "none",
                }}
            >
                {visible.map((id) => (
                    <Tooltip key={id} title={t(UNIT_ID_TO_NAME[id])} variant="soft" placement="top">
                        <Box
                            component="li"
                            aria-label={t(UNIT_ID_TO_NAME[id])}
                            tabIndex={0}
                            sx={{
                                position: "relative",
                                width: sidebar ? "auto" : detached ? "35.2px" : "48px",
                                height: sidebar ? "100%" : detached ? "44px" : "60px",
                                aspectRatio: sidebar ? "4 / 5" : undefined,
                                maxWidth: "100%",
                                boxSizing: detached ? "border-box" : undefined,
                                flexShrink: 0,
                                overflow: "hidden",
                                border: "1px solid rgba(187,83,70,.65)",
                                borderRadius: "4px",
                                "&::after": {
                                    content: '\"\"',
                                    position: "absolute",
                                    inset: 0,
                                    pointerEvents: "none",
                                    background:
                                        "linear-gradient(135deg, transparent 47%, #c76b58 49%, #c76b58 51%, transparent 53%)",
                                },
                                "&:hover, &:focus-visible": {
                                    outline: "1px solid #d3a65b",
                                    outlineOffset: "1px",
                                },
                            }}
                        >
                            <CreaturePortraitImage
                                creatureId={id}
                                alt=""
                                sx={{ width: "100%", height: "100%", opacity: 0.75 }}
                            />
                        </Box>
                    </Tooltip>
                ))}
            </Box>
        </Sheet>
    );
};
