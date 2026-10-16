import { GridVals, TeamVals } from "@heroesofcrypto/common";
import { Box, Button, Input, Sheet, Typography } from "@mui/joy";
import React, { useEffect, useMemo, useState } from "react";

import { PREVIEW_PLACEMENT_GAME_ID, startPreviewPlaySession } from "../api/previewPlaySession";
import type { IWindowSize } from "../scenes/VisibleState";
import {
    DEFAULT_LAVA_ANIMATION_TUNING,
    readStoredLavaAnimationTuning,
    resetStoredLavaAnimationTuning,
    setLavaAnimationEditorActive,
    writeStoredLavaAnimationTuning,
    type LavaAnimationTuning,
} from "../scenes/sandbox/lavaAnimationTuning";
import { writeStoredLavaPitVisualMode } from "../scenes/sandbox/lavaPitVisualMode";
import { hocColors, hocDisplayFontFamily } from "./hocTheme";
import { RankedGameView } from "./RankedGameView";

const ValueControl: React.FC<{
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    suffix?: string;
    onChange: (value: number) => void;
}> = ({ label, value, min, max, step, suffix, onChange }) => (
    <Box sx={{ display: "grid", gridTemplateColumns: "124px 1fr 88px", alignItems: "center", gap: 1 }}>
        <Typography level="body-sm" sx={{ color: hocColors.mutedStrong }}>
            {label}
        </Typography>
        <Box
            component="input"
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onInput={(event) => onChange(Number((event.target as HTMLInputElement).value))}
            sx={{ width: "100%", accentColor: "#ff7518", cursor: "pointer" }}
        />
        <Input
            type="number"
            value={value}
            slotProps={{ input: { min, max, step } }}
            onChange={(event) => onChange(Number(event.target.value))}
            endDecorator={suffix}
            sx={{ minWidth: 0, bgcolor: "rgba(0,0,0,.34)", borderColor: hocColors.orangeBorder }}
        />
    </Box>
);

