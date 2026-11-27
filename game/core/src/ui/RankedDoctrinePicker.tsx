import { Doctrine } from "@heroesofcrypto/common";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import { Box, Sheet, Tooltip, Typography } from "@mui/joy";
import React, { useId } from "react";

import { tf, useTranslation } from "../i18n/i18n";
import { DoctrineIcon } from "./DoctrineIcon";
import { getDoctrineCopy } from "./doctrineCopy";
import { hocColors, hocDisplayFontFamily } from "./hocTheme";
import { useMediaQuery } from "./hooks/useMediaQuery";

const DOCTRINES = [...Doctrine.DOCTRINE_LIST].sort((a, b) => a.upgradePoints - b.upgradePoints);
const POINTER_HOVER = "(hover: hover) and (pointer: fine)";

export const RankedDoctrinePicker: React.FC<{
    selected: Doctrine.Doctrine;
    onSelect: (doctrine: Doctrine.Doctrine) => void;
}> = ({ selected, onSelect }) => {
    const id = useId();
    const { t } = useTranslation();
    const canHover = useMediaQuery(POINTER_HOVER);
    const title = t("Choose your doctrine");

    return (
        <Box component="section" aria-labelledby={id} sx={{ minWidth: 0 }}>
            <Typography
                id={id}
                level="title-sm"
                sx={{
                    mb: { xs: 0.9, lg: 1.25 },
                    color: hocColors.sidebarTitle,
                    fontFamily: hocDisplayFontFamily,
                    fontWeight: 400,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                }}
            >
                {title}
            </Typography>
            <Box
                role="radiogroup"
                aria-labelledby={id}
                sx={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: { xs: 0.65, sm: 1 } }}
            >
                {DOCTRINES.map((doctrine) => {
                    const checked = selected === doctrine.id;
                    const copy = getDoctrineCopy(doctrine.id);
                    const label = t(doctrine.name);
                    const budget = tf("{count} upgrade pts", { count: doctrine.upgradePoints });
                    const summary = t(copy?.revealSummary ?? doctrine.description);
                    const descriptionId = `${id}-${doctrine.id}`;
                    const card = (
                        <Sheet
                            component="label"
                            variant="outlined"
                            sx={{
                                display: "flex",
                                alignItems: "center",
                                flexDirection: "column",
                                justifyContent: "center",
                                gap: { xs: 0.45, sm: 0.65 },
                                position: "relative",
                                minWidth: 0,
                                minHeight: canHover ? { xs: 112, lg: 154 } : { xs: 112, sm: 120 },
                                px: { xs: 0.55, sm: 1.25 },
                                py: { xs: 1, sm: 1.25 },
                                boxSizing: "border-box",
                                borderRadius: "8px",
                                cursor: "pointer",
                                borderColor: checked ? hocColors.gold : "rgba(138,98,61,0.65)",
                                background: checked
                                    ? "linear-gradient(160deg, #54340d, #2b190d 72%)"
                                    : "linear-gradient(160deg, #1d1711, #0d0b08 74%)",
                                boxShadow: checked ? "inset 0 1px rgba(255,229,170,0.18)" : "none",
                                "&:active": { filter: "brightness(1.18)" },
                                [`@media ${POINTER_HOVER}`]: {
                                    "&:hover": { borderColor: hocColors.gold },
                                },
                                "&:has(input:focus-visible)": {
                                    outline: `2px solid ${hocColors.gold}`,
                                    outlineOffset: 2,
                                },
                                "@media (max-height: 480px)": {
                                    minHeight: 92,
                                    py: 0.7,
                                    gap: 0.3,
                                    "& img": { width: 32 },
                                },
                            }}
                        >
                            <Box
                                component="input"
                                type="radio"
                                name={id}
                                value={doctrine.id}
                                checked={checked}
                                aria-label={label}
                                aria-describedby={descriptionId}
                                onChange={() => onSelect(doctrine.id)}
                                sx={{
                                    position: "absolute",
                                    inset: 0,
                                    width: "100%",
                                    height: "100%",
                                    margin: 0,
                                    opacity: 0,
                                    cursor: "pointer",
                                    touchAction: "manipulation",
                                    WebkitTapHighlightColor: "transparent",
                                }}
                            />
                            {checked && (
                                <CheckCircleRoundedIcon
                                    aria-hidden="true"
                                    sx={{ position: "absolute", top: 6, right: 6, fontSize: 16, color: hocColors.gold }}
                                />
                            )}
                            <DoctrineIcon
                                doctrineId={doctrine.id}
                                sx={{
                                    width: { xs: 36, sm: 46, lg: canHover ? 56 : 46 },
                                    height: "auto",
                                    aspectRatio: "1",
                                }}
                            />
                            <Typography
                                component="span"
                                level="title-sm"
                                sx={{
                                    color: hocColors.parchment,
                                    fontFamily: hocDisplayFontFamily,
                                    fontWeight: 400,
                                    fontSize: { xs: "0.8rem", sm: "0.95rem" },
                                    lineHeight: 1.18,
                                    overflowWrap: "anywhere",
                                }}
                            >
                                {label}
                            </Typography>
                            <Box component="span" id={descriptionId} sx={{ display: "grid", gap: 0.3, width: "100%" }}>
                                <Typography
                                    component="span"
                                    level="body-xs"
                                    sx={{ color: hocColors.gold, fontWeight: 700 }}
                                >
                                    {budget}
                                </Typography>
                                <Typography component="span" level="body-xs" sx={{ color: hocColors.mutedStrong }}>
                                    {summary}
                                </Typography>
                            </Box>
                        </Sheet>
                    );

                    return canHover && copy ? (
                        <Tooltip
                            key={doctrine.id}
                            title={
                                <Box sx={{ display: "grid", gap: 0.75, p: 0.5 }}>
                                    <Typography level="title-sm" sx={{ color: "common.white" }}>
                                        {label}
                                    </Typography>
                                    <Typography level="body-xs" sx={{ color: "common.white" }}>
                                        {t(copy.detail)}
                                    </Typography>
                                    <Typography level="body-xs" sx={{ color: hocColors.gold }}>
                                        {t(copy.budget)}
                                    </Typography>
                                    <Typography level="body-xs" sx={{ color: "common.white", opacity: 0.85 }}>
                                        {t(copy.why)}
                                    </Typography>
                                </Box>
                            }
                            variant="soft"
                            placement="top"
                            arrow
                            enterDelay={150}
                            disableTouchListener
                            describeChild
                            sx={{ maxWidth: 340, bgcolor: "rgba(12,14,18,0.97)" }}
                        >
                            {card}
                        </Tooltip>
                    ) : (
                        <React.Fragment key={doctrine.id}>{card}</React.Fragment>
                    );
                })}
            </Box>
        </Box>
    );
};
