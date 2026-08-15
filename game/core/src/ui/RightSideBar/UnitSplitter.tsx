import React, { useEffect } from "react";
import { usePixiManager } from "../../pixi/PixiGameManager";
import Box from "@mui/joy/Box";
import Stack from "@mui/joy/Stack";
import Typography from "@mui/joy/Typography";
import Slider from "@mui/joy/Slider";
import Button from "@mui/joy/Button";
import Tooltip from "@mui/joy/Tooltip";
import { images } from "../../generated/image_imports";
import { t, useTranslation } from "../../i18n/i18n";
import { hocDisplayFontFamily, hocSidebarImageButtonSx } from "../hocTheme";

interface IUnitSplitterProps {
    totalUnits: number;
    onSplit: (split1: number, split2: number) => void;
}

// Half the 24px thumb, plus a little air so it never touches the panel wall.
const SLIDER_INSET_PX = 16;

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
    useTranslation();
    const manager = usePixiManager();
    const [splitValue, setSplitValue] = React.useState(1); // Start with minimum value
    const hasSelectedUnit = totalUnits > 0;

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
                    // The thumb is 24px and centres on its value, so at either end half of it hangs past the
                    // rail. Flush against the panel edge that half was being clipped - the slider read as a
                    // half-circle stuck to the wall. Inset the whole block by more than half a thumb so both
                    // ends, and the counts sitting above them, stay inside the panel.
                    paddingX: `${SLIDER_INSET_PX}px`,
                    "& .MuiTypography-root": {
                        color: "rgba(216,194,156,.7)",
                        fontFamily: hocDisplayFontFamily,
                        fontSynthesis: "none",
                        transition: "all 0.2s ease",
                    },
                    "&:hover .MuiTypography-root": {
                        color: "#FF8F00",
                    },
                }}
            >
                <Box sx={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
                    <Typography level="body-sm">{hasSelectedUnit ? splitValue : 0}</Typography>
                    <Typography level="body-sm">{hasSelectedUnit ? totalUnits - splitValue : 1}</Typography>
                </Box>

                <Slider
                    sx={{
                        color: "#693012",
                        padding: "4px 0",
                        height: 10,
                        "&:hover": {
                            filter: "brightness(1.12) saturate(1.02)",
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
                            filter: "brightness(.9) saturate(.88) drop-shadow(0 0 4px rgba(224,83,34,.24))",
                            "&::before": {
                                display: "none",
                            },
                        },
                        "& .MuiSlider-rail": {
                            height: 6.5,
                            opacity: 1,
                            background:
                                "linear-gradient(180deg,#28130a 0%,#080504 62%,#693012 63%,#693012 80%,#28130a 81%)",
                            border: "1px solid rgba(205,160,120,.58)",
                            boxShadow: "inset 0 1px 3px #000, 0 1px 2px rgba(224,83,34,.2)",
                        },
                        "& .MuiSlider-track": {
                            height: 6.5,
                            border: "1px solid rgba(205,160,120,.72)",
                            background: "linear-gradient(180deg,#87411e,#43190a 55%,#693012)",
                            boxShadow: "inset 0 1px 2px rgba(216,171,128,.26)",
                        },
                    }}
                    value={hasSelectedUnit ? splitValue : 0}
                    onChange={handleSliderChange}
                    min={hasSelectedUnit ? 1 : 0}
                    max={hasSelectedUnit ? Math.max(1, totalUnits - 1) : 1}
                    track={hasSelectedUnit ? "normal" : false}
                    disabled={!hasSelectedUnit}
                    step={1}
                    aria-label={t("Unit split slider")}
                />
            </Stack>
            <Stack direction="row" spacing={2} sx={{ width: "93%", mx: "auto", marginTop: 2, marginBottom: 2 }}>
                <Tooltip title={t("Split (S)")} placement="top" sx={shortcutTooltipSx}>
                    <Button
                        variant="plain"
                        size="sm"
                        onClick={handleAcceptSplit}
                        sx={{ ...hocSidebarImageButtonSx("neutral"), flex: 1, minWidth: 0 }}
                    >
                        {t("Split")}
                    </Button>
                </Tooltip>
                <Tooltip title={t("Delete (D)")} placement="top" sx={shortcutTooltipSx}>
                    <Button
                        variant="plain"
                        size="sm"
                        onClick={() => {
                            manager.Delete();
                        }}
                        sx={{ ...hocSidebarImageButtonSx("danger"), flex: 1, minWidth: 0 }}
                    >
                        {t("Delete")}
                    </Button>
                </Tooltip>
            </Stack>
        </Box>
    );
};

export default UnitSplitter;
