import { Box, Button, Input, Sheet, Typography } from "@mui/joy";
import React, { useState } from "react";

import { images } from "../generated/image_imports";
import { hocColors, hocDisplayFontFamily } from "./hocTheme";
import {
    DEFAULT_STUN_BADGE_TUNING,
    readStoredStunBadgeTuning,
    resetStoredStunBadgeTuning,
    stunBadgeLayout,
    writeStoredStunBadgeTuning,
    type StunBadgeTuning,
} from "./stunBadgeTuning";

const roundValue = (value: number): number => Math.round(value * 1000) / 1000;

const ValueControl: React.FC<{
    label: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    suffix?: string;
    onChange: (value: number) => void;
}> = ({ label, value, min, max, step = 0.01, suffix = "×", onChange }) => (
    <Box sx={{ display: "grid", gridTemplateColumns: "94px 1fr 108px", alignItems: "center", gap: 1 }}>
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
            sx={{ width: "100%", accentColor: hocColors.orange, cursor: "pointer" }}
        />
        <Input
            type="number"
            value={value}
            slotProps={{ input: { min, max, step } }}
            onChange={(event) => onChange(Number(event.target.value))}
            endDecorator={suffix}
            sx={{ minWidth: 0, bgcolor: "rgba(0,0,0,.34)", "& input": { px: 0.5, textAlign: "right" } }}
        />
    </Box>
);

const StunBadgePreview: React.FC<{ tuning: StunBadgeTuning }> = ({ tuning }) => {
    const flagHeight = 64;
    const flagWidth = 190;
    const flagLeft = 330;
    const flagCenterY = 170;
    const layout = stunBadgeLayout(flagHeight, flagLeft, tuning);

    return (
        <Box
            sx={{
                position: "relative",
                height: 340,
                overflow: "hidden",
                borderRadius: "12px",
                border: `1px solid ${hocColors.orangeBorder}`,
                backgroundColor: "#15110e",
                backgroundImage:
                    "linear-gradient(rgba(0,0,0,.34), rgba(0,0,0,.34)), repeating-linear-gradient(0deg, transparent 0 78px, rgba(0,0,0,.75) 79px 83px), repeating-linear-gradient(90deg, transparent 0 94px, rgba(0,0,0,.72) 95px 99px), radial-gradient(circle at 54% 20%, #5a3920, #17120f 65%)",
            }}
        >
            <Box
                component="img"
                src={images.stun_hand_forged}
                alt="Stun badge preview"
                sx={{
                    position: "absolute",
                    left: layout.centerX,
                    top: flagCenterY,
                    width: layout.width,
                    height: layout.height,
                    transform: "translate(-50%, -50%)",
                    imageRendering: "pixelated",
                    filter: "drop-shadow(0 4px 5px rgba(0,0,0,.75))",
                }}
            />
            <Box
                sx={{
                    position: "absolute",
                    left: flagLeft,
                    top: flagCenterY - flagHeight / 2,
                    width: flagWidth,
                    height: flagHeight,
                    display: "grid",
                    placeItems: "center",
                    boxSizing: "border-box",
                    pr: 2,
                    clipPath: "polygon(0 0, 100% 0, 88% 50%, 100% 100%, 0 100%)",
                    background: "linear-gradient(90deg, #176238, #0b3d20 50%, #176238)",
                    border: "2px solid #b08a45",
                    color: "#fff",
                    fontFamily: "Arial, sans-serif",
                    fontSize: 39,
                    fontWeight: 900,
                    lineHeight: 1,
                    textShadow: "0 2px 1px #000, 2px 0 1px #000, -2px 0 1px #000",
                    filter: "drop-shadow(0 4px 5px rgba(0,0,0,.75))",
                }}
            >
                99
            </Box>
            <Typography
                level="body-xs"
                sx={{ position: "absolute", left: 18, bottom: 14, color: "rgba(255,255,255,.58)" }}
            >
                Превью использует ту же формулу размеров и X-позиции, что и Pixi-рендер боя.
            </Typography>
        </Box>
    );
};

