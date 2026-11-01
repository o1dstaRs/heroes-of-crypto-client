import { Doctrine, getCreatureLevel } from "@heroesofcrypto/common";
import { Box, Sheet, Tooltip, Typography } from "@mui/joy";
import React from "react";

import { useTranslation } from "../../i18n/i18n";
import { CreaturePortraitImage } from "../CreaturePortraitImage";
import { UNIT_ID_TO_NAME } from "../unit_ui_constants";

/** The scouting summary uses only the bans authorized by the server. */
export const DraftBanSummary: React.FC<{ banned: readonly number[]; doctrine: number }> = ({ banned, doctrine }) => {
    const { t } = useTranslation();
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
                gridTemplateColumns: "112px minmax(0, 1fr)",
                alignItems: "center",
                gap: "12px",
                width: "100%",
                minHeight: "76px",
                flex: "0 0 auto",
                px: "12px",
                py: "8px",
                bgcolor: "rgba(20,13,7,.88)",
                color: "#efe4cc",
                border: "1px solid rgba(211,166,91,.35)",
                borderRadius: "8px",
            }}
        >
            <Typography component="h2" level="title-sm" sx={{ color: "#d3a65b", lineHeight: 1.25 }}>
                {t("Banned creatures")}
                <Box component="span" sx={{ display: "block", color: "#c0b7a6", fontSize: "12px", mt: "3px" }}>
                    {visible.length}
                </Box>
            </Typography>
            <Box
                component="ul"
                sx={{ display: "flex", flexWrap: "wrap", gap: "6px", minWidth: 0, m: 0, p: 0, listStyle: "none" }}
            >
                {visible.map((id) => (
                    <Tooltip key={id} title={t(UNIT_ID_TO_NAME[id])} variant="soft" placement="top">
                        <Box
                            component="li"
                            aria-label={t(UNIT_ID_TO_NAME[id])}
                            tabIndex={0}
                            sx={{
                                position: "relative",
                                width: "48px",
                                height: "60px",
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