export const LavaFireVideoEditor: React.FC<{ windowSize: IWindowSize }> = ({ windowSize }) => {
    const [tuning, setTuning] = useState<LavaAnimationTuning>(() => readStoredLavaAnimationTuning());
    const [status, setStatus] = useState("Новый огонь сохраняется автоматически");

    useMemo(
        () =>
            startPreviewPlaySession({
                userTeam: TeamVals.LEFT,
                gridType: GridVals.LAVA_CENTER,
                lowerArmy: [],
                upperArmy: [],
            }),
        [],
    );

    useEffect(() => {
        setLavaAnimationEditorActive(true, false);
        writeStoredLavaPitVisualMode("burning");
        return () => setLavaAnimationEditorActive(false);
    }, []);

    const update = (patch: Partial<LavaAnimationTuning>, message = "Сохранено") => {
        setTuning(writeStoredLavaAnimationTuning({ ...tuning, ...patch }));
        setStatus(message);
    };
    const reset = () => {
        resetStoredLavaAnimationTuning();
        setTuning(writeStoredLavaAnimationTuning(DEFAULT_LAVA_ANIMATION_TUNING));
        setStatus("Настройки нового огня сброшены");
    };

    if (import.meta.env.PROD || import.meta.env.VITE_IS_PROD === "true") {
        return <Typography sx={{ p: 4 }}>Fire editor is available only in development builds.</Typography>;
    }

    return (
        <Box sx={{ position: "fixed", inset: 0, overflow: "hidden", bgcolor: "#000" }}>
            <RankedGameView gameId={PREVIEW_PLACEMENT_GAME_ID} userTeam={TeamVals.LEFT} windowSize={windowSize} />
            <Sheet
                sx={{
                    position: "fixed",
                    zIndex: 14000,
                    top: 12,
                    right: 12,
                    width: 430,
                    maxHeight: "calc(100vh - 24px)",
                    overflowY: "auto",
                    p: 1.5,
                    bgcolor: "rgba(14,7,3,.96)",
                    border: "1px solid rgba(255,112,28,.58)",
                    borderRadius: "12px",
                    boxShadow: "0 14px 42px rgba(0,0,0,.72)",
                }}
            >
                <Typography
                    level="title-lg"
                    sx={{ color: "#ffd08a", fontFamily: hocDisplayFontFamily, textAlign: "center" }}
                >
                    НОВЫЙ ОГОНЬ ЯМЫ
                </Typography>
                <Typography level="body-xs" sx={{ mb: 1.25, color: hocColors.muted, textAlign: "center" }}>
                    Один связный огонь · решётка сверху · языки поверх решётки
                </Typography>

                <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, mb: 1.25 }}>
                    <Button
                        variant={tuning.fireEnabled ? "solid" : "outlined"}
                        color="warning"
                        onClick={() => update({ fireEnabled: !tuning.fireEnabled })}
                    >
                        Огонь: {tuning.fireEnabled ? "вкл" : "выкл"}
                    </Button>
                    <Button variant="outlined" color="neutral" onClick={reset}>
                        Сбросить
                    </Button>
                </Box>

                <Typography level="title-md" sx={{ mb: 0.75, color: "#ffb34f", fontFamily: hocDisplayFontFamily }}>
                    Габариты и положение
                </Typography>
                <Box sx={{ display: "grid", gap: 0.75 }}>
                    <ValueControl
                        label="Ширина"
                        value={tuning.fireScaleX}
                        min={0.5}
                        max={1.5}
                        step={0.005}
                        onChange={(fireScaleX) => update({ fireScaleX })}
                    />
                    <ValueControl
                        label="Высота"
                        value={tuning.fireScaleY}
                        min={0.5}
                        max={1.5}
                        step={0.005}
                        onChange={(fireScaleY) => update({ fireScaleY })}
                    />
                    <ValueControl
                        label="Сдвиг X"
                        value={tuning.fireShiftXCells}
                        min={-1}
                        max={1}
                        step={0.005}
                        suffix="кл."
                        onChange={(fireShiftXCells) => update({ fireShiftXCells })}
                    />
                    <ValueControl
                        label="Сдвиг Y"
                        value={tuning.fireShiftYCells}
                        min={-1}
                        max={1}
                        step={0.005}
                        suffix="кл."
                        onChange={(fireShiftYCells) => update({ fireShiftYCells })}
                    />
                </Box>

                <Typography
                    level="title-md"
                    sx={{ mt: 1.5, mb: 0.75, color: "#ffb34f", fontFamily: hocDisplayFontFamily }}
                >
                    Тон и яркость
                </Typography>
                <Box sx={{ display: "grid", gap: 0.75 }}>
                    <ValueControl
                        label="Прозрачность"
                        value={tuning.fireAlpha}
                        min={0}
                        max={1}
                        step={0.01}
                        onChange={(fireAlpha) => update({ fireAlpha })}
                    />
                    <ValueControl
                        label="Яркость"
                        value={tuning.fireBrightness}
                        min={0.25}
                        max={2.5}
                        step={0.01}
                        onChange={(fireBrightness) => update({ fireBrightness })}
                    />
                    <ValueControl
                        label="Насыщенность"
                        value={tuning.fireSaturation}
                        min={0}
                        max={2.5}
                        step={0.01}
                        onChange={(fireSaturation) => update({ fireSaturation })}
                    />
                    <ValueControl
                        label="Контраст"
                        value={tuning.fireContrast}
                        min={0.25}
                        max={2.5}
                        step={0.01}
                        onChange={(fireContrast) => update({ fireContrast })}
                    />
                    <Box sx={{ display: "grid", gridTemplateColumns: "124px 1fr 88px", alignItems: "center", gap: 1 }}>
                        <Typography level="body-sm" sx={{ color: hocColors.mutedStrong }}>
                            Цвет
                        </Typography>
                        <Box
                            component="input"
                            type="color"
                            value={tuning.fireTint}
                            onInput={(event) => update({ fireTint: (event.target as HTMLInputElement).value })}
                            sx={{
                                width: "100%",
                                height: 34,
                                p: 0,
                                border: 0,
                                bgcolor: "transparent",
                                cursor: "pointer",
                            }}
                        />
                        <Typography level="body-xs" sx={{ color: hocColors.muted, fontFamily: "monospace" }}>
                            {tuning.fireTint.toUpperCase()}
                        </Typography>
                    </Box>
                    <ValueControl
                        label="Сила цвета"
                        value={tuning.fireTintAmount}
                        min={0}
                        max={1}
                        step={0.01}
                        onChange={(fireTintAmount) => update({ fireTintAmount })}
                    />
                </Box>

                <Typography
                    level="title-md"
                    sx={{ mt: 1.5, mb: 0.75, color: "#ffb34f", fontFamily: hocDisplayFontFamily }}
                >
                    Движение и прорывы
                </Typography>
                <Box sx={{ display: "grid", gap: 0.75 }}>
                    <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0.75 }}>
                        <Button
                            variant={tuning.paused ? "solid" : "outlined"}
                            color="warning"
                            onClick={() => update({ paused: !tuning.paused })}
                        >
                            {tuning.paused ? "▶ Играть" : "Ⅱ Пауза"}
                        </Button>
                        <Button
                            variant="outlined"
                            color="neutral"
                            onClick={() =>
                                update({ paused: true, scrubFrame: tuning.firstFrame }, "Показан первый кадр")
                            }
                        >
                            Первый кадр
                        </Button>
                    </Box>
                    <ValueControl
                        label="Скорость"
                        value={tuning.fps}
                        min={1}
                        max={60}
                        step={1}
                        suffix="fps"
                        onChange={(fps) => update({ fps })}
                    />
                    <ValueControl
                        label={`Кадр ${tuning.scrubFrame + 1}`}
                        value={tuning.scrubFrame}
                        min={tuning.firstFrame}
                        max={tuning.lastFrame}
                        step={1}
                        onChange={(scrubFrame) => update({ paused: true, scrubFrame })}
                    />
                    <ValueControl
                        label="Поверх решётки"
                        value={tuning.fireOverAlpha}
                        min={0}
                        max={1.5}
                        step={0.01}
                        onChange={(fireOverAlpha) => update({ fireOverAlpha })}
                    />
                </Box>

                <Typography level="body-xs" sx={{ mt: 1.25, color: hocColors.muted, textAlign: "center" }}>
                    {status}
                </Typography>
            </Sheet>
        </Box>
    );
};
