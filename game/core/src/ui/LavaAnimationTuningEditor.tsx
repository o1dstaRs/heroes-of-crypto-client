import { GridVals, TeamVals } from "@heroesofcrypto/common";
import { Box, Button, Input, Sheet, Typography } from "@mui/joy";
import React, { useEffect, useMemo, useState } from "react";

import { PREVIEW_PLACEMENT_GAME_ID, startPreviewPlaySession } from "../api/previewPlaySession";
import type { IWindowSize } from "../scenes/VisibleState";
import {
    DEFAULT_LAVA_ANIMATION_TUNING,
    lavaAnimationFrameAtTime,
    normalizeLavaAnimationTuning,
    readStoredLavaAnimationTuning,
    resetStoredLavaAnimationTuning,
    setLavaAnimationEditorActive,
    writeStoredLavaAnimationTuning,
    type LavaAnimationTuning,
} from "../scenes/sandbox/lavaAnimationTuning";
import { hocColors, hocDisplayFontFamily } from "./hocTheme";
import { RankedGameView } from "./RankedGameView";

const roundValue = (value: number): number => Math.round(value * 1000) / 1000;
const FIRE_PIT_ANIMATION_FRAME_COUNT = 64;

const readFirePitEditorTuning = (): LavaAnimationTuning => {
    const stored = readStoredLavaAnimationTuning();
    const lastIndex = FIRE_PIT_ANIMATION_FRAME_COUNT - 1;
    const firstFrame = Math.min(stored.firstFrame, lastIndex);
    const wasLegacyShortRange = stored.firstFrame === 0 && (stored.lastFrame === 8 || stored.lastFrame === 23);
    const wasPreviousSmoothRange = stored.firstFrame === 0 && stored.lastFrame === 47;
    const lastFrame =
        wasLegacyShortRange || wasPreviousSmoothRange
            ? lastIndex
            : Math.min(Math.max(firstFrame, stored.lastFrame), lastIndex);
    return normalizeLavaAnimationTuning({
        ...stored,
        fps: wasPreviousSmoothRange && stored.fps === 43 ? DEFAULT_LAVA_ANIMATION_TUNING.fps : stored.fps,
        firstFrame,
        lastFrame,
        scrubFrame: Math.min(Math.max(firstFrame, stored.scrubFrame), lastFrame),
    });
};

const ValueControl: React.FC<{
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    suffix?: string;
    onChange: (value: number) => void;
}> = ({ label, value, min, max, step, suffix, onChange }) => (
    <Box sx={{ display: "grid", gridTemplateColumns: "118px 1fr 94px", alignItems: "center", gap: 1 }}>
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
            sx={{ width: "100%", accentColor: "#ff7a18", cursor: "pointer" }}
        />
        <Input
            type="number"
            value={value}
            slotProps={{ input: { min, max, step } }}
            onChange={(event) => onChange(Number(event.target.value))}
            endDecorator={suffix}
            sx={{
                minWidth: 0,
                bgcolor: "rgba(0,0,0,.34)",
                borderColor: hocColors.orangeBorder,
                "& input": { px: 0.5, textAlign: "right" },
            }}
        />
    </Box>
);

const SectionTitle: React.FC<React.PropsWithChildren> = ({ children }) => (
    <Typography
        level="title-md"
        sx={{ mt: 1.6, mb: 0.75, color: "#ffb34f", fontFamily: hocDisplayFontFamily, letterSpacing: ".04em" }}
    >
        {children}
    </Typography>
);

const PRESETS: ReadonlyArray<{ label: string; patch: Partial<LavaAnimationTuning> }> = [
    {
        label: "Спокойная",
        patch: {
            fps: 7,
            fireBrightness: 0.95,
            fireSaturation: 0.95,
            lightIntensity: 0.75,
            lightPulseAmount: 0.08,
            splashesEnabled: false,
        },
    },
    {
        label: "Бурление",
        patch: {
            fps: 12,
            fireBrightness: 1.12,
            fireSaturation: 1.12,
            fireContrast: 1.08,
            lightIntensity: 1.15,
            lightPulseAmount: 0.2,
            splashesEnabled: true,
            splashRate: 0.85,
            splashCount: 6,
            splashHeightCells: 0.42,
            splashSizeCells: 0.035,
            splashSpreadCells: 0.52,
            splashGlow: 0.8,
        },
    },
    {
        label: "Яркая",
        patch: {
            fps: 13,
            fireBrightness: 1.35,
            fireSaturation: 1.25,
            fireContrast: 1.12,
            lightIntensity: 1.45,
            lightRadius: 1.18,
            lightPulseAmount: 0.23,
            splashesEnabled: true,
            splashRate: 1.1,
            splashCount: 8,
            splashHeightCells: 0.55,
            splashGlow: 1.15,
        },
    },
    {
        label: "Извержение",
        patch: {
            fps: 16,
            fireBrightness: 1.45,
            fireSaturation: 1.3,
            fireContrast: 1.15,
            lightIntensity: 1.7,
            lightRadius: 1.3,
            lightPulseAmount: 0.32,
            lightPulseSpeed: 1.35,
            edgeFlicker: 1.35,
            splashesEnabled: true,
            splashRate: 1.7,
            splashCount: 11,
            splashHeightCells: 0.82,
            splashSizeCells: 0.047,
            splashSpreadCells: 0.72,
            splashGlow: 1.45,
        },
    },
];

