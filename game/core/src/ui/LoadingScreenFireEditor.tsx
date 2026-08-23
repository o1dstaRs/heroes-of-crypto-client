import { Box, Button, Input, Sheet, Typography } from "@mui/joy";
import React, { useEffect, useRef, useState } from "react";

import { PixiApp } from "../pixi/PixiApp";
import { LoadingScreen } from "../scenes/LoadingScreen";
import {
    DEFAULT_LOADING_SCREEN_FIRE_TUNING,
    readStoredLoadingScreenFireTuning,
    resetStoredLoadingScreenFireTuning,
    writeStoredLoadingScreenFireTuning,
    type LoadingScreenFireBlendMode,
    type LoadingScreenFireTuning,
    type LoadingScreenFireType,
    type LoadingScreenFireZoneTuning,
} from "../scenes/loadingScreenFireTuning";
import { hocColors, hocDisplayFontFamily } from "./hocTheme";

const roundValue = (value: number): number => Math.round(value * 1000) / 1000;
const colorHex = (value: number): string => `#${Math.round(value).toString(16).padStart(6, "0")}`;

const ValueControl: React.FC<{
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    suffix?: string;
    onChange: (value: number) => void;
}> = ({ label, value, min, max, step, suffix, onChange }) => (
    <Box sx={{ display: "grid", gridTemplateColumns: "102px 1fr 92px", alignItems: "center", gap: 1 }}>
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

const ChoiceButtons = <T extends string>({
    value,
    options,
    onChange,
}: {
    value: T;
    options: ReadonlyArray<{ value: T; label: string }>;
    onChange: (value: T) => void;
}) => (
    <Box sx={{ display: "grid", gridTemplateColumns: `repeat(${options.length}, 1fr)`, gap: 0.75 }}>
        {options.map((option) => (
            <Button
                key={option.value}
                size="sm"
                variant={option.value === value ? "solid" : "outlined"}
                color={option.value === value ? "warning" : "neutral"}
                onClick={() => onChange(option.value)}
                sx={{ minWidth: 0 }}
            >
                {option.label}
            </Button>
        ))}
    </Box>
);

const FIRE_TYPE_OPTIONS: ReadonlyArray<{ value: LoadingScreenFireType; label: string }> = [
    { value: "furnace", label: "Огонь печи" },
    { value: "brazier", label: "Огонь чаш" },
];

const BLEND_MODE_OPTIONS: ReadonlyArray<{ value: LoadingScreenFireBlendMode; label: string }> = [
    { value: "normal", label: "Normal" },
    { value: "add", label: "Add" },
    { value: "screen", label: "Screen" },
];

export const LoadingScreenFireEditor: React.FC = () => {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const loadingScreenRef = useRef<LoadingScreen | null>(null);
    const [tuning, setTuning] = useState<LoadingScreenFireTuning>(() => readStoredLoadingScreenFireTuning());
    const [previewProgress, setPreviewProgress] = useState(0.96);
    const [paused, setPaused] = useState(false);
    const [scrubFrame, setScrubFrame] = useState(0);
    const [dock, setDock] = useState<"left" | "right">("right");
    const [collapsed, setCollapsed] = useState(false);
    const [status, setStatus] = useState("Настройки сохраняются автоматически");
    const [ready, setReady] = useState(false);

    useEffect(() => {
        const host = hostRef.current;
        const canvas = canvasRef.current;
        if (!host || !canvas) return;

        let active = true;
        let pixiApp: PixiApp | undefined;
        let resizeObserver: ResizeObserver | undefined;
        const resize = () => {
            if (!pixiApp || !loadingScreenRef.current) return;
            const rect = host.getBoundingClientRect();
            const width = Math.max(1, Math.floor(rect.width));
            const height = Math.max(1, Math.floor(rect.height));
            pixiApp.resize(width, height);
            loadingScreenRef.current.resize(width, height);
        };

        const start = async () => {
            const rect = host.getBoundingClientRect();
            pixiApp = new PixiApp();
            await pixiApp.init(canvas, Math.max(1, Math.floor(rect.width)), Math.max(1, Math.floor(rect.height)));
            if (!active) {
                pixiApp.destroy();
                return;
            }
            const loadingScreen = await LoadingScreen.create(
                Math.max(1, Math.floor(rect.width)),
                Math.max(1, Math.floor(rect.height)),
            );
            if (!active) {
                loadingScreen.destroy();
                pixiApp.destroy();
                return;
            }
            loadingScreenRef.current = loadingScreen;
            loadingScreen.setProgress(0.96);
            pixiApp.getStage().addChild(loadingScreen);
            resizeObserver = new ResizeObserver(resize);
            resizeObserver.observe(host);
            setReady(true);
        };

        void start();
        return () => {
            active = false;
            resizeObserver?.disconnect();
            loadingScreenRef.current = null;
            pixiApp?.destroy();
        };
    }, []);

    useEffect(() => loadingScreenRef.current?.setFireTuning(tuning), [tuning, ready]);
    useEffect(() => loadingScreenRef.current?.setProgress(previewProgress), [previewProgress, ready]);
    useEffect(() => loadingScreenRef.current?.setFirePlayback(paused, scrubFrame), [paused, scrubFrame, ready]);

    if (import.meta.env.PROD || import.meta.env.VITE_IS_PROD === "true") {
        return <Typography sx={{ p: 4 }}>Loading fire editor is available only in development builds.</Typography>;
    }

    const zone = tuning.overall;
    const secondaryZone = tuning.secondary;
    const persist = (next: LoadingScreenFireTuning, message = "Сохранено локально") => {
        const normalized = writeStoredLoadingScreenFireTuning(next);
        setTuning(normalized);
        setStatus(message);
    };
    const updateGlobal = (
        patch: Partial<
            Pick<
                LoadingScreenFireTuning,
                | "baseLavaAlpha"
                | "progressGlowAlpha"
                | "medallionVisible"
                | "medallionSize"
                | "medallionStartOffsetX"
                | "medallionStartOffsetY"
                | "medallionEndOffsetX"
                | "medallionEndOffsetY"
                | "sectionCount"
                | "sectionAlpha"
            >
        >,
    ) => persist({ ...tuning, ...patch });
    const updateZone = (patch: Partial<LoadingScreenFireZoneTuning>) =>
        persist({ ...tuning, overall: { ...zone, ...patch } });
    const updateSecondaryZone = (patch: Partial<LoadingScreenFireZoneTuning>) =>
        persist({ ...tuning, secondary: { ...secondaryZone, ...patch } });
    const resetAll = () => {
        if (!window.confirm("Сбросить настройки огня загрузочного экрана?")) return;
        const next = resetStoredLoadingScreenFireTuning();
        setTuning(next);
        setStatus("Настройки сброшены");
    };
    const importJson = () => {
        const raw = window.prompt("Вставьте JSON настроек огня загрузочного экрана");
        if (!raw) return;
        try {
            persist(JSON.parse(raw) as LoadingScreenFireTuning, "JSON импортирован");
        } catch {
            setStatus("Ошибка JSON — проверьте синтаксис");
        }
    };
    const copyJson = async () => {
        try {
            await navigator.clipboard.writeText(JSON.stringify(tuning, null, 2));
            setStatus("JSON скопирован");
        } catch {
            setStatus("Не удалось скопировать JSON");
        }
    };
    const downloadJson = () => {
        const blob = new Blob([JSON.stringify(tuning, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "loading-screen-fire-tuning.json";
        anchor.click();
        URL.revokeObjectURL(url);
        setStatus("JSON скачан");
    };
    const applyPreset = (preset: "large" | "calm" | "bright") => {
        if (preset === "calm") {
            persist(
                {
                    ...DEFAULT_LOADING_SCREEN_FIRE_TUNING,
                    baseLavaAlpha: 0.86,
                    progressGlowAlpha: 0.1,
                    overall: {
                        ...DEFAULT_LOADING_SCREEN_FIRE_TUNING.overall,
                        alpha: 0.7,
                        fps: 10,
                        tiles: 6,
                        blendMode: "normal",
                    },
                },
                "Пресет «Спокойный» применён",
            );
        } else if (preset === "bright") {
            persist(
                {
                    ...DEFAULT_LOADING_SCREEN_FIRE_TUNING,
                    baseLavaAlpha: 0.62,
                    progressGlowAlpha: 0.28,
                    overall: {
                        ...DEFAULT_LOADING_SCREEN_FIRE_TUNING.overall,
                        alpha: 1.1,
                        fps: 18,
                        tiles: 6,
                        blendMode: "screen",
                    },
                },
                "Пресет «Яркий» применён",
            );
        } else {
            persist(DEFAULT_LOADING_SCREEN_FIRE_TUNING, "Пресет «Крупный огонь» применён");
        }
    };

    return (
        <Box sx={{ position: "fixed", inset: 0, overflow: "hidden", bgcolor: "#000" }}>
            <Box ref={hostRef} sx={{ position: "absolute", inset: 0 }}>
                <canvas ref={canvasRef} />
            </Box>

            {!ready && (
                <Typography sx={{ position: "fixed", inset: "50% auto auto 50%", color: "#e7bf75" }}>
                    Загрузка предпросмотра…
                </Typography>
            )}

            {collapsed ? (
                <Button
                    variant="solid"
                    color="warning"
                    onClick={() => setCollapsed(false)}
                    sx={{ position: "fixed", zIndex: 14000, top: 14, [dock]: 14 }}
                >
                    LOADING FIRE
                </Button>
            ) : (
                <Sheet
                    sx={{
                        position: "fixed",
                        zIndex: 14000,
                        top: 14,
                        [dock]: 14,
                        width: 438,
                        maxHeight: "calc(100vh - 28px)",
                        overflowY: "auto",
                        p: 2,
                        color: hocColors.parchment,
                        bgcolor: "rgba(14,9,5,.96)",
                        border: `1px solid ${hocColors.orangeBorder}`,
                        borderRadius: "14px",
                        boxShadow: "0 16px 46px rgba(0,0,0,.72)",
                    }}
                >
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Typography level="h3" sx={{ flex: 1, color: "#e0c999", fontFamily: hocDisplayFontFamily }}>
                            LOADING FIRE EDITOR
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
                    <Typography level="body-xs" sx={{ mt: 0.5, color: hocColors.muted }}>
                        Первый огонь зеркальный; второй — один непрерывный верхний слой без отражения.
                    </Typography>

                    <Typography level="title-md" sx={{ mt: 1.5, mb: 0.75, color: "#ffb34f" }}>
                        Предпросмотр
                    </Typography>
                    <Box sx={{ display: "grid", gap: 1 }}>
                        <ValueControl
                            label="Прогресс"
                            value={roundValue(previewProgress * 100)}
                            min={0}
                            max={100}
                            step={1}
                            suffix="%"
                            onChange={(value) => setPreviewProgress(value / 100)}
                        />
                        <ValueControl
                            label="Кадр"
                            value={scrubFrame}
                            min={0}
                            max={63}
                            step={1}
                            onChange={(value) => {
                                setScrubFrame(Math.round(value));
                                setPaused(true);
                            }}
                        />
                        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 0.75 }}>
                            <Button
                                size="sm"
                                variant={paused ? "solid" : "outlined"}
                                color="warning"
                                onClick={() => setPaused(!paused)}
                            >
                                {paused ? "▶ Играть" : "Ⅱ Пауза"}
                            </Button>
                            <Button
                                size="sm"
                                variant="outlined"
                                color="neutral"
                                onClick={() => setPreviewProgress(0.96)}
                            >
                                96%
                            </Button>
                        </Box>
                        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 0.75 }}>
                            <Button size="sm" variant="outlined" color="neutral" onClick={() => setPreviewProgress(0)}>
                                Начало 0%
                            </Button>
                            <Button size="sm" variant="outlined" color="neutral" onClick={() => setPreviewProgress(1)}>
                                Конец 100%
                            </Button>
                        </Box>
                    </Box>

                    <Typography level="title-md" sx={{ mt: 1.5, mb: 0.75, color: "#ffb34f" }}>
                        Базовая полоса
                    </Typography>
                    <Box sx={{ display: "grid", gap: 1 }}>
                        <ValueControl
                            label="Лава"
                            value={tuning.baseLavaAlpha}
                            min={0}
                            max={1.5}
                            step={0.01}
                            onChange={(baseLavaAlpha) => updateGlobal({ baseLavaAlpha })}
                        />
                        <ValueControl
                            label="Свечение"
                            value={tuning.progressGlowAlpha}
                            min={0}
                            max={1}
                            step={0.01}
                            onChange={(progressGlowAlpha) => updateGlobal({ progressGlowAlpha })}
                        />
                    </Box>

                    <Typography level="title-md" sx={{ mt: 1.5, mb: 0.75, color: "#ffb34f" }}>
                        Оформление ползунка
                    </Typography>
                    <Typography level="body-xs" sx={{ mb: 0.75, color: hocColors.muted }}>
                        Масштаб меняется относительно центра. Смещения начала и конца считаются от центров штатных
                        слотов.
                    </Typography>
                    <Box sx={{ display: "grid", gap: 1 }}>
                        <Button
                            size="sm"
                            variant={tuning.medallionVisible ? "solid" : "outlined"}
                            color={tuning.medallionVisible ? "warning" : "neutral"}
                            onClick={() => updateGlobal({ medallionVisible: !tuning.medallionVisible })}
                        >
                            {tuning.medallionVisible ? "Ползунок показан" : "Ползунок скрыт"}
                        </Button>
                        <ValueControl
                            label="Масштаб"
                            value={tuning.medallionSize}
                            min={20}
                            max={200}
                            step={1}
                            suffix="px"
                            onChange={(medallionSize) => updateGlobal({ medallionSize })}
                        />
                        <ValueControl
                            label="Начало X (0%)"
                            value={tuning.medallionStartOffsetX}
                            min={-1600}
                            max={250}
                            step={0.5}
                            suffix="px"
                            onChange={(medallionStartOffsetX) => {
                                setPreviewProgress(0);
                                updateGlobal({ medallionStartOffsetX });
                            }}
                        />
                        <ValueControl
                            label="Начало Y (0%)"
                            value={tuning.medallionStartOffsetY}
                            min={-250}
                            max={250}
                            step={0.5}
                            suffix="px"
                            onChange={(medallionStartOffsetY) => {
                                setPreviewProgress(0);
                                updateGlobal({ medallionStartOffsetY });
                            }}
                        />
                        <ValueControl
                            label="Конец X (100%)"
                            value={tuning.medallionEndOffsetX}
                            min={-250}
                            max={250}
                            step={0.5}
                            suffix="px"
                            onChange={(medallionEndOffsetX) => {
                                setPreviewProgress(1);
                                updateGlobal({ medallionEndOffsetX });
                            }}
                        />
                        <ValueControl
                            label="Конец Y (100%)"
                            value={tuning.medallionEndOffsetY}
                            min={-250}
                            max={250}
                            step={0.5}
                            suffix="px"
                            onChange={(medallionEndOffsetY) => {
                                setPreviewProgress(1);
                                updateGlobal({ medallionEndOffsetY });
                            }}
                        />
                        <ValueControl
                            label="Секций"
                            value={tuning.sectionCount}
                            min={1}
                            max={12}
                            step={1}
                            onChange={(sectionCount) => updateGlobal({ sectionCount: Math.round(sectionCount) })}
                        />
                        <ValueControl
                            label="Деления"
                            value={tuning.sectionAlpha}
                            min={0}
                            max={1}
                            step={0.01}
                            onChange={(sectionAlpha) => updateGlobal({ sectionAlpha })}
                        />
                    </Box>

                    <Typography level="title-md" sx={{ mt: 1.5, mb: 0.75, color: "#ffb34f" }}>
                        Общий огонь 1
                    </Typography>
                    <Typography level="body-xs" sx={{ mt: 0.75, color: hocColors.muted }}>
                        Фон, маска и кадры левой половины отражаются 1:1 относительно центра. Верхнего обрезания нет.
                    </Typography>
                    <Box sx={{ mt: 0.75, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0.75 }}>
                        <Button
                            size="sm"
                            variant={zone.enabled ? "solid" : "outlined"}
                            color={zone.enabled ? "success" : "neutral"}
                            onClick={() => updateZone({ enabled: !zone.enabled })}
                        >
                            {zone.enabled ? "Включена" : "Выключена"}
                        </Button>
                        <Button
                            size="sm"
                            variant={zone.alternateMirror ? "solid" : "outlined"}
                            color="neutral"
                            onClick={() => updateZone({ alternateMirror: !zone.alternateMirror })}
                        >
                            Зеркалить через один
                        </Button>
                    </Box>

                    <Typography level="body-sm" sx={{ mt: 1.25, mb: 0.5, color: hocColors.mutedStrong }}>
                        Тип огня
                    </Typography>
                    <ChoiceButtons
                        value={zone.fireType}
                        options={FIRE_TYPE_OPTIONS}
                        onChange={(fireType) => updateZone({ fireType })}
                    />

                    <Typography level="body-sm" sx={{ mt: 1.25, mb: 0.5, color: hocColors.mutedStrong }}>
                        Смешивание
                    </Typography>
                    <ChoiceButtons
                        value={zone.blendMode}
                        options={BLEND_MODE_OPTIONS}
                        onChange={(blendMode) => updateZone({ blendMode })}
                    />

                    <Box sx={{ mt: 1.25, display: "grid", gap: 1 }}>
                        <ValueControl
                            label="X"
                            value={zone.offsetX}
                            min={-160}
                            max={160}
                            step={0.5}
                            suffix="px"
                            onChange={(offsetX) => updateZone({ offsetX })}
                        />
                        <ValueControl
                            label="Y"
                            value={zone.offsetY}
                            min={-160}
                            max={160}
                            step={0.5}
                            suffix="px"
                            onChange={(offsetY) => updateZone({ offsetY })}
                        />
                        <ValueControl
                            label="Ширина ½"
                            value={zone.width}
                            min={1}
                            max={900}
                            step={1}
                            suffix="px"
                            onChange={(width) => updateZone({ width })}
                        />
                        <ValueControl
                            label="Высота"
                            value={roundValue(zone.height)}
                            min={1}
                            max={400}
                            step={0.1}
                            suffix="px"
                            onChange={(height) => updateZone({ height })}
                        />
                        <ValueControl
                            label="Выход снизу"
                            value={zone.overflowBottom}
                            min={0}
                            max={140}
                            step={0.5}
                            suffix="px"
                            onChange={(overflowBottom) => updateZone({ overflowBottom })}
                        />
                        <ValueControl
                            label="Прозрачность"
                            value={zone.alpha}
                            min={0}
                            max={1.5}
                            step={0.01}
                            onChange={(alpha) => updateZone({ alpha })}
                        />
                        <ValueControl
                            label="FPS"
                            value={zone.fps}
                            min={0.25}
                            max={60}
                            step={0.25}
                            onChange={(fps) => updateZone({ fps })}
                        />
                        <ValueControl
                            label="Повторы"
                            value={zone.tiles}
                            min={1}
                            max={32}
                            step={1}
                            onChange={(tiles) => updateZone({ tiles })}
                        />
                        <ValueControl
                            label="Нач. кадр"
                            value={zone.frameOffset}
                            min={0}
                            max={63}
                            step={1}
                            onChange={(frameOffset) => updateZone({ frameOffset })}
                        />
                        <ValueControl
                            label="Шаг фазы"
                            value={zone.phaseStep}
                            min={0}
                            max={63}
                            step={1}
                            onChange={(phaseStep) => updateZone({ phaseStep })}
                        />
                        <ValueControl
                            label="Перекрытие"
                            value={zone.overlap}
                            min={0.5}
                            max={2.5}
                            step={0.01}
                            onChange={(overlap) => updateZone({ overlap })}
                        />
                        <Box
                            sx={{
                                display: "grid",
                                gridTemplateColumns: "102px 1fr 92px",
                                alignItems: "center",
                                gap: 1,
                            }}
                        >
                            <Typography level="body-sm" sx={{ color: hocColors.mutedStrong }}>
                                Оттенок
                            </Typography>
                            <Box
                                component="input"
                                type="color"
                                value={colorHex(zone.tint)}
                                onInput={(event) =>
                                    updateZone({
                                        tint: Number.parseInt((event.target as HTMLInputElement).value.slice(1), 16),
                                    })
                                }
                                sx={{
                                    width: "100%",
                                    height: 34,
                                    p: 0,
                                    border: 0,
                                    bgcolor: "transparent",
                                    cursor: "pointer",
                                }}
                            />
                            <Typography level="body-xs" sx={{ fontFamily: "monospace", color: hocColors.mutedStrong }}>
                                {colorHex(zone.tint)}
                            </Typography>
                        </Box>
                    </Box>

                    <Typography level="title-md" sx={{ mt: 1.5, mb: 0.75, color: "#ffb34f" }}>
                        Общий огонь 2
                    </Typography>
                    <Typography level="body-xs" sx={{ mt: 0.75, color: hocColors.muted }}>
                        Один непрерывный слой поверх первого огня. Горизонтального отражения и стыка по центру нет.
                    </Typography>
                    <Box sx={{ mt: 0.75 }}>
                        <Button
                            size="sm"
                            variant={secondaryZone.enabled ? "solid" : "outlined"}
                            color={secondaryZone.enabled ? "success" : "neutral"}
                            onClick={() => updateSecondaryZone({ enabled: !secondaryZone.enabled })}
                            sx={{ width: "100%" }}
                        >
                            {secondaryZone.enabled ? "Включена" : "Выключена"}
                        </Button>
                    </Box>

                    <Typography level="body-sm" sx={{ mt: 1.25, mb: 0.5, color: hocColors.mutedStrong }}>
                        Тип огня
                    </Typography>
                    <ChoiceButtons
                        value={secondaryZone.fireType}
                        options={FIRE_TYPE_OPTIONS}
                        onChange={(fireType) => updateSecondaryZone({ fireType })}
                    />

                    <Typography level="body-sm" sx={{ mt: 1.25, mb: 0.5, color: hocColors.mutedStrong }}>
                        Смешивание
                    </Typography>
                    <ChoiceButtons
                        value={secondaryZone.blendMode}
                        options={BLEND_MODE_OPTIONS}
                        onChange={(blendMode) => updateSecondaryZone({ blendMode })}
                    />

                    <Box sx={{ mt: 1.25, display: "grid", gap: 1 }}>
                        <ValueControl
                            label="X"
                            value={secondaryZone.offsetX}
                            min={-160}
                            max={1600}
                            step={0.5}
                            suffix="px"
                            onChange={(offsetX) => updateSecondaryZone({ offsetX })}
                        />
                        <ValueControl
                            label="Y"
                            value={secondaryZone.offsetY}
                            min={-160}
                            max={160}
                            step={0.5}
                            suffix="px"
                            onChange={(offsetY) => updateSecondaryZone({ offsetY })}
                        />
                        <ValueControl
                            label="Полуширина"
                            value={secondaryZone.width}
                            min={1}
                            max={900}
                            step={1}
                            suffix="px"
                            onChange={(width) => updateSecondaryZone({ width })}
                        />
                        <ValueControl
                            label="Высота"
                            value={roundValue(secondaryZone.height)}
                            min={1}
                            max={400}
                            step={0.1}
                            suffix="px"
                            onChange={(height) => updateSecondaryZone({ height })}
                        />
                        <ValueControl
                            label="Выход снизу"
                            value={secondaryZone.overflowBottom}
                            min={0}
                            max={140}
                            step={0.5}
                            suffix="px"
                            onChange={(overflowBottom) => updateSecondaryZone({ overflowBottom })}
                        />
                        <ValueControl
                            label="Прозрачность"
                            value={secondaryZone.alpha}
                            min={0}
                            max={1.5}
                            step={0.01}
                            onChange={(alpha) => updateSecondaryZone({ alpha })}
                        />
                        <ValueControl
                            label="FPS"
                            value={secondaryZone.fps}
                            min={0.25}
                            max={60}
                            step={0.25}
                            onChange={(fps) => updateSecondaryZone({ fps })}
                        />
                        <ValueControl
                            label="Повторы"
                            value={secondaryZone.tiles}
                            min={1}
                            max={32}
                            step={1}
                            onChange={(tiles) => updateSecondaryZone({ tiles })}
                        />
                        <ValueControl
                            label="Нач. кадр"
                            value={secondaryZone.frameOffset}
                            min={0}
                            max={63}
                            step={1}
                            onChange={(frameOffset) => updateSecondaryZone({ frameOffset })}
                        />
                        <ValueControl
                            label="Шаг фазы"
                            value={secondaryZone.phaseStep}
                            min={0}
                            max={63}
                            step={1}
                            onChange={(phaseStep) => updateSecondaryZone({ phaseStep })}
                        />
                        <ValueControl
                            label="Перекрытие"
                            value={secondaryZone.overlap}
                            min={0.5}
                            max={2.5}
                            step={0.01}
                            onChange={(overlap) => updateSecondaryZone({ overlap })}
                        />
                        <Box
                            sx={{
                                display: "grid",
                                gridTemplateColumns: "102px 1fr 92px",
                                alignItems: "center",
                                gap: 1,
                            }}
                        >
                            <Typography level="body-sm" sx={{ color: hocColors.mutedStrong }}>
                                Оттенок
                            </Typography>
                            <Box
                                component="input"
                                type="color"
                                value={colorHex(secondaryZone.tint)}
                                onInput={(event) =>
                                    updateSecondaryZone({
                                        tint: Number.parseInt((event.target as HTMLInputElement).value.slice(1), 16),
                                    })
                                }
                                sx={{
                                    width: "100%",
                                    height: 34,
                                    p: 0,
                                    border: 0,
                                    bgcolor: "transparent",
                                    cursor: "pointer",
                                }}
                            />
                            <Typography level="body-xs" sx={{ fontFamily: "monospace", color: hocColors.mutedStrong }}>
                                {colorHex(secondaryZone.tint)}
                            </Typography>
                        </Box>
                    </Box>

                    <Typography level="title-md" sx={{ mt: 1.5, mb: 0.75, color: "#ffb34f" }}>
                        Пресеты
                    </Typography>
                    <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0.75 }}>
                        <Button size="sm" variant="outlined" color="warning" onClick={() => applyPreset("large")}>
                            Крупный
                        </Button>
                        <Button size="sm" variant="outlined" color="warning" onClick={() => applyPreset("calm")}>
                            Спокойный
                        </Button>
                        <Button size="sm" variant="outlined" color="warning" onClick={() => applyPreset("bright")}>
                            Яркий
                        </Button>
                    </Box>

                    <Box sx={{ mt: 1.5, display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 0.75 }}>
                        <Button size="sm" variant="outlined" color="neutral" onClick={() => void copyJson()}>
                            Копировать JSON
                        </Button>
                        <Button size="sm" variant="outlined" color="neutral" onClick={importJson}>
                            Импорт JSON
                        </Button>
                        <Button size="sm" variant="outlined" color="neutral" onClick={downloadJson}>
                            Скачать JSON
                        </Button>
                        <Button size="sm" variant="outlined" color="danger" onClick={resetAll}>
                            Сбросить
                        </Button>
                    </Box>
                    <Typography level="body-xs" sx={{ mt: 1, color: hocColors.muted }}>
                        {status}
                    </Typography>
                </Sheet>
            )}
        </Box>
    );
};

export default LoadingScreenFireEditor;
