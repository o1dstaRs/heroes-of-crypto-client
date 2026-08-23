import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import RestartAltRoundedIcon from "@mui/icons-material/RestartAltRounded";
import Box from "@mui/joy/Box";
import Button from "@mui/joy/Button";
import IconButton from "@mui/joy/IconButton";
import Input from "@mui/joy/Input";
import Sheet from "@mui/joy/Sheet";
import Typography from "@mui/joy/Typography";
import React, { useState } from "react";
import { createPortal } from "react-dom";

import {
    COUNTDOWN_FRAME_LINE_KEYS,
    DEFAULT_COUNTDOWN_FRAME_TUNING,
    normalizeCountdownFrameTuning,
    type CountdownFrameLineKey,
    type CountdownFrameLines,
    type CountdownFrameTuning,
} from "./countdownFrameLayout";

const LINE_LABELS: Readonly<Record<CountdownFrameLineKey, string>> = {
    top: "ВЕРХНЯЯ",
    left: "ЛЕВАЯ",
    right: "ПРАВАЯ",
    bottom: "НИЖНЯЯ",
};

const LINE_COLORS: Readonly<Record<CountdownFrameLineKey, string>> = {
    top: "#ffbb52",
    left: "#58a6ff",
    right: "#66d9ef",
    bottom: "#74d680",
};

const OFFSET_FIELDS = ["x1", "y1", "x2", "y2"] as const;
type OffsetField = (typeof OFFSET_FIELDS)[number];

const FIELD_LABELS: Readonly<Record<CountdownFrameLineKey, Readonly<Record<OffsetField, string>>>> = {
    top: { x1: "ЛЕВ X", y1: "ЛЕВ Y", x2: "ПРАВ X", y2: "ПРАВ Y" },
    left: { x1: "НИЗ X", y1: "НИЗ Y", x2: "ВЕРХ X", y2: "ВЕРХ Y" },
    right: { x1: "ВЕРХ X", y1: "ВЕРХ Y", x2: "НИЗ X", y2: "НИЗ Y" },
    bottom: { x1: "ЛЕВ X", y1: "ЛЕВ Y", x2: "ПРАВ X", y2: "ПРАВ Y" },
};

