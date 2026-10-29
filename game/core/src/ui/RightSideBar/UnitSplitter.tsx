import React, { useEffect } from "react";
import { usePixiManager } from "../../pixi/PixiGameManager";
import { shortcutLetter } from "../../utils/shortcutLetter";
import Box from "@mui/joy/Box";
import Stack from "@mui/joy/Stack";
import Slider from "@mui/joy/Slider";
import Button from "@mui/joy/Button";
import Tooltip from "@mui/joy/Tooltip";
import { hocSidebarImageButtonSx, hocSplitterSliderSx } from "../hocTheme";

interface IUnitSplitterProps {
    totalUnits: number;
    splitValue: number;
    onSplitValueChange: (value: number) => void;
    onSplit: (split1: number, split2: number) => void;
}

// Keep the 18px thumb inside the same bounds as the amount input at either end.
const SLIDER_INSET_PX = 9;

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

const UnitSplitter = ({ totalUnits, splitValue, onSplitValueChange, onSplit }: IUnitSplitterProps) => {
    const manager = usePixiManager();
    const hasSelectedUnit = totalUnits > 0;

    const handleSliderChange = (event: Event, newValue: number | number[]) => {
        onSplitValueChange(newValue as number);
    };

    const handleAcceptSplit = React.useCallback(() => {
        const group1 = splitValue;
        const group2 = totalUnits - splitValue;
        onSplit(group1, group2);
    }, [onSplit, splitValue, totalUnits]);

    useEffect(() => {
        const handleActionShortcut = (event: KeyboardEvent) => {
            if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
            if (isEditableShortcutTarget(event.target)) return;
            if (manager.IsStarted() || totalUnits <= 0) return;

            const key = shortcutLetter(event);
            if (key !== "s" && key !== "d") return;

            const canSplit = totalUnits > 1;
            if (key === "s" && !canSplit) return;

            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();

            if (key === "s") {
                handleAcceptSplit();
            } else {
                manager.Delete();
            }
        };

        window.addEventListener("keydown", handleActionShortcut, { capture: true });
        return () => window.removeEventListener("keydown", handleActionShortcut, { capture: true });
    }, [handleAcceptSplit, manager, totalUnits]);

    return (
        <Box sx={{ width: "100%", marginTop: 2 }}>
            <Stack
                alignItems="center"
                sx={{
                    width: "93%",
                    mx: 0,
                    boxSizing: "border-box",
                    paddingX: `${SLIDER_INSET_PX}px`,
                    transform: "translateX(clamp(0px, calc((100vw - 1422px) * 0.04), 24px))",
                }}
            >
                <Slider
                    sx={{
                        ...hocSplitterSliderSx,
                        "--Slider-thumbSize": "18px",
                        "& .MuiSlider-thumb": {
                            ...hocSplitterSliderSx["& .MuiSlider-thumb"],
                            width: 18,
                            height: 18,
                        },
                    }}
                    value={hasSelectedUnit ? splitValue : 0}
                    onChange={handleSliderChange}
                    min={hasSelectedUnit ? 1 : 0}
                    max={hasSelectedUnit ? Math.max(1, totalUnits - 1) : 1}
                    track={hasSelectedUnit ? "normal" : false}
                    disabled={totalUnits < 2}
                    step={1}
                    aria-label="Unit Split Slider"
                />
            </Stack>
            <Stack direction="row" spacing={2} sx={{ width: "93%", mx: "auto", marginTop: 2, marginBottom: 2 }}>
                <Tooltip title="Split (S)" placement="top" sx={shortcutTooltipSx}>
                    <Button
                        variant="plain"
                        size="sm"
                        onClick={handleAcceptSplit}
                        disabled={totalUnits < 2}
                        sx={{ ...hocSidebarImageButtonSx("primary"), flex: 1, minWidth: 0 }}
                    >
                        Split
                    </Button>
                </Tooltip>
                <Tooltip title="Delete (D)" placement="top" sx={shortcutTooltipSx}>
                    <Button
                        variant="plain"
                        size="sm"
                        onClick={() => {
                            manager.Delete();
                        }}
                        sx={{ ...hocSidebarImageButtonSx("danger"), flex: 1, minWidth: 0 }}
                    >
                        Delete
                    </Button>
                </Tooltip>
            </Stack>
        </Box>
    );
};

export default UnitSplitter;
