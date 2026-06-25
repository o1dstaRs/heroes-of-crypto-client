import React, { useEffect } from "react";
import { usePixiManager } from "../../pixi/PixiGameManager";
import Box from "@mui/joy/Box";
import Stack from "@mui/joy/Stack";
import Typography from "@mui/joy/Typography";
import Slider from "@mui/joy/Slider";
import Button from "@mui/joy/Button";
import Tooltip from "@mui/joy/Tooltip";
import { images } from "../../generated/image_imports";

interface IUnitSplitterProps {
    totalUnits: number;
    onSplit: (split1: number, split2: number) => void;
}

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

const UnitSplitter = ({ totalUnits, onSplit }: IUnitSplitterProps) => {
    const manager = usePixiManager();
    const [splitValue, setSplitValue] = React.useState(1); // Start with minimum value

    // Reset slider value whenever totalUnits changes
    useEffect(() => {
        setSplitValue(1); // Reset to minimum value when a new unit is selected
    }, [totalUnits]);

    const handleSliderChange = (event: Event, newValue: number | number[]) => {
        setSplitValue(newValue as number);
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

            const key = event.key.toLowerCase();
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
        <Box sx={{ width: "100%", marginTop: 3 }}>
            <Stack
                spacing={2}
                alignItems="center"
                sx={{
                    "& .MuiTypography-root": {
                        color: "rgba(255, 143, 0, 0.5)",
                        transition: "all 0.2s ease",
                    },
                    "&:hover .MuiTypography-root": {
                        color: "#FF8F00",
                    },
                }}
            >
                <Box sx={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
                    <Typography level="body-sm">{splitValue}</Typography>
                    <Typography level="body-sm">{totalUnits - splitValue}</Typography>
                </Box>

                <Slider
                    sx={{
                        color: "#FF8F00", // Dark Orange Gold
                        padding: "4px 0",
                        height: 10,
                        "&:hover": {
                            filter: "brightness(1.5) saturate(1.2)",
                        },
                        "& .MuiSlider-thumb": {
                            width: 24,
                            height: 24,
                            backgroundColor: "transparent",
                            backgroundImage: `url(${images.slider_dot})`,
                            backgroundSize: "contain",
                            backgroundRepeat: "no-repeat",
                            backgroundPosition: "center",
                            boxShadow: "none",
                            "&::before": {
                                display: "none",
                            },
                        },
                        "& .MuiSlider-rail": {
                            height: 10,
                            opacity: 0.5,
                            backgroundColor: "#FF8F00", // Match main color
                        },
                        "& .MuiSlider-track": {
                            height: 10,
                            border: "none",
                            backgroundColor: "#FF8F00", // Explicitly Orange/Gold
                        },
                    }}
                    value={splitValue}
                    onChange={handleSliderChange}
                    min={1}
                    max={totalUnits - 1}
                    step={1}
                    aria-label="Unit Split Slider"
                />
            </Stack>
            <Stack direction="row" spacing={2} sx={{ marginTop: 2, marginBottom: 2 }}>
                <Tooltip title="Split (S)" placement="top" sx={shortcutTooltipSx}>
                    <Button
                        variant="plain"
                        onClick={handleAcceptSplit}
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
                        <img src={images.split_text} alt="Split" style={{ height: "40%" }} />
                    </Button>
                </Tooltip>
                <Tooltip title="Delete (D)" placement="top" sx={shortcutTooltipSx}>
                    <Button
                        variant="plain"
                        onClick={() => {
                            manager.Delete();
                        }}
                        sx={{
                            flex: 1,
                            minWidth: 0,
                            aspectRatio: "3.5 / 1",
                            backgroundImage: `url(${images.button_red})`,
                            backgroundSize: "100% 100%",
                            backgroundRepeat: "no-repeat",
                            color: "white",
                            height: "auto",
                            "&:hover": {
                                filter: "brightness(1.2) saturate(1.2)",
                                backgroundColor: "transparent",
                            },
                        }}
                    >
                        <img src={images.delete_text} alt="Delete" style={{ height: "40%" }} />
                    </Button>
                </Tooltip>
            </Stack>
        </Box>
    );
};

export default UnitSplitter;