const formatTypeScript = (tuning: LavaAnimationTuning): string =>
    Object.entries(tuning)
        .map(([key, value]) => `${key}: ${typeof value === "boolean" ? value : roundValue(value)},`)
        .join("\n");

export const LavaAnimationTuningEditor: React.FC<{ windowSize: IWindowSize }> = ({ windowSize }) => {
    const [tuning, setTuning] = useState<LavaAnimationTuning>(() => readFirePitEditorTuning());
    const [status, setStatus] = useState("Настройки сохраняются автоматически");
    const [dock, setDock] = useState<"left" | "right">("right");
    const [collapsed, setCollapsed] = useState(false);
    const [lockRatio, setLockRatio] = useState(false);
    const [lockFireRatio, setLockFireRatio] = useState(true);
    const [lockFire2Ratio, setLockFire2Ratio] = useState(true);
    const [clock, setClock] = useState(() => performance.now() / 1000);

    useMemo(
        () =>
            startPreviewPlaySession({
                userTeam: TeamVals.LEFT,
                gridType: GridVals.LAVA_CENTER,
                leftArmy: [],
                rightArmy: [],
            }),
        [],
    );

    useEffect(() => {
        setLavaAnimationEditorActive(true);
        writeStoredLavaAnimationTuning(tuning);
        return () => setLavaAnimationEditorActive(false);
        // This mount-only normalization upgrades stale 9/24/48-frame editor ranges to the current 64 frames.
    }, []);

    useEffect(() => {
        const timer = window.setInterval(() => setClock(performance.now() / 1000), 80);
        return () => window.clearInterval(timer);
    }, []);

    const persist = (nextValue: Partial<LavaAnimationTuning>, message = "Сохранено локально") => {
        const next = writeStoredLavaAnimationTuning(nextValue);
        setTuning(next);
        setStatus(message);
    };
    const updateTuning = (patch: Partial<LavaAnimationTuning>) => persist({ ...tuning, ...patch });
    const nudge = (field: keyof LavaAnimationTuning, delta: number) => {
        const current = tuning[field];
        if (typeof current !== "number") return;
        updateTuning({ [field]: roundValue(current + delta) });
    };
    const stepFrame = (delta: number) => {
        const span = tuning.lastFrame - tuning.firstFrame + 1;
        const relative = (tuning.scrubFrame - tuning.firstFrame + delta + span) % span;
        updateTuning({ paused: true, scrubFrame: tuning.firstFrame + relative });
    };
    const reset = () => {
        if (!window.confirm("Сбросить все настройки анимации лавы?")) return;
        resetStoredLavaAnimationTuning();
        const next = readFirePitEditorTuning();
        writeStoredLavaAnimationTuning(next);
        setTuning(next);
        setStatus("Настройки лавы сброшены");
    };
    const copyText = async (text: string, message: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setStatus(message);
        } catch {
            setStatus("Не удалось скопировать — разрешите доступ к буферу обмена");
        }
    };
    const importJson = () => {
        const raw = window.prompt("Вставьте JSON настроек лавы");
        if (!raw) return;
        try {
            persist(JSON.parse(raw) as Partial<LavaAnimationTuning>, "JSON импортирован");
        } catch {
            setStatus("Ошибка JSON — проверьте синтаксис");
        }
    };
    const downloadJson = () => {
        const blob = new Blob([JSON.stringify(tuning, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "lava-animation-tuning.json";
        anchor.click();
        URL.revokeObjectURL(url);
        setStatus("JSON скачан");
    };

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.target instanceof HTMLElement && event.target.closest("input, textarea, select")) return;
            if (event.code === "Space") {
                event.preventDefault();
                updateTuning({ paused: !tuning.paused });
            } else if (event.key === "ArrowLeft") {
                event.preventDefault();
                stepFrame(-1);
            } else if (event.key === "ArrowRight") {
                event.preventDefault();
                stepFrame(1);
            } else if (event.key.toLowerCase() === "r") {
                event.preventDefault();
                updateTuning({ reverse: !tuning.reverse });
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    });

    if (import.meta.env.PROD || import.meta.env.VITE_IS_PROD === "true") {
        return <Typography sx={{ p: 4 }}>Lava animation editor is available only in development builds.</Typography>;
    }

    const currentFrame = lavaAnimationFrameAtTime(tuning, clock);
    const changed = JSON.stringify(tuning) !== JSON.stringify(DEFAULT_LAVA_ANIMATION_TUNING);

    return (
        <Box sx={{ position: "fixed", inset: 0, overflow: "hidden", bgcolor: "#000" }}>
            <RankedGameView gameId={PREVIEW_PLACEMENT_GAME_ID} userTeam={TeamVals.LEFT} windowSize={windowSize} />

            {collapsed ? (
                <Button
                    variant="solid"
                    color="warning"
                    onClick={() => setCollapsed(false)}
                    sx={{ position: "fixed", zIndex: 14000, top: 14, [dock]: 14 }}
                >
                    LAVA EDITOR · {currentFrame + 1}/{FIRE_PIT_ANIMATION_FRAME_COUNT}
                </Button>
            ) : (
                <Sheet
                    sx={{
                        position: "fixed",
                        zIndex: 14000,
                        top: 14,
                        [dock]: 14,
                        width: 470,
                        maxHeight: "calc(100vh - 28px)",
                        overflowY: "auto",
                        p: 2,
                        color: hocColors.parchment,
                        bgcolor: "rgba(14,7,3,.965)",
                        border: "1px solid rgba(255,112,28,.58)",
                        borderRadius: "14px",
                        boxShadow: "0 16px 52px rgba(0,0,0,.78), 0 0 32px rgba(255,65,0,.11)",
                    }}
                >
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Typography level="h3" sx={{ flex: 1, color: "#ffd08a", fontFamily: hocDisplayFontFamily }}>
                            LAVA ANIMATION EDITOR
                        </Typography>
                        <Button
                            size="sm"
                            variant="plain"
                            color="neutral"
                            onClick={() => setDock(dock === "right" ? "left" : "right")}
                        >
                            ⇄
                        </Button>
                        <Button size="sm" variant="plain" color="neutral" onClick={() => setCollapsed(true)}>
                            —
                        </Button>
                    </Box>
                    <Typography level="body-xs" sx={{ mt: 0.4, color: hocColors.muted }}>
                        Огненная яма 4×4 · 64 плавных кадра · неподвижная рамка · Space: пауза · ←/→: кадр · R: реверс
                    </Typography>

                    <SectionTitle>Пресеты</SectionTitle>
                    <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0.65 }}>
                        {PRESETS.map((preset) => (
                            <Button
                                key={preset.label}
                                size="sm"
                                variant="outlined"
                                color="warning"
                                onClick={() => persist({ ...tuning, ...preset.patch }, `Пресет «${preset.label}»`)}
                            >
                                {preset.label}
                            </Button>
                        ))}
                    </Box>

                    <SectionTitle>Проигрывание</SectionTitle>
                    <Box sx={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 0.6, mb: 1 }}>
                        <Button size="sm" variant="outlined" color="neutral" onClick={() => stepFrame(-1)}>
                            −1
                        </Button>
                        <Button
                            size="sm"
                            variant={tuning.paused ? "solid" : "outlined"}
                            color="warning"
                            onClick={() => updateTuning({ paused: !tuning.paused })}
                        >
                            {tuning.paused ? "▶" : "Ⅱ"}
                        </Button>
                        <Button size="sm" variant="outlined" color="neutral" onClick={() => stepFrame(1)}>
                            +1
                        </Button>
                        <Button
                            size="sm"
                            variant={tuning.reverse ? "solid" : "outlined"}
                            color="warning"
                            onClick={() => updateTuning({ reverse: !tuning.reverse })}
                        >
                            Reverse
                        </Button>
                        <Button
                            size="sm"
                            variant="outlined"
                            color="neutral"
                            onClick={() => updateTuning({ paused: true, scrubFrame: tuning.firstFrame })}
                        >
                            First
                        </Button>
                    </Box>
                    <ValueControl
                        label="Скорость"
                        value={tuning.fps}
                        min={0.25}
                        max={60}
                        step={0.25}
                        suffix="fps"
                        onChange={(fps) => updateTuning({ fps })}
                    />
                    <ValueControl
                        label="Первый кадр"
                        value={tuning.firstFrame}
                        min={0}
                        max={FIRE_PIT_ANIMATION_FRAME_COUNT - 1}
                        step={1}
                        onChange={(firstFrame) => updateTuning({ firstFrame })}
                    />
                    <ValueControl
                        label="Последний кадр"
                        value={tuning.lastFrame}
                        min={tuning.firstFrame}
                        max={FIRE_PIT_ANIMATION_FRAME_COUNT - 1}
                        step={1}
                        onChange={(lastFrame) => updateTuning({ lastFrame })}
                    />
                    <ValueControl
                        label={`Кадр ${currentFrame + 1}`}
                        value={tuning.paused ? tuning.scrubFrame : currentFrame}
                        min={tuning.firstFrame}
                        max={tuning.lastFrame}
                        step={1}
                        onChange={(scrubFrame) => updateTuning({ paused: true, scrubFrame })}
                    />

                    <SectionTitle>Положение и размер</SectionTitle>
                    <Box sx={{ display: "flex", gap: 0.65, mb: 0.85 }}>
                        <Button
                            size="sm"
                            variant={lockRatio ? "solid" : "outlined"}
                            color="neutral"
                            onClick={() => setLockRatio(!lockRatio)}
                        >
                            {lockRatio ? "🔗 Пропорции" : "🔓 Пропорции"}
                        </Button>
                        <Button
                            size="sm"
                            variant="outlined"
                            color="neutral"
                            onClick={() =>
                                updateTuning({ widthCells: 4, heightCells: 4, shiftXCells: 0, shiftYCells: 0 })
                            }
                        >
                            Ровно 4×4
                        </Button>
                    </Box>
                    <ValueControl
                        label="Ширина"
                        value={tuning.widthCells}
                        min={0.5}
                        max={8}
                        step={0.005}
                        suffix="кл."
                        onChange={(widthCells) =>
                            updateTuning(lockRatio ? { widthCells, heightCells: widthCells } : { widthCells })
                        }
                    />
                    <ValueControl
                        label="Высота"
                        value={tuning.heightCells}
                        min={0.5}
                        max={8}
                        step={0.005}
                        suffix="кл."
                        onChange={(heightCells) =>
                            updateTuning(lockRatio ? { widthCells: heightCells, heightCells } : { heightCells })
                        }
                    />
                    <ValueControl
                        label="Сдвиг X"
                        value={tuning.shiftXCells}
                        min={-4}
                        max={4}
                        step={0.0025}
                        suffix="кл."
                        onChange={(shiftXCells) => updateTuning({ shiftXCells })}
                    />
                    <ValueControl
                        label="Сдвиг Y"
                        value={tuning.shiftYCells}
                        min={-4}
                        max={4}
                        step={0.0025}
                        suffix="кл."
                        onChange={(shiftYCells) => updateTuning({ shiftYCells })}
                    />
                    <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0.55, mt: 0.6 }}>
                        <Button
                            size="sm"
                            variant="outlined"
                            color="neutral"
                            onClick={() => nudge("shiftXCells", -0.0025)}
                        >
                            ← 0.25%
                        </Button>
                        <Button
                            size="sm"
                            variant="outlined"
                            color="neutral"
                            onClick={() => nudge("shiftXCells", 0.0025)}
                        >
                            0.25% →
                        </Button>
                        <Button
                            size="sm"
                            variant="outlined"
                            color="neutral"
                            onClick={() => nudge("shiftYCells", 0.0025)}
                        >
                            ↑ 0.25%
                        </Button>
                        <Button
                            size="sm"
                            variant="outlined"
                            color="neutral"
                            onClick={() => nudge("shiftYCells", -0.0025)}
                        >
                            ↓ 0.25%
                        </Button>
                    </Box>

                    <SectionTitle>Сама лава</SectionTitle>
                    <Box sx={{ display: "flex", gap: 0.65, mb: 0.85 }}>
                        <Button
                            size="sm"
                            variant={lockFireRatio ? "solid" : "outlined"}
                            color="neutral"
                            onClick={() => setLockFireRatio(!lockFireRatio)}
                        >
                            {lockFireRatio ? "🔗 Пропорции лавы" : "🔓 Пропорции лавы"}
                        </Button>
                        <Button
                            size="sm"
                            variant="outlined"
                            color="neutral"
                            onClick={() =>
                                updateTuning({
                                    fireScaleX: DEFAULT_LAVA_ANIMATION_TUNING.fireScaleX,
                                    fireScaleY: DEFAULT_LAVA_ANIMATION_TUNING.fireScaleY,
                                    fireShiftXCells: DEFAULT_LAVA_ANIMATION_TUNING.fireShiftXCells,
                                    fireShiftYCells: DEFAULT_LAVA_ANIMATION_TUNING.fireShiftYCells,
                                    fireAlpha: DEFAULT_LAVA_ANIMATION_TUNING.fireAlpha,
                                    fireBrightness: DEFAULT_LAVA_ANIMATION_TUNING.fireBrightness,
                                    fireSaturation: DEFAULT_LAVA_ANIMATION_TUNING.fireSaturation,
                                    fireContrast: DEFAULT_LAVA_ANIMATION_TUNING.fireContrast,
                                })
                            }
                        >
                            Сбросить слой
                        </Button>
                    </Box>
                    <ValueControl
                        label="Ширина лавы"
                        value={roundValue(tuning.fireScaleX * 100)}
                        min={25}
                        max={200}
                        step={0.5}
                        suffix="%"
                        onChange={(percent) => {
                            const fireScaleX = percent / 100;
                            updateTuning(lockFireRatio ? { fireScaleX, fireScaleY: fireScaleX } : { fireScaleX });
                        }}
                    />
                    <ValueControl
                        label="Высота лавы"
                        value={roundValue(tuning.fireScaleY * 100)}
                        min={25}
                        max={200}
                        step={0.5}
                        suffix="%"
                        onChange={(percent) => {
                            const fireScaleY = percent / 100;
                            updateTuning(lockFireRatio ? { fireScaleX: fireScaleY, fireScaleY } : { fireScaleY });
                        }}
                    />
                    <ValueControl
                        label="Прозр. огня"
                        value={tuning.fireAlpha}
                        min={0}
                        max={1.5}
                        step={0.01}
                        onChange={(fireAlpha) => updateTuning({ fireAlpha })}
                    />
                    <ValueControl
                        label="Яркость огня"
                        value={tuning.fireBrightness}
                        min={0.25}
                        max={2.5}
                        step={0.01}
                        onChange={(fireBrightness) => updateTuning({ fireBrightness })}
                    />
                    <ValueControl
                        label="Насыщ. огня"
                        value={tuning.fireSaturation}
                        min={0}
                        max={2.5}
                        step={0.01}
                        onChange={(fireSaturation) => updateTuning({ fireSaturation })}
                    />
                    <ValueControl
                        label="Контраст огня"
                        value={tuning.fireContrast}
                        min={0.25}
                        max={2.5}
                        step={0.01}
                        onChange={(fireContrast) => updateTuning({ fireContrast })}
                    />
                    <ValueControl
                        label="Сдвиг огня X"
                        value={tuning.fireShiftXCells}
                        min={-2}
                        max={2}
                        step={0.005}
                        suffix="кл."
                        onChange={(fireShiftXCells) => updateTuning({ fireShiftXCells })}
                    />
                    <ValueControl
                        label="Сдвиг огня Y"
                        value={tuning.fireShiftYCells}
                        min={-2}
                        max={2}
                        step={0.005}
                        suffix="кл."
                        onChange={(fireShiftYCells) => updateTuning({ fireShiftYCells })}
                    />
                    <Box sx={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 0.45, mt: 0.6 }}>
                        {[
                            ["←", -0.025, 0],
                            ["→", 0.025, 0],
                            ["↑", 0, 0.025],
                            ["↓", 0, -0.025],
                            ["◎", 0, 0],
                        ].map(([label, dx, dy]) => (
                            <Button
                                key={String(label)}
                                size="sm"
                                variant="outlined"
                                color={label === "◎" ? "warning" : "neutral"}
                                onClick={() =>
                                    label === "◎"
                                        ? updateTuning({ fireShiftXCells: 0, fireShiftYCells: 0 })
                                        : updateTuning({
                                              fireShiftXCells: roundValue(tuning.fireShiftXCells + Number(dx)),
                                              fireShiftYCells: roundValue(tuning.fireShiftYCells + Number(dy)),
                                          })
                                }
                            >
                                {label}
                            </Button>
                        ))}
                    </Box>

                    <SectionTitle>Второй огонь</SectionTitle>
                    <Box sx={{ display: "flex", gap: 0.65, mb: 0.85, flexWrap: "wrap" }}>
                        <Button
                            size="sm"
                            variant={tuning.fire2Enabled ? "solid" : "outlined"}
                            color="warning"
                            onClick={() => updateTuning({ fire2Enabled: !tuning.fire2Enabled })}
                        >
                            {tuning.fire2Enabled ? "Огонь 2 включён" : "Огонь 2 выключен"}
                        </Button>
                        <Button
                            size="sm"
                            variant={lockFire2Ratio ? "solid" : "outlined"}
                            color="neutral"
                            onClick={() => setLockFire2Ratio(!lockFire2Ratio)}
                        >
                            {lockFire2Ratio ? "🔗 Пропорции" : "🔓 Пропорции"}
                        </Button>
                        <Button
                            size="sm"
                            variant="outlined"
                            color="neutral"
                            onClick={() =>
                                updateTuning({
                                    fire2Enabled: DEFAULT_LAVA_ANIMATION_TUNING.fire2Enabled,
                                    fire2ScaleX: DEFAULT_LAVA_ANIMATION_TUNING.fire2ScaleX,
                                    fire2ScaleY: DEFAULT_LAVA_ANIMATION_TUNING.fire2ScaleY,
                                    fire2ShiftXCells: DEFAULT_LAVA_ANIMATION_TUNING.fire2ShiftXCells,
                                    fire2ShiftYCells: DEFAULT_LAVA_ANIMATION_TUNING.fire2ShiftYCells,
                                    fire2Alpha: DEFAULT_LAVA_ANIMATION_TUNING.fire2Alpha,
                                    fire2Brightness: DEFAULT_LAVA_ANIMATION_TUNING.fire2Brightness,
                                    fire2Saturation: DEFAULT_LAVA_ANIMATION_TUNING.fire2Saturation,
                                    fire2Contrast: DEFAULT_LAVA_ANIMATION_TUNING.fire2Contrast,
                                    fire2Speed: DEFAULT_LAVA_ANIMATION_TUNING.fire2Speed,
                                    fire2FrameOffset: DEFAULT_LAVA_ANIMATION_TUNING.fire2FrameOffset,
                                })
                            }
                        >
                            Сбросить огонь 2
                        </Button>
                    </Box>
                    <ValueControl
                        label="Ширина огня 2"
                        value={roundValue(tuning.fire2ScaleX * 100)}
                        min={25}
                        max={200}
                        step={0.5}
                        suffix="%"
                        onChange={(percent) => {
                            const fire2ScaleX = percent / 100;
                            updateTuning(lockFire2Ratio ? { fire2ScaleX, fire2ScaleY: fire2ScaleX } : { fire2ScaleX });
                        }}
                    />
                    <ValueControl
                        label="Высота огня 2"
                        value={roundValue(tuning.fire2ScaleY * 100)}
                        min={25}
                        max={200}
                        step={0.5}
                        suffix="%"
                        onChange={(percent) => {
                            const fire2ScaleY = percent / 100;
                            updateTuning(lockFire2Ratio ? { fire2ScaleX: fire2ScaleY, fire2ScaleY } : { fire2ScaleY });
                        }}
                    />
                    <ValueControl
                        label="Сдвиг 2 X"
                        value={tuning.fire2ShiftXCells}
                        min={-2}
                        max={2}
                        step={0.005}
                        suffix="кл."
                        onChange={(fire2ShiftXCells) => updateTuning({ fire2ShiftXCells })}
                    />
                    <ValueControl
                        label="Сдвиг 2 Y"
                        value={tuning.fire2ShiftYCells}
                        min={-2}
                        max={2}
                        step={0.005}
                        suffix="кл."
                        onChange={(fire2ShiftYCells) => updateTuning({ fire2ShiftYCells })}
                    />
                    <ValueControl
                        label="Прозр. огня 2"
                        value={tuning.fire2Alpha}
                        min={0}
                        max={1.5}
                        step={0.01}
                        onChange={(fire2Alpha) => updateTuning({ fire2Alpha })}
                    />
                    <ValueControl
                        label="Яркость огня 2"
                        value={tuning.fire2Brightness}
                        min={0.25}
                        max={2.5}
                        step={0.01}
                        onChange={(fire2Brightness) => updateTuning({ fire2Brightness })}
                    />
                    <ValueControl
                        label="Насыщ. огня 2"
                        value={tuning.fire2Saturation}
                        min={0}
                        max={2.5}
                        step={0.01}
                        onChange={(fire2Saturation) => updateTuning({ fire2Saturation })}
                    />
                    <ValueControl
                        label="Контраст огня 2"
                        value={tuning.fire2Contrast}
                        min={0.25}
                        max={2.5}
                        step={0.01}
                        onChange={(fire2Contrast) => updateTuning({ fire2Contrast })}
                    />
                    <ValueControl
                        label="Скорость огня 2"
                        value={tuning.fire2Speed}
                        min={0.1}
                        max={3}
                        step={0.01}
                        suffix="×"
                        onChange={(fire2Speed) => updateTuning({ fire2Speed })}
                    />
                    <ValueControl
                        label="Фаза огня 2"
                        value={tuning.fire2FrameOffset}
                        min={0}
                        max={63}
                        step={1}
                        suffix="кадр"
                        onChange={(fire2FrameOffset) => updateTuning({ fire2FrameOffset })}
                    />

                    <SectionTitle>Общая область горения</SectionTitle>
                    <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0.55, mb: 0.85 }}>
                        {(
                            [
                                ["ellipse", "Овал"],
                                ["triangle", "Треугольник"],
                                ["rectangle", "Прямоугольник"],
                            ] as const
                        ).map(([fireMaskShape, label]) => (
                            <Button
                                key={fireMaskShape}
                                size="sm"
                                variant={tuning.fireMaskShape === fireMaskShape ? "solid" : "outlined"}
                                color="warning"
                                onClick={() => updateTuning({ fireMaskShape })}
                            >
                                {label}
                            </Button>
                        ))}
                    </Box>
                    <ValueControl
                        label="Ширина области"
                        value={tuning.fireMaskWidthCells}
                        min={0.25}
                        max={6}
                        step={0.01}
                        suffix="кл."
                        onChange={(fireMaskWidthCells) => updateTuning({ fireMaskWidthCells })}
                    />
                    <ValueControl
                        label="Высота области"
                        value={tuning.fireMaskHeightCells}
                        min={0.25}
                        max={6}
                        step={0.01}
                        suffix="кл."
                        onChange={(fireMaskHeightCells) => updateTuning({ fireMaskHeightCells })}
                    />
                    <ValueControl
                        label="Сдвиг области X"
                        value={tuning.fireMaskShiftXCells}
                        min={-3}
                        max={3}
                        step={0.005}
                        suffix="кл."
                        onChange={(fireMaskShiftXCells) => updateTuning({ fireMaskShiftXCells })}
                    />
                    <ValueControl
                        label="Сдвиг области Y"
                        value={tuning.fireMaskShiftYCells}
                        min={-3}
                        max={3}
                        step={0.005}
                        suffix="кл."
                        onChange={(fireMaskShiftYCells) => updateTuning({ fireMaskShiftYCells })}
                    />
                    <ValueControl
                        label="Поворот области"
                        value={tuning.fireMaskRotationDeg}
                        min={-180}
                        max={180}
                        step={1}
                        suffix="°"
                        onChange={(fireMaskRotationDeg) => updateTuning({ fireMaskRotationDeg })}
                    />

                    <SectionTitle>Базовая яма и решётка</SectionTitle>
                    <ValueControl
                        label="Прозрачность"
                        value={tuning.alpha}
                        min={0}
                        max={1.5}
                        step={0.01}
                        onChange={(alpha) => updateTuning({ alpha })}
                    />
                    <ValueControl
                        label="Яркость"
                        value={tuning.brightness}
                        min={0.25}
                        max={2.5}
                        step={0.01}
                        onChange={(brightness) => updateTuning({ brightness })}
                    />
                    <ValueControl
                        label="Насыщенность"
                        value={tuning.saturation}
                        min={0}
                        max={2.5}
                        step={0.01}
                        onChange={(saturation) => updateTuning({ saturation })}
                    />
                    <ValueControl
                        label="Контраст"
                        value={tuning.contrast}
                        min={0.25}
                        max={2.5}
                        step={0.01}
                        onChange={(contrast) => updateTuning({ contrast })}
                    />

                    <SectionTitle>Свет на самой яме</SectionTitle>
                    <Box sx={{ display: "flex", gap: 0.65, mb: 0.85 }}>
                        <Button
                            size="sm"
                            variant={tuning.pitLightEnabled ? "solid" : "outlined"}
                            color="warning"
                            onClick={() => updateTuning({ pitLightEnabled: !tuning.pitLightEnabled })}
                        >
                            {tuning.pitLightEnabled ? "Подсветка включена" : "Подсветка выключена"}
                        </Button>
                        <Button
                            size="sm"
                            variant="outlined"
                            color="neutral"
                            onClick={() =>
                                updateTuning({
                                    pitLightEnabled: true,
                                    pitLightIntensity: DEFAULT_LAVA_ANIMATION_TUNING.pitLightIntensity,
                                    pitLightRadius: DEFAULT_LAVA_ANIMATION_TUNING.pitLightRadius,
                                    pitLightPulseAmount: DEFAULT_LAVA_ANIMATION_TUNING.pitLightPulseAmount,
                                    pitLightWarmth: DEFAULT_LAVA_ANIMATION_TUNING.pitLightWarmth,
                                })
                            }
                        >
                            Сбросить свет
                        </Button>
                    </Box>
                    <Typography level="body-xs" sx={{ mb: 0.65, color: hocColors.muted }}>
                        Тёплый свет рисуется поверх чаши, но остаётся под огнём и неподвижной решёткой.
                    </Typography>
                    <ValueControl
                        label="Сила на яме"
                        value={tuning.pitLightIntensity}
                        min={0}
                        max={2}
                        step={0.01}
                        onChange={(pitLightIntensity) => updateTuning({ pitLightIntensity })}
                    />
                    <ValueControl
                        label="Охват ямы"
                        value={roundValue(tuning.pitLightRadius * 100)}
                        min={15}
                        max={100}
                        step={1}
                        suffix="%"
                        onChange={(percent) => updateTuning({ pitLightRadius: percent / 100 })}
                    />
                    <ValueControl
                        label="Пульсация ямы"
                        value={tuning.pitLightPulseAmount}
                        min={0}
                        max={1}
                        step={0.01}
                        onChange={(pitLightPulseAmount) => updateTuning({ pitLightPulseAmount })}
                    />
                    <ValueControl
                        label="Теплота света"
                        value={tuning.pitLightWarmth}
                        min={0}
                        max={1}
                        step={0.01}
                        onChange={(pitLightWarmth) => updateTuning({ pitLightWarmth })}
                    />

                    <SectionTitle>Брызги и капли</SectionTitle>
                    <Button
                        size="sm"
                        variant={tuning.splashesEnabled ? "solid" : "outlined"}
                        color={tuning.splashesEnabled ? "warning" : "neutral"}
                        onClick={() => updateTuning({ splashesEnabled: !tuning.splashesEnabled })}
                        sx={{ mb: 0.8 }}
                    >
                        {tuning.splashesEnabled ? "Брызги включены" : "Брызги выключены"}
                    </Button>
                    <ValueControl
                        label="Выбросов/сек"
                        value={tuning.splashRate}
                        min={0}
                        max={5}
                        step={0.05}
                        onChange={(splashRate) => updateTuning({ splashRate })}
                    />
                    <ValueControl
                        label="Капель"
                        value={tuning.splashCount}
                        min={0}
                        max={24}
                        step={1}
                        onChange={(splashCount) => updateTuning({ splashCount })}
                    />
                    <ValueControl
                        label="Высота"
                        value={tuning.splashHeightCells}
                        min={0}
                        max={2.5}
                        step={0.01}
                        suffix="кл."
                        onChange={(splashHeightCells) => updateTuning({ splashHeightCells })}
                    />
                    <ValueControl
                        label="Размер капель"
                        value={tuning.splashSizeCells}
                        min={0.005}
                        max={0.2}
                        step={0.001}
                        suffix="кл."
                        onChange={(splashSizeCells) => updateTuning({ splashSizeCells })}
                    />
                    <ValueControl
                        label="Разброс"
                        value={tuning.splashSpreadCells}
                        min={0}
                        max={2}
                        step={0.01}
                        suffix="кл."
                        onChange={(splashSpreadCells) => updateTuning({ splashSpreadCells })}
                    />
                    <ValueControl
                        label="Свечение капель"
                        value={tuning.splashGlow}
                        min={0}
                        max={3}
                        step={0.01}
                        onChange={(splashGlow) => updateTuning({ splashGlow })}
                    />

                    <SectionTitle>Экспорт</SectionTitle>
                    <Box sx={{ display: "flex", gap: 0.65, flexWrap: "wrap" }}>
                        <Button
                            size="sm"
                            variant="outlined"
                            color="neutral"
                            onClick={() => void copyText(JSON.stringify(tuning, null, 2), "JSON скопирован")}
                        >
                            Copy JSON
                        </Button>
                        <Button
                            size="sm"
                            variant="outlined"
                            color="warning"
                            onClick={() => void copyText(formatTypeScript(tuning), "TypeScript скопирован")}
                        >
                            Copy TypeScript
                        </Button>
                        <Button size="sm" variant="outlined" color="neutral" onClick={importJson}>
                            Import JSON
                        </Button>
                        <Button size="sm" variant="outlined" color="neutral" onClick={downloadJson}>
                            Download JSON
                        </Button>
                        <Button size="sm" variant="outlined" color="danger" disabled={!changed} onClick={reset}>
                            Reset
                        </Button>
                    </Box>

                    <Box sx={{ mt: 1.5, display: "flex", justifyContent: "space-between", gap: 1 }}>
                        <Typography level="body-xs" sx={{ color: hocColors.muted }}>
                            {status}
                        </Typography>
                        <Button size="sm" variant="plain" color="neutral" onClick={() => window.location.assign("/")}>
                            ← Sandbox
                        </Button>
                    </Box>
                </Sheet>
            )}
        </Box>
    );
};

export default LavaAnimationTuningEditor;
