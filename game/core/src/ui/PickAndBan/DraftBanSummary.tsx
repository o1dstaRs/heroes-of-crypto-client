import { getCreatureLevel } from "@heroesofcrypto/common";
import { Box, Sheet, Tooltip, Typography } from "@mui/joy";
import React from "react";

import { tf, useTranslation } from "../../i18n/i18n";
import { CreaturePortraitImage } from "../CreaturePortraitImage";
import { UNIT_ID_TO_NAME } from "../unit_ui_constants";

/** Receives only the bans authorized by the server; unrevealed levels have no entries or labels. */
export const DraftBanSummary: React.FC<{ banned: readonly number[] }> = ({ banned }) => {
    const { t } = useTranslation();
    const visible = [...new Set(banned)].filter((id) => !!UNIT_ID_TO_NAME[id] && getCreatureLevel(id) >= 1);
    const groups = [1, 2, 3, 4].flatMap((level) => {
        const ids = visible.filter((id) => getCreatureLevel(id) === level);
        return ids.length ? [{ level, ids }] : [];
    });
    return (
        <Sheet
            component="section"
            aria-label={t("Banned creatures")}
            data-testid="draft-ban-summary"
            sx={{
                display: "grid",
                gridTemplateColumns: `112px repeat(${groups.length || 1}, minmax(0, 1fr))`,
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
                {visible.length > 0 && (
                    <Box component="span" sx={{ display: "block", color: "#c0b7a6", fontSize: "12px", mt: "3px" }}>
                        {visible.length}
                    </Box>
                )}
            </Typography>
            {groups.length ? (
                groups.map(({ level, ids }) => (
                    <Box key={level} sx={{ minWidth: 0 }}>
                        <Typography level="body-xs" sx={{ color: "#c0b7a6", mb: "4px", fontSize: "12px" }}>
                            {tf("Level {level}", { level })}
                        </Typography>
                        <Box
                            component="ul"
                            sx={{ display: "flex", flexWrap: "wrap", gap: "4px", m: 0, p: 0, listStyle: "none" }}
                        >
                            {ids.map((id) => (
                                <Tooltip key={id} title={t(UNIT_ID_TO_NAME[id])} variant="soft" placement="top">
                                    <Box
                                        component="li"
                                        aria-label={t(UNIT_ID_TO_NAME[id])}
                                        tabIndex={0}
                                        sx={{
                                            position: "relative",
                                            width: "32px",
                                            height: "40px",
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
                    </Box>
                ))
            ) : (
                <Typography level="body-sm" sx={{ color: "#c0b7a6" }}>
                    {t("Bans are revealed when each creature level opens.")}
                </Typography>
            )}
        </Sheet>
    );
};