export const StunBadgeEditor: React.FC = () => {
    const [tuning, setTuning] = useState<StunBadgeTuning>(() => readStoredStunBadgeTuning());
    const [status, setStatus] = useState("Настройки сохраняются автоматически");

    if (import.meta.env.PROD || import.meta.env.VITE_IS_PROD === "true") {
        return <Typography sx={{ p: 4 }}>Stun-badge editor is available only in development builds.</Typography>;
    }

    const persist = (patch: Partial<StunBadgeTuning>) => {
        const next = writeStoredStunBadgeTuning({ ...tuning, ...patch });
        setTuning(next);
        setStatus("Сохранено локально · откройте Sandbox для проверки в бою");
    };

    const reset = () => {
        setTuning(resetStoredStunBadgeTuning());
        setStatus("Сброшено к игровым значениям");
    };

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(JSON.stringify(tuning, null, 2));
            setStatus("JSON скопирован");
        } catch {
            setStatus("Не удалось скопировать JSON");
        }
    };

    return (
        <Box
            sx={{
                minHeight: "100vh",
                boxSizing: "border-box",
                p: "32px clamp(18px, 4vw, 64px)",
                color: hocColors.parchment,
                bgcolor: "#080605",
                backgroundImage: "radial-gradient(circle at 50% 0%, rgba(113,55,21,.34), transparent 42%)",
            }}
        >
            <Box sx={{ width: "min(920px, 100%)", mx: "auto" }}>
                <Typography
                    level="h1"
                    sx={{ color: "#e0c999", fontFamily: hocDisplayFontFamily, letterSpacing: ".08em" }}
                >
                    STUN BADGE EDITOR
                </Typography>
                <Typography level="body-sm" sx={{ mt: 0.5, mb: 2, color: hocColors.mutedStrong }}>
                    Независимая ширина, высота и смещение по X для значка стана слева от флага количества.
                </Typography>

                <StunBadgePreview tuning={tuning} />

                <Sheet
                    sx={{
                        mt: 2,
                        p: 2,
                        display: "grid",
                        gap: 1.35,
                        color: hocColors.parchment,
                        bgcolor: "rgba(14,9,5,.96)",
                        border: `1px solid ${hocColors.orangeBorder}`,
                        borderRadius: "14px",
                    }}
                >
                    <ValueControl
                        label="Ширина"
                        value={tuning.widthScale}
                        min={0.5}
                        max={3}
                        onChange={(widthScale) => persist({ widthScale: roundValue(widthScale) })}
                    />
                    <ValueControl
                        label="Высота"
                        value={tuning.heightScale}
                        min={0.5}
                        max={3}
                        onChange={(heightScale) => persist({ heightScale: roundValue(heightScale) })}
                    />
                    <ValueControl
                        label="Ось X"
                        value={tuning.offsetXFlagHeights}
                        min={-1.5}
                        max={1.5}
                        suffix="фл."
                        onChange={(offsetXFlagHeights) =>
                            persist({ offsetXFlagHeights: roundValue(offsetXFlagHeights) })
                        }
                    />

                    <Typography level="body-xs" sx={{ color: hocColors.muted }}>
                        Масштабы считаются от высоты флага. Для оси X положительное значение двигает значок вправо,
                        отрицательное — влево.
                    </Typography>

                    <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap" }}>
                        <Button size="sm" variant="outlined" color="neutral" onClick={reset}>
                            Сбросить
                        </Button>
                        <Button size="sm" variant="outlined" color="warning" onClick={() => void copy()}>
                            Copy JSON
                        </Button>
                        <Button size="sm" variant="plain" color="neutral" onClick={() => window.location.assign("/")}>
                            ← Sandbox
                        </Button>
                    </Box>
                    <Typography level="body-xs" sx={{ color: hocColors.mutedStrong }}>
                        {status}
                    </Typography>
                    <Typography level="body-xs" sx={{ color: "rgba(255,255,255,.42)" }}>
                        Игровой baseline: {JSON.stringify(DEFAULT_STUN_BADGE_TUNING)}
                    </Typography>
                </Sheet>
            </Box>
        </Box>
    );
};

export default StunBadgeEditor;
