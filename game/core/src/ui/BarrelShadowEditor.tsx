import { GridVals, TeamVals } from "@heroesofcrypto/common";
import { Box, Button, Input, Sheet, Typography } from "@mui/joy";
import React, { useLayoutEffect, useState } from "react";

import { PREVIEW_PLACEMENT_GAME_ID, startPreviewPlaySession } from "../api/previewPlaySession";
import type { IWindowSize } from "../scenes/VisibleState";
import {
    DEFAULT_BARREL_SHADOW_TUNING,
    normalizeBarrelShadowTuning,
    readStoredBarrelShadowTuning,
    resetStoredBarrelShadowTuning,
    setBarrelShadowEditorActive,
    writeStoredBarrelShadowTuning,
    type BarrelShadowTuning,
} from "./barrelShadowTuning";
import { setBattlefieldShadowEditorActive } from "./battlefieldShadowTuning";
import { hocColors, hocDisplayFontFamily } from "./hocTheme";
import { RankedGameView } from "./RankedGameView";

const ValueControl: React.FC<{
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (value: number) => void;
}> = ({ label, value, min, max, step, onChange }) => (
    <Box sx={{ display: "grid", gridTemplateColumns: "105px 1fr 78px", alignItems: "center", gap: 1 }}>
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
            sx={{ minWidth: 0, bgcolor: "rgba(0,0,0,.34)", "& input": { px: 0.5, textAlign: "right" } }}
        />
    </Box>
);

export const BarrelShadowEditor: React.FC<{ windowSize: IWindowSize }> = ({ windowSize }) => {
    const [ready, setReady] = useState(false);
    const [tuning, setTuning] = useState<BarrelShadowTuning>(readStoredBarrelShadowTuning);
    const [status, setStatus] = useState("Настройки сохраняются автоматически");
    const [collapsed, setCollapsed] = useState(false);

    useLayoutEffect(() => {
        setBarrelShadowEditorActive(true);
        setBattlefieldShadowEditorActive(true);
        startPreviewPlaySession({
            userTeam: TeamVals.LEFT,
            gridType: GridVals.BLOCK_CENTER,
            leftArmy: [],
            rightArmy: [],
        });
        setReady(true);
        return () => {
            setBarrelShadowEditorActive(false);
            setBattlefieldShadowEditorActive(false);
        };
    }, []);

    if (import.meta.env.PROD || import.meta.env.VITE_IS_PROD === "true") {
        return <Typography sx={{ p: 4 }}>Barrel shadow editor is available only in development builds.</Typography>;
    }

    const update = (patch: Partial<BarrelShadowTuning>) => {
        const next = normalizeBarrelShadowTuning({ ...tuning, ...patch });
        setTuning(next);
        writeStoredBarrelShadowTuning(next);
        setStatus("Сохранено в редакторе");
    };

    const copyJson = async () => {
        try {
            await navigator.clipboard.writeText(JSON.stringify(tuning, null, 2));
            setStatus("JSON скопирован");
        } catch {
            setStatus("Не удалось скопировать JSON");
        }
    };

    return (
        <Box sx={{ position: "fixed", inset: 0, overflow: "hidden", bgcolor: "#000" }}>
            {ready ? (
                <RankedGameView gameId={PREVIEW_PLACEMENT_GAME_ID} userTeam={TeamVals.LEFT} windowSize={windowSize} />
            ) : null}
            {collapsed ? (
                <Button
                    variant="solid"
                    color="warning"
                    onClick={() => setCollapsed(false)}
                    sx={{ position: "fixed", zIndex: 14000, top: 14, right: 14 }}
                >
                    BARREL SHADOWS
                </Button>
            ) : (
                <Sheet
                    sx={{
                        position: "fixed",
                        zIndex: 14000,
                        top: 14,
                        right: 14,
                        width: 430,
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
                            BARREL SHADOWS
                        </Typography>
                        <Button size="sm" variant="plain" color="neutral" onClick={() => setCollapsed(true)}>
                            —
                        </Button>
                    </Box>
                    <Typography level="body-xs" sx={{ mt: 0.5, color: hocColors.muted }}>
                        Девять вариантов бочек стоят на верхней линии. Настройки применяются ко всем игровым бочкам
                        сразу; освещение карты продолжает влиять на ширину и длину проекции.
                    </Typography>
                    <Box sx={{ mt: 1.25, display: "grid", gap: 1 }}>
                        <ValueControl
                            label="X (клетки)"
                            value={tuning.offsetXCells}
                            min={-2}
                            max={2}
                            step={0.01}
                            onChange={(offsetXCells) => update({ offsetXCells })}
                        />
                        <ValueControl
                            label="Y (клетки)"
                            value={tuning.offsetYCells}
                            min={-2}
                            max={2}
                            step={0.01}
                            onChange={(offsetYCells) => update({ offsetYCells })}
                        />
                        <ValueControl
                            label="Ширина ×"
                            value={tuning.widthScale}
                            min={0.1}
                            max={3}
                            step={0.01}
                            onChange={(widthScale) => update({ widthScale })}
                        />
                        <ValueControl
                            label="Длина (кл.)"
                            value={tuning.lengthCells}
                            min={0.05}
                            max={2.5}
                            step={0.01}
                            onChange={(lengthCells) => update({ lengthCells })}
                        />
                        <ValueControl
                            label="Прозрачность"
                            value={tuning.alpha}
                            min={0}
                            max={1}
                            step={0.01}
                            onChange={(alpha) => update({ alpha })}
                        />
                        <ValueControl
                            label="Поворот °"
                            value={tuning.rotationDegrees}
                            min={-60}
                            max={60}
                            step={1}
                            onChange={(rotationDegrees) => update({ rotationDegrees })}
                        />
                    </Box>
                    <Box sx={{ mt: 1.5, display: "flex", gap: 0.75, flexWrap: "wrap" }}>
                        <Button size="sm" variant="outlined" color="warning" onClick={() => void copyJson()}>
                            Copy JSON
                        </Button>
                        <Button
                            size="sm"
                            variant="outlined"
                            color="danger"
                            onClick={() => {
                                setTuning(resetStoredBarrelShadowTuning());
                                setStatus("Настройки сброшены");
                            }}
                        >
                            Reset
                        </Button>
                    </Box>
                    <Typography level="body-xs" sx={{ mt: 1, color: hocColors.mutedStrong }}>
                        {status} · defaults: length {DEFAULT_BARREL_SHADOW_TUNING.lengthCells}, alpha{" "}
                        {DEFAULT_BARREL_SHADOW_TUNING.alpha}
                    </Typography>
                </Sheet>
            )}
        </Box>
    );
};
