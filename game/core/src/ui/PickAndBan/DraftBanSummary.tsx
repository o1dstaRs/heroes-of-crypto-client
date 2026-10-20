import { getCreatureLevel } from "@heroesofcrypto/common";
import { Box, Sheet, Typography } from "@mui/joy";
import React from "react";

import { tf, useTranslation } from "../../i18n/i18n";
import { CreaturePortraitImage } from "../CreaturePortraitImage";
import { UNIT_ID_TO_NAME } from "../unit_ui_constants";

/** Receives only the bans authorized by the server; unrevealed levels have no entries or labels. */
export const DraftBanSummary: React.FC<{ banned: readonly number[] }> = ({ banned }) => {
    const { t } = useTranslation();
    const visible = [...new Set(banned)].filter((id) => !!UNIT_ID_TO_NAME[id] && getCreatureLevel(id) >= 1);
    return (
        <Box
            component="details"
            data-testid="draft-ban-summary"
            sx={{ position: "fixed", top: "1rem", right: "1rem", zIndex: 60 }}
        >
            <Box
                component="summary"
                sx={{
                    cursor: "pointer",
                    color: "#efe4cc",
                    bgcolor: "rgba(20,13,7,.94)",
                    border: "1px solid rgba(211,166,91,.4)",
                    borderRadius: "8px",
                    px: 1.5,
                    py: 0.8,
                    fontSize: 14,
                }}
            >
                {t("Banned creatures")}
                {visible.length > 0 ? ` (${visible.length})` : ""}
            </Box>
            <Sheet
                sx={{
                    position: "absolute",
                    right: 0,
                    mt: 1,
                    width: "min(430px, calc(100vw - 32px))",
                    maxHeight: "calc(100dvh - 90px)",
                    overflowY: "auto",
                    p: 2,
                    bgcolor: "#17100b",
                    color: "#efe4cc",
                    border: "1px solid rgba(211,166,91,.4)",
                    borderRadius: "10px",
                    boxShadow: "0 12px 40px rgba(0,0,0,.7)",
                }}
            >
                <Typography level="body-sm" sx={{ color: "#c0b7a6", mb: 1 }}>
                    {visible.length
                        ? t("Only revealed bans are shown.")
                        : t("Bans are revealed when each creature level opens.")}
                </Typography>
                {[1, 2, 3, 4].map((level) => {
                    const ids = visible.filter((id) => getCreatureLevel(id) === level);
                    return ids.length ? (
                        <Box key={level} sx={{ mt: 1.5 }}>
                            <Typography level="title-sm" sx={{ color: "#d3a65b", mb: 0.75 }}>
                                {tf("Level {level}", { level })}
                            </Typography>
                            <Box
                                component="ul"
                                sx={{
                                    display: "grid",
                                    gridTemplateColumns: "1fr 1fr",
                                    gap: 1,
                                    m: 0,
                                    p: 0,
                                    listStyle: "none",
                                }}
                            >
                                {ids.map((id) => (
                                    <Box
                                        component="li"
                                        key={id}
                                        sx={{ display: "flex", alignItems: "center", gap: 0.8, minWidth: 0 }}
                                    >
                                        <CreaturePortraitImage
                                            creatureId={id}
                                            alt=""
                                            sx={{
                                                width: 30,
                                                height: 40,
                                                objectFit: "cover",
                                                borderRadius: "4px",
                                                flexShrink: 0,
                                            }}
                                        />
                                        <Typography level="body-sm" sx={{ color: "inherit", overflowWrap: "anywhere" }}>
                                            {t(UNIT_ID_TO_NAME[id])}
                                        </Typography>
                                    </Box>
                                ))}
                            </Box>
                        </Box>
                    ) : null;
                })}
            </Sheet>
        </Box>
    );
};
