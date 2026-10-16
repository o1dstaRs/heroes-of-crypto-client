import { Box, Button, Input, Sheet, Typography } from "@mui/joy";
import React, { useEffect, useState } from "react";

import { hocColors, hocDisplayFontFamily } from "./hocTheme";
import {
    DEFAULT_PICK_LANTERN_FIRE_TUNINGS,
    readPickLanternFireTuning,
    resetPickLanternFireTuning,
    writePickLanternFireTuning,
    type PickLanternFireSlot,
    type PickLanternFireTuning,
} from "./PickAndBan/pickLanternFireTuning";

const ValueControl: React.FC<{
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    suffix?: string;
    onChange: (value: number) => void;
}> = ({ label, value, min, max, step, suffix, onChange }) => (
    <Box sx={{ display: "grid", gridTemplateColumns: "92px 1fr 92px", alignItems: "center", gap: 1 }}>
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
            sx={{ width: "100%", accentColor: "#f2ad3f", cursor: "pointer" }}
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

export const PickLanternFireEditor: React.FC<React.PropsWithChildren> = ({ children }) => {
    const [selectedSlot, setSelectedSlot] = useState<PickLanternFireSlot>(0);
    const [tuning, setTuning] = useState<PickLanternFireTuning>(() => readPickLanternFireTuning(0));
    const [dock, setDock] = useState<"left" | "right">("right");
    const [collapsed, setCollapsed] = useState(false);
    const [status, setStatus] = useState("Настройки сохраняются автоматически");

    useEffect(() => {
        // The editor is a two-layer calibration surface: every fresh launch starts with both flames visible.
        // This only restores a development localStorage override that may have been switched off manually;
        // both approved game defaults are enabled independently outside the editor as well.
        if (import.meta.env.PROD || import.meta.env.VITE_IS_PROD === "true") return;
        const second = readPickLanternFireTuning(1);
        if (!second.enabled) writePickLanternFireTuning({ ...second, enabled: true }, 1);
    }, []);

    if (import.meta.env.PROD || import.meta.env.VITE_IS_PROD === "true") {
        return <Typography sx={{ p: 4 }}>Lantern fire editor is available only in development builds.</Typography>;
    }

    const update = (patch: Partial<PickLanternFireTuning>) => {
        const next = writePickLanternFireTuning({ ...tuning, ...patch }, selectedSlot);
        setTuning(next);
        setStatus(`Огонь ${selectedSlot + 1}: сохранено локально`);
    };
    const reset = () => {
        const next = resetPickLanternFireTuning(selectedSlot);
        setTuning(next);
        setStatus(`Огонь ${selectedSlot + 1}: сброшено к игровым значениям`);
    };
    const selectSlot = (slot: PickLanternFireSlot) => {
        setSelectedSlot(slot);
        setTuning(readPickLanternFireTuning(slot));
        setStatus(`Настройка огня ${slot + 1}`);
    };
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(JSON.stringify(tuning, null, 2));
            setStatus(`JSON огня ${selectedSlot + 1} скопирован`);
        } catch {
            setStatus("Не удалось скопировать JSON");
        }
    };
    return (
        <>
            {children}
            {collapsed ? (
                <Button
                    color="warning"
                    onClick={() => setCollapsed(false)}
                    sx={{ position: "fixed", zIndex: 14000, top: 14, [dock]: 14 }}
                >
                    LANTERN FIRE
                </Button>
            ) : (
                <Sheet
                    sx={{
                        position: "fixed",
                        zIndex: 14000,
                        top: 14,
                        [dock]: 14,
                        width: 440,
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
                            LANTERN FIRE
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
                        Нижняя точка фиксирована: высота растёт только вверх.
                    </Typography>

                    <Box sx={{ mt: 1.25, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0.75 }}>
                        {([0, 1] as const).map((slot) => (
                            <Button
                                key={slot}
                                size="sm"
                                variant={selectedSlot === slot ? "solid" : "outlined"}
                                color={selectedSlot === slot ? "primary" : "neutral"}
                                onClick={() => selectSlot(slot)}
                            >
                                Огонь {slot + 1}
                            </Button>
                        ))}
                    </Box>

                    <Typography level="title-sm" sx={{ mt: 1.5, color: "#ffd15a" }}>
                        Источник огня {selectedSlot + 1}
                    </Typography>
                    <Box sx={{ mt: 0.75, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0.75 }}>
                        <Button
                            size="sm"
                            variant={tuning.source === "natural-atlas" ? "solid" : "outlined"}
                            color={tuning.source === "natural-atlas" ? "warning" : "neutral"}
                            onClick={() => update({ source: "natural-atlas" })}
                        >
                            Натуральный атлас
                        </Button>
                        <Button
                            size="sm"
                            variant={tuning.source === "candle-video" ? "solid" : "outlined"}
                            color={tuning.source === "candle-video" ? "warning" : "neutral"}
                            onClick={() => update({ source: "candle-video" })}
                        >
                            Свеча из MP4
                        </Button>
                    </Box>
                    <Button
                        size="sm"
                        variant={tuning.enabled ? "solid" : "outlined"}
                        color={tuning.enabled ? "success" : "neutral"}
                        onClick={() => update({ enabled: !tuning.enabled })}
                        sx={{ mt: 0.75, width: "100%" }}
                    >
                        {tuning.enabled ? "Огонь включён" : "Огонь выключен"}
                    </Button>

                    <Box sx={{ mt: 1.5, display: "grid", gap: 1.05 }}>
                        <ValueControl
                            label="X низа"
                            value={tuning.anchorX}
                            min={0}
                            max={100}
                            step={0.01}
                            suffix="%"
                            onChange={(anchorX) => update({ anchorX })}
                        />
                        <ValueControl
                            label="Y низа"
                            value={tuning.anchorY}
                            min={0}
                            max={100}
                            step={0.01}
                            suffix="%"
                            onChange={(anchorY) => update({ anchorY })}
                        />
                        <ValueControl
                            label="Ширина"
                            value={tuning.width}
                            min={0.2}
                            max={20}
                            step={0.05}
                            suffix="%"
                            onChange={(width) => update({ width })}
                        />
                        <ValueControl
                            label="Высота"
                            value={tuning.height}
                            min={0.2}
                            max={30}
                            step={0.05}
                            suffix="%"
                            onChange={(height) => update({ height })}
                        />
                        <ValueControl
                            label="Прозрачн."
                            value={tuning.opacity}
                            min={0}
                            max={1.5}
                            step={0.01}
                            onChange={(opacity) => update({ opacity })}
                        />
                        {tuning.source === "natural-atlas" ? (
                            <ValueControl
                                label="FPS"
                                value={tuning.fps}
                                min={1}
                                max={30}
                                step={1}
                                onChange={(fps) => update({ fps })}
                            />
                        ) : (
                            <ValueControl
                                label="Скорость"
                                value={tuning.playbackRate}
                                min={0.1}
                                max={2.5}
                                step={0.01}
                                suffix="×"
                                onChange={(playbackRate) => update({ playbackRate })}
                            />
                        )}
                        <ValueControl
                            label="Яркость"
                            value={tuning.brightness}
                            min={0.2}
                            max={3}
                            step={0.01}
                            onChange={(brightness) => update({ brightness })}
                        />
                        <ValueControl
                            label="Контраст"
                            value={tuning.contrast}
                            min={0.2}
                            max={3}
                            step={0.01}
                            onChange={(contrast) => update({ contrast })}
                        />
                        <ValueControl
                            label="Насыщ."
                            value={tuning.saturation}
                            min={0}
                            max={3}
                            step={0.01}
                            onChange={(saturation) => update({ saturation })}
                        />
                        <ValueControl
                            label="Оттенок"
                            value={tuning.hue}
                            min={-90}
                            max={90}
                            step={1}
                            suffix="°"
                            onChange={(hue) => update({ hue })}
                        />
                        {tuning.source === "natural-atlas" && (
                            <>
                                <ValueControl
                                    label="Убрать чёрн."
                                    value={tuning.blackCutoff}
                                    min={0}
                                    max={0.75}
                                    step={0.01}
                                    onChange={(blackCutoff) => update({ blackCutoff })}
                                />
                                <ValueControl
                                    label="Густота"
                                    value={tuning.density}
                                    min={0}
                                    max={6}
                                    step={0.1}
                                    onChange={(density) => update({ density })}
                                />
                            </>
                        )}
                        <ValueControl
                            label="Свечение"
                            value={tuning.glowOpacity}
                            min={0}
                            max={1.5}
                            step={0.01}
                            onChange={(glowOpacity) => update({ glowOpacity })}
                        />
                        <ValueControl
                            label="Размер света"
                            value={tuning.glowSize}
                            min={0.5}
                            max={4}
                            step={0.01}
                            suffix="×"
                            onChange={(glowSize) => update({ glowSize })}
                        />
                        <ValueControl
                            label="Маска"
                            value={tuning.maskInset}
                            min={0}
                            max={40}
                            step={0.5}
                            suffix="%"
                            onChange={(maskInset) => update({ maskInset })}
                        />
                    </Box>

                    <Box sx={{ mt: 1.5, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0.75 }}>
                        <Button size="sm" variant="outlined" color="neutral" onClick={reset}>
                            Сбросить
                        </Button>
                        <Button size="sm" variant="outlined" color="warning" onClick={() => void copy()}>
                            Копировать JSON
                        </Button>
                    </Box>
                    <Typography level="body-xs" sx={{ mt: 1, color: hocColors.muted }}>
                        {status} · игровой источник: {DEFAULT_PICK_LANTERN_FIRE_TUNINGS[selectedSlot].source}
                    </Typography>
                </Sheet>
            )}
        </>
    );
};
