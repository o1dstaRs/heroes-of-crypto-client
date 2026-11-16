import { Doctrine } from "@heroesofcrypto/common";
import { Box, Tooltip, Typography } from "@mui/joy";
import React, { useRef, useState } from "react";

import { t } from "../../i18n/i18n";
import { getPreGameDoctrine, setPreGameDoctrine } from "../../utils/preGameDoctrine";
import { DoctrineIcon } from "../DoctrineIcon";
import { getDoctrineCopy } from "../doctrineCopy";
import { HOC_GAME_FONT_FAMILY } from "../../fontFamilies";

const choices = [...Doctrine.DOCTRINE_LIST].sort((a, b) => a.upgradePoints - b.upgradePoints);

/** The next draft reads this same saved choice when its doctrine phase opens. */
export const NextAiDoctrinePicker: React.FC<{ disabled?: boolean }> = ({ disabled = false }) => {
    const [selected, setSelected] = useState(getPreGameDoctrine);
    const buttons = useRef<(HTMLButtonElement | null)[]>([]);
    const select = (id: Doctrine.Doctrine) => {
        if (disabled) return;
        setSelected(id);
        setPreGameDoctrine(id);
    };
    return (
        <Box sx={{ display: "grid", justifyItems: "center", gap: 0.6, mb: 1 }}>
            <Typography level="body-xs" sx={{ color: "#d8bd88", fontFamily: HOC_GAME_FONT_FAMILY }}>
                {t("Doctrine for next game")}
            </Typography>
            <Box role="radiogroup" aria-label={t("Doctrine for next AI game")} sx={{ display: "flex", gap: 1.5 }}>
                {choices.map((choice, index) => {
                    const letter = String.fromCharCode(65 + index);
                    const copy = getDoctrineCopy(choice.id);
                    const label = `${letter} · ${t(choice.name)}`;
                    return (
                        <Tooltip
                            key={choice.id}
                            placement="top"
                            arrow
                            enterDelay={100}
                            enterTouchDelay={0}
                            sx={{ maxWidth: 320, bgcolor: "#17130ff5", color: "#f0d7bd" }}
                            title={
                                <Box sx={{ display: "grid", gap: 0.75, p: 0.5 }}>
                                    <Typography level="title-sm" sx={{ color: "#ffdc8f" }}>
                                        {label}
                                    </Typography>
                                    <Typography level="body-xs" sx={{ color: "inherit" }}>
                                        {t(copy?.detail ?? choice.description)}
                                    </Typography>
                                    {copy && (
                                        <Typography level="body-xs" sx={{ color: "#ffdc8f" }}>
                                            {t(copy.budget)}
                                        </Typography>
                                    )}
                                </Box>
                            }
                        >
                            <Box
                                component="button"
                                type="button"
                                role="radio"
                                aria-label={label}
                                aria-checked={selected === choice.id}
                                disabled={disabled}
                                tabIndex={selected === choice.id ? 0 : -1}
                                ref={(element: HTMLButtonElement | null) => {
                                    buttons.current[index] = element;
                                }}
                                onClick={() => select(choice.id)}
                                onKeyDown={(event) => {
                                    const direction = ["ArrowRight", "ArrowDown"].includes(event.key)
                                        ? 1
                                        : ["ArrowLeft", "ArrowUp"].includes(event.key)
                                          ? -1
                                          : 0;
                                    if (!direction && event.key !== "Home" && event.key !== "End") return;
                                    event.preventDefault();
                                    const next =
                                        event.key === "Home"
                                            ? 0
                                            : event.key === "End"
                                              ? choices.length - 1
                                              : (index + direction + choices.length) % choices.length;
                                    select(choices[next].id);
                                    buttons.current[next]?.focus();
                                }}
                                sx={{
                                    display: "grid",
                                    justifyItems: "center",
                                    gap: 0.25,
                                    p: 0.5,
                                    border: "2px solid",
                                    borderColor: selected === choice.id ? "#ffd889" : "#745035",
                                    borderRadius: 6,
                                    bgcolor: selected === choice.id ? "#80562166" : "#17130faa",
                                    color: "#f7d99b",
                                    cursor: disabled ? "default" : "pointer",
                                    opacity: disabled ? 0.55 : 1,
                                    fontFamily: HOC_GAME_FONT_FAMILY,
                                    fontSize: 12,
                                    "&:hover": { borderColor: "#ffd889" },
                                    "&:focus-visible": { outline: "2px solid #ffad45", outlineOffset: 3 },
                                }}
                            >
                                <DoctrineIcon doctrineId={choice.id} size={44} />
                                <span>{letter}</span>
                            </Box>
                        </Tooltip>
                    );
                })}
            </Box>
        </Box>
    );
};
