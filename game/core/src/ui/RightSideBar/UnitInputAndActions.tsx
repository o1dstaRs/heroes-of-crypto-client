import React, { useState, useRef, useEffect, useCallback } from "react";
import Box from "@mui/joy/Box";
import Button from "@mui/joy/Button";
import Input from "@mui/joy/Input";
import Stack from "@mui/joy/Stack";
import Tooltip from "@mui/joy/Tooltip";
import Typography from "@mui/joy/Typography";
import { TeamType } from "@heroesofcrypto/common";

import { usePixiManager } from "../../pixi/PixiGameManager";
import { t, useTranslation } from "../../i18n/i18n";
import { hocDisplayFontFamily, hocSidebarImageButtonSx } from "../hocTheme";

const DEFAULT_NUMBER_OF_UNITS_TO_ACCEPT = 1;

const shortcutTooltipSx = {
    backgroundColor: "#2d1606",
    border: "2px solid #dcb158",
    color: "#efe4cc",
    borderRadius: "8px",
    boxShadow: "0 6px 12px rgba(0,0,0,0.8)",
    fontSize: "0.85rem",
    fontWeight: 700,
    zIndex: 10000,
};

function isEditableShortcutTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

const UnitInputAndActions = ({
    selectedUnitCount,
    selectedTeamType,
}: {
    selectedUnitCount: number;
    selectedTeamType: TeamType;
}) => {
    useTranslation();
    const changedRef = useRef(false);
    const [unitCount, setUnitCount] = useState("");

    // Remaining placement slots for the active team, shown during army setup. `null` hides the row.
    const [slots, setSlots] = useState<{ remaining: number; max: number } | null>(null);
    // Drives the pop animation: `dir` picks the color (slot freed vs used), `key` retriggers the CSS.
    const [pulse, setPulse] = useState<{ dir: "up" | "down"; key: number } | null>(null);

    const manager = usePixiManager();

    // Refs so the signal handlers (connected once per team) read the latest values without
    // re-subscribing, and so we can tell a real slot change apart from a team switch / first render.
    const lastTeamRef = useRef<TeamType | undefined>(undefined);
    const prevTeamRef = useRef<TeamType | undefined>(undefined);
    const prevRemainingRef = useRef<number | null>(null);
    const pulseKeyRef = useRef(0);
    const startedRef = useRef(manager.IsStarted());

    useEffect(() => {
        const refresh = () => {
            // Slots only matter while placing the army - hide once the fight is underway. Fall back to
            // the last team so deleting a unit (which clears the selection) still animates the freed slot.
            const team = startedRef.current ? undefined : (selectedTeamType ?? lastTeamRef.current);
            if (team === undefined) {
                setSlots(null);
                prevRemainingRef.current = null;
                prevTeamRef.current = undefined;
                return;
            }
            lastTeamRef.current = team;
            const max = manager.GetNumberOfUnitsAvailableForPlacement(team);
            const remaining = Math.max(0, max - manager.GetNumberOfPlacedUnits(team));

            // Only animate a genuine change for the same team (not a team switch or the first paint).
            const prevRemaining = prevRemainingRef.current;
            if (prevTeamRef.current === team && prevRemaining !== null && prevRemaining !== remaining) {
                pulseKeyRef.current += 1;
                setPulse({ dir: remaining > prevRemaining ? "up" : "down", key: pulseKeyRef.current });
            }
            prevTeamRef.current = team;
            prevRemainingRef.current = remaining;
            setSlots((prev) => (prev && prev.remaining === remaining && prev.max === max ? prev : { remaining, max }));
        };

        refresh();
        const connections = [
            // Fires after a unit is placed / cloned / deleted (selection or unit-props refresh).
            manager.onSelectionCombined.connect(refresh),
            // Placement augments change the max cap.
            manager.onPlacementChanged.connect(refresh),
            manager.onHasStarted.connect((started) => {
                startedRef.current = started;
                refresh();
            }),
        ];
        return () => connections.forEach((connection) => connection.disconnect());
    }, [manager, selectedTeamType]);

    const changeUnitCount = (value: string) => {
        changedRef.current = !!selectedUnitCount;
        setUnitCount(value);
    };

    const adjustUnitCount = (delta: 1 | -1) => {
        const current = Number.parseInt(unitCount, 10);
        const next = Number.isNaN(current)
            ? DEFAULT_NUMBER_OF_UNITS_TO_ACCEPT
            : Math.max(DEFAULT_NUMBER_OF_UNITS_TO_ACCEPT, current + delta);
        changeUnitCount(next.toString());
    };

    if (selectedUnitCount > 0) {
        if (!changedRef.current) {
            const selectedUnitCountString = selectedUnitCount.toString();
            if (selectedUnitCountString !== unitCount) {
                setUnitCount(selectedUnitCount.toString());
            }
        }
    } else if (unitCount !== "") {
        setUnitCount("");
    }

    const handleAccept = useCallback(
        (count: number) => {
            if (!Number.isNaN(count) && count > 0) {
                manager.setAmountOfSelectedObjects(Math.floor(count));
                manager.Accept();
                setUnitCount(count.toString());
                changedRef.current = false;
            }
        },
        [manager],
    );

    useEffect(() => {
        const handleActionShortcut = (event: KeyboardEvent) => {
            if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
            if (isEditableShortcutTarget(event.target)) return;
            if (manager.IsStarted() || selectedUnitCount <= 0) return;

            const key = event.key.toLowerCase();
            if (key !== "a" && key !== "c") return;

            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();

            if (key === "a") {
                handleAccept(parseInt(unitCount) || DEFAULT_NUMBER_OF_UNITS_TO_ACCEPT);
            } else {
                manager.Clone();
            }
        };

        window.addEventListener("keydown", handleActionShortcut, { capture: true });
        return () => window.removeEventListener("keydown", handleActionShortcut, { capture: true });
    }, [handleAccept, manager, selectedUnitCount, unitCount]);

    return (
        <Box sx={{ width: "100%", marginTop: 2 }}>
            {slots !== null && (
                <Box
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                        width: "93%",
                        mx: "auto",
                        paddingTop: 1,
                        paddingBottom: 2,
                    }}
                >
                    <Typography
                        sx={{
                            color: "rgba(255, 143, 0, 0.85)",
                            fontWeight: "bold",
                            fontSize: "0.8rem",
                            textTransform: "uppercase",
                            letterSpacing: "0.04em",
                            fontFamily: hocDisplayFontFamily,
                            fontSynthesis: "none",
                        }}
                    >
                        {t("Slots left")}
                    </Typography>
                    <Box
                        key={pulse ? pulse.key : "static"}
                        sx={{
                            display: "inline-flex",
                            alignItems: "baseline",
                            gap: "3px",
                            px: "8px",
                            py: "2px",
                            borderRadius: "8px",
                            border: "1.5px solid rgba(255, 143, 0, 0.5)",
                            backgroundColor: "rgba(255, 143, 0, 0.12)",
                            fontFamily: hocDisplayFontFamily,
                            ...(pulse
                                ? { animation: `${pulse.dir === "up" ? "hocSlotsUp" : "hocSlotsDown"} 0.45s ease-out` }
                                : {}),
                            "@keyframes hocSlotsUp": {
                                "0%": { transform: "scale(1)", boxShadow: "0 0 0 0 rgba(74, 222, 128, 0)" },
                                "35%": {
                                    transform: "scale(1.28)",
                                    boxShadow: "0 0 0 4px rgba(74, 222, 128, 0.45)",
                                    borderColor: "#4ade80",
                                },
                                "100%": { transform: "scale(1)", boxShadow: "0 0 0 0 rgba(74, 222, 128, 0)" },
                            },
                            "@keyframes hocSlotsDown": {
                                "0%": { transform: "scale(1)", boxShadow: "0 0 0 0 rgba(255, 107, 61, 0)" },
                                "35%": {
                                    transform: "scale(1.28)",
                                    boxShadow: "0 0 0 4px rgba(255, 107, 61, 0.5)",
                                    borderColor: "#ff6b3d",
                                },
                                "100%": { transform: "scale(1)", boxShadow: "0 0 0 0 rgba(255, 107, 61, 0)" },
                            },
                            "@media (prefers-reduced-motion: reduce)": { animation: "none" },
                        }}
                    >
                        <Typography
                            sx={{
                                fontWeight: "xl",
                                fontSize: "1.1rem",
                                lineHeight: 1,
                                color: slots.remaining === 0 ? "#ff5a5a" : "#FFB74D",
                                fontFamily: hocDisplayFontFamily,
                                fontSynthesis: "none",
                            }}
                        >
                            {slots.remaining}
                        </Typography>
                        <Typography
                            sx={{
                                fontSize: "0.75rem",
                                color: "rgba(255, 255, 255, 0.55)",
                                fontFamily: hocDisplayFontFamily,
                                fontSynthesis: "none",
                            }}
                        >
                            / {slots.max}
                        </Typography>
                    </Box>
                </Box>
            )}

            <Stack spacing={2}>
                <Input
                    type="number"
                    value={unitCount}
                    onChange={(e) => changeUnitCount(e.target.value)}
                    placeholder={t("# of units")}
                    variant="outlined"
                    endDecorator={
                        <Box
                            sx={{
                                width: "21.85px",
                                height: "33.98px",
                                flex: "0 0 21.85px",
                                boxSizing: "border-box",
                                alignSelf: "center",
                                mr: "-10px",
                                display: "flex",
                                flexDirection: "column",
                                overflow: "hidden",
                                border: "1px solid rgba(205,160,120,.72)",
                                borderRadius: "2px",
                                background: "#100704",
                                boxShadow:
                                    "inset 0 0 0 1px rgba(105,48,18,.56), inset 0 1px 4px #000, 0 1px 3px rgba(224,83,34,.2)",
                            }}
                        >
                            {([1, -1] as const).map((delta) => (
                                <Box
                                    key={delta}
                                    component="button"
                                    type="button"
                                    aria-label={t(delta === 1 ? "Increase unit count" : "Decrease unit count")}
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={() => adjustUnitCount(delta)}
                                    sx={{
                                        appearance: "none",
                                        opacity: 0.75,
                                        flex: 1,
                                        minHeight: 0,
                                        p: 0,
                                        display: "grid",
                                        placeItems: "center",
                                        border: 0,
                                        borderBottom: delta === 1 ? "1px solid rgba(205,160,120,.58)" : 0,
                                        borderRadius: 0,
                                        background: "linear-gradient(180deg,rgba(105,48,18,.72),rgba(47,18,8,.82))",
                                        boxShadow: "none",
                                        "&:hover": {
                                            background: "linear-gradient(180deg,rgba(125,59,24,.82),rgba(58,22,9,.9))",
                                        },
                                        "&:active": {
                                            background: "linear-gradient(180deg,rgba(86,36,14,.9),rgba(38,13,6,.96))",
                                        },
                                    }}
                                >
                                    <Box
                                        sx={{
                                            width: "8.9px",
                                            height: "6.47px",
                                            clipPath:
                                                delta === 1
                                                    ? "polygon(50% 0, 100% 100%, 0 100%)"
                                                    : "polygon(0 0, 100% 0, 50% 100%)",
                                            background: "linear-gradient(180deg,#d8ab80,#c0784d 58%,#8d4828)",
                                            filter: "drop-shadow(0 1px 1px rgba(0,0,0,.95))",
                                        }}
                                    />
                                </Box>
                            ))}
                        </Box>
                    }
                    sx={{
                        width: "93%",
                        mx: "auto",
                        transform: "translateX(clamp(0px, calc((100vw - 1422px) * 0.04), 24px))",
                        minHeight: "48px",
                        borderRadius: 0,
                        color: "#d8c29c",
                        background: "linear-gradient(180deg, rgba(6,6,6,.78), rgba(18,15,12,.78))",
                        borderColor: "rgba(116, 78, 43, .58)",
                        boxShadow: "inset 0 0 12px rgba(0,0,0,.8)",
                        fontFamily: hocDisplayFontFamily,
                        fontSynthesis: "none",
                        "--Input-focusedHighlight": "#9b693a",
                        "--Input-focusedThickness": "2px",
                        "&:hover": {
                            borderColor: "#b17a43",
                            color: "#e5c594",
                        },
                        "&:focus-within": {
                            borderColor: "#b17a43",
                            color: "#e5c594",
                            "--Input-focusedHighlight": "#b17a43",
                        },
                        "&::before": {
                            boxShadow: "none !important",
                            outline: "none !important",
                        },
                        "&.Mui-focused::before": {
                            boxShadow: "0 0 0 var(--Input-focusedThickness) var(--Input-focusedHighlight) !important",
                        },
                        "&.Mui-focused": {
                            borderColor: "#b17a43",
                            color: "#e5c594",
                            boxShadow: "none",
                            outline: "none",
                            "& input::placeholder": {
                                color: "#d8c29c",
                                opacity: 0.6,
                            },
                        },
                        "& input::placeholder": {
                            color: "rgba(216,194,156,.58)",
                            opacity: 0.6,
                        },
                        "& input": {
                            fontFamily: hocDisplayFontFamily,
                            fontSynthesis: "none",
                            MozAppearance: "textfield",
                            "&::-webkit-inner-spin-button, &::-webkit-outer-spin-button": {
                                WebkitAppearance: "none",
                                margin: 0,
                            },
                        },
                        transition: "all 0.2s ease",
                    }}
                    slotProps={{
                        input: {
                            min: DEFAULT_NUMBER_OF_UNITS_TO_ACCEPT,
                        },
                    }}
                />
                <Stack
                    direction="row"
                    spacing={2}
                    sx={{
                        width: "93%",
                        mx: "auto",
                        transform: "translateX(clamp(0px, calc((100vw - 1422px) * 0.04), 24px))",
                    }}
                >
                    <Tooltip title={t("Accept (A)")} placement="top" sx={shortcutTooltipSx}>
                        <Button
                            variant="plain"
                            size="sm"
                            onClick={() => {
                                handleAccept(parseInt(unitCount) || DEFAULT_NUMBER_OF_UNITS_TO_ACCEPT);
                            }}
                            sx={{ ...hocSidebarImageButtonSx("primary"), flex: 1, minWidth: 0 }}
                        >
                            {t("Accept")}
                        </Button>
                    </Tooltip>
                    <Tooltip title={t("Clone (C)")} placement="top" sx={shortcutTooltipSx}>
                        <Button
                            variant="plain"
                            size="sm"
                            onClick={() => {
                                manager.Clone();
                            }}
                            sx={{ ...hocSidebarImageButtonSx("neutral"), flex: 1, minWidth: 0 }}
                        >
                            {t("Clone")}
                        </Button>
                    </Tooltip>
                </Stack>
            </Stack>
        </Box>
    );
};

export default UnitInputAndActions;
