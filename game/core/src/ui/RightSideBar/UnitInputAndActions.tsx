import React, { useState, useRef, useEffect, useCallback } from "react";
import Box from "@mui/joy/Box";
import Button from "@mui/joy/Button";
import Input from "@mui/joy/Input";
import Stack from "@mui/joy/Stack";
import Tooltip from "@mui/joy/Tooltip";
import Typography from "@mui/joy/Typography";
import { TeamType } from "@heroesofcrypto/common";

import { usePixiManager } from "../../pixi/PixiGameManager";
import { images } from "../../generated/image_imports";

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
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, paddingTop: 1, paddingBottom: 2 }}>
                    <Typography
                        sx={{
                            color: "rgba(255, 143, 0, 0.85)",
                            fontWeight: "bold",
                            fontSize: "0.8rem",
                            textTransform: "uppercase",
                            letterSpacing: "0.04em",
                        }}
                    >
                        Slots left
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
                            }}
                        >
                            {slots.remaining}
                        </Typography>
                        <Typography sx={{ fontSize: "0.75rem", color: "rgba(255, 255, 255, 0.55)" }}>
                            / {slots.max}
                        </Typography>
                    </Box>
                </Box>
            )}

            <Stack spacing={1}>
                <Input
                    type="number"
                    value={unitCount}
                    onChange={(e) => changeUnitCount(e.target.value)}
                    placeholder="# of units"
                    variant="outlined"
                    sx={{
                        color: "rgba(255, 143, 0, 0.5)",
                        borderColor: "rgba(255, 143, 0, 0.5)",
                        "--Input-focusedHighlight": "#FF8F00",
                        "--Input-focusedThickness": "2px",
                        "&:hover": {
                            borderColor: "#FF8F00",
                            color: "#FF8F00",
                        },
                        "&:focus-within": {
                            borderColor: "#FF8F00",
                            color: "#FF8F00",
                            "--Input-focusedHighlight": "#FF8F00",
                        },
                        "&::before": {
                            boxShadow: "none !important",
                            outline: "none !important",
                        },
                        "&.Mui-focused::before": {
                            boxShadow: "0 0 0 var(--Input-focusedThickness) var(--Input-focusedHighlight) !important",
                        },
                        "&.Mui-focused": {
                            borderColor: "#FF8F00",
                            color: "#FF8F00",
                            boxShadow: "none",
                            outline: "none",
                            "& input::placeholder": {
                                color: "#FF8F00",
                                opacity: 0.6,
                            },
                        },
                        "& input::placeholder": {
                            color: "rgba(255, 143, 0, 0.5)",
                            opacity: 0.6,
                        },
                        transition: "all 0.2s ease",
                    }}
                    slotProps={{
                        input: {
                            min: DEFAULT_NUMBER_OF_UNITS_TO_ACCEPT,
                        },
                    }}
                />
                <Stack direction="row" spacing={2}>
                    <Tooltip title="Accept (A)" placement="top" sx={shortcutTooltipSx}>
                        <Button
                            variant="plain"
                            onClick={() => {
                                handleAccept(parseInt(unitCount) || DEFAULT_NUMBER_OF_UNITS_TO_ACCEPT);
                            }}
                            sx={{
                                flex: 1,
                                minWidth: 0,
                                aspectRatio: "3.5 / 1",
                                backgroundImage: `url(${images.button})`,
                                backgroundSize: "100% 100%",
                                backgroundRepeat: "no-repeat",
                                color: "white",
                                height: "auto",
                                "&:hover": {
                                    filter: "brightness(1.5) saturate(1.2)",
                                    backgroundColor: "transparent",
                                },
                            }}
                        >
                            <img src={images.accept_text} alt="Accept" style={{ height: "40%" }} />
                        </Button>
                    </Tooltip>
                    <Tooltip title="Clone (C)" placement="top" sx={shortcutTooltipSx}>
                        <Button
                            variant="plain"
                            onClick={() => {
                                manager.Clone();
                            }}
                            sx={{
                                flex: 1,
                                minWidth: 0,
                                aspectRatio: "3.5 / 1",
                                backgroundImage: `url(${images.button})`,
                                backgroundSize: "100% 100%",
                                backgroundRepeat: "no-repeat",
                                color: "white",
                                height: "auto",
                                "&:hover": {
                                    filter: "brightness(1.5) saturate(1.2)",
                                    backgroundColor: "transparent",
                                },
                            }}
                        >
                            <img src={images.clone_text} alt="Clone" style={{ height: "40%" }} />
                        </Button>
                    </Tooltip>
                </Stack>
            </Stack>
        </Box>
    );
};

export default UnitInputAndActions;