export const CountdownFrameEditor: React.FC<{
    lines: CountdownFrameLines;
    tuning: CountdownFrameTuning;
    onChange: (next: CountdownFrameTuning) => void;
    onClose: () => void;
}> = ({ lines, tuning, onChange, onClose }) => {
    const [panelSide, setPanelSide] = useState<"left" | "right">("right");
    const [copyLabel, setCopyLabel] = useState("КОПИРОВАТЬ JSON");

    const updateOffset = (line: CountdownFrameLineKey, field: OffsetField, value: number) => {
        onChange(
            normalizeCountdownFrameTuning({
                ...tuning,
                [line]: { ...tuning[line], [field]: value },
            }),
        );
    };

    const copyTuning = async () => {
        try {
            await navigator.clipboard.writeText(JSON.stringify(tuning, null, 2));
            setCopyLabel("СКОПИРОВАНО");
        } catch {
            setCopyLabel("ОШИБКА КОПИРОВАНИЯ");
        }
        window.setTimeout(() => setCopyLabel("КОПИРОВАТЬ JSON"), 1500);
    };

    return createPortal(
        <Sheet
            data-testid="countdown-frame-editor"
            variant="outlined"
            sx={{
                position: "fixed",
                zIndex: 14000,
                top: 12,
                [panelSide]: 12,
                width: "min(520px, calc(100vw - 24px))",
                maxHeight: "calc(100vh - 24px)",
                overflowY: "auto",
                p: 1.25,
                borderColor: "rgba(213,125,64,.68)",
                borderRadius: 6,
                bgcolor: "rgba(10,8,7,.96)",
                color: "#ead7bd",
                boxShadow: "0 12px 42px rgba(0,0,0,.72), inset 0 0 0 1px rgba(255,194,117,.06)",
                pointerEvents: "auto",
                userSelect: "text",
            }}
        >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography level="title-md" sx={{ color: "#f1bb72", letterSpacing: ".08em" }}>
                        COUNTDOWN FRAME DEV TOOL
                    </Typography>
                    <Typography level="body-xs" sx={{ color: "rgba(234,215,189,.68)" }}>
                        Значения — смещения в px от базовой рамки. Сохранение автоматическое.
                    </Typography>
                </Box>
                <Button
                    size="sm"
                    variant="outlined"
                    color="neutral"
                    onClick={() => setPanelSide((side) => (side === "left" ? "right" : "left"))}
                    sx={{ minWidth: 72 }}
                >
                    {panelSide === "left" ? "ВПРАВО" : "ВЛЕВО"}
                </Button>
                <IconButton size="sm" variant="outlined" color="neutral" onClick={onClose} aria-label="Закрыть">
                    <CloseRoundedIcon />
                </IconButton>
            </Box>

            <Box sx={{ display: "grid", gap: 0.75 }}>
                {COUNTDOWN_FRAME_LINE_KEYS.map((line) => (
                    <Sheet
                        key={line}
                        data-testid={`countdown-frame-line-${line}`}
                        variant="soft"
                        sx={{
                            p: 0.75,
                            borderLeft: `3px solid ${LINE_COLORS[line]}`,
                            bgcolor: "rgba(255,255,255,.035)",
                        }}
                    >
                        <Box sx={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", mb: 0.5 }}>
                            <Typography level="title-sm" sx={{ color: LINE_COLORS[line], letterSpacing: ".08em" }}>
                                {LINE_LABELS[line]}
                            </Typography>
                            <Typography
                                level="body-xs"
                                sx={{ color: "rgba(234,215,189,.58)", fontFamily: "monospace" }}
                            >
                                {Math.round(lines[line].x1)}, {Math.round(lines[line].y1)} →{" "}
                                {Math.round(lines[line].x2)}, {Math.round(lines[line].y2)}
                            </Typography>
                        </Box>
                        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 0.5 }}>
                            {OFFSET_FIELDS.map((field) => (
                                <Box key={field}>
                                    <Typography
                                        component="label"
                                        level="body-xs"
                                        sx={{ display: "block", mb: 0.25, color: "rgba(234,215,189,.58)" }}
                                    >
                                        {FIELD_LABELS[line][field]}
                                    </Typography>
                                    <Input
                                        aria-label={`${LINE_LABELS[line]}: ${FIELD_LABELS[line][field]}`}
                                        type="number"
                                        size="sm"
                                        value={tuning[line][field]}
                                        slotProps={{ input: { min: -1000, max: 1000, step: 1 } }}
                                        onFocus={(event) => event.currentTarget.select()}
                                        onChange={(event) => updateOffset(line, field, Number(event.target.value))}
                                        sx={{
                                            bgcolor: "rgba(0,0,0,.46)",
                                            "& input": { px: 0.5, textAlign: "center", fontFamily: "monospace" },
                                        }}
                                    />
                                </Box>
                            ))}
                        </Box>
                        {(line === "left" || line === "right") && (
                            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.65 }}>
                                <Typography level="body-xs" sx={{ flex: 1, color: "rgba(234,215,189,.58)" }}>
                                    Только длина снизу, без изменения наклона по X
                                </Typography>
                                <Button
                                    size="sm"
                                    variant="outlined"
                                    color="neutral"
                                    onClick={() => {
                                        const field = line === "left" ? "y1" : "y2";
                                        updateOffset(line, field, tuning[line][field] - 5);
                                    }}
                                >
                                    КОРОЧЕ −5
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outlined"
                                    color="neutral"
                                    onClick={() => {
                                        const field = line === "left" ? "y1" : "y2";
                                        updateOffset(line, field, tuning[line][field] + 5);
                                    }}
                                >
                                    ДЛИННЕЕ +5
                                </Button>
                            </Box>
                        )}
                    </Sheet>
                ))}
            </Box>

            <Box sx={{ display: "flex", gap: 0.75, mt: 1 }}>
                <Button
                    size="sm"
                    variant="outlined"
                    color="neutral"
                    startDecorator={<RestartAltRoundedIcon />}
                    onClick={() => onChange(DEFAULT_COUNTDOWN_FRAME_TUNING)}
                >
                    СБРОСИТЬ
                </Button>
                <Button
                    size="sm"
                    variant="solid"
                    color="warning"
                    startDecorator={<ContentCopyRoundedIcon />}
                    onClick={copyTuning}
                    sx={{ flex: 1 }}
                >
                    {copyLabel}
                </Button>
            </Box>
            <Typography level="body-xs" sx={{ mt: 0.75, color: "rgba(234,215,189,.52)", textAlign: "center" }}>
                Shift + L — открыть или закрыть инструмент
            </Typography>
        </Sheet>,
        document.body,
    );
};
