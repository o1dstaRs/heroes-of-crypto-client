import { GridVals, TeamVals } from "@heroesofcrypto/common";
import { Box, Button, Input, Sheet, Typography } from "@mui/joy";
import React, { useEffect, useMemo, useState } from "react";

import { PREVIEW_PLACEMENT_GAME_ID, startPreviewPlaySession } from "../api/previewPlaySession";
import type { IWindowSize } from "../scenes/VisibleState";
import {
    AMBIENT_FIRE_DEFINITIONS,
    baseAmbientFireTuning,
    normalizeAmbientFireTuning,
    readStoredAmbientFireTuning,
    setAmbientFireEditorSelection,
    writeStoredAmbientFireTuning,
    type AmbientFireDefinition,
    type AmbientFireTuning,
} from "../scenes/sandbox/ambientFireTuning";
import { hocColors, hocDisplayFontFamily } from "./hocTheme";
import { RankedGameView } from "./RankedGameView";

const roundValue = (value: number): number => Math.round(value * 1000) / 1000;

const tuningFor = (
    definition: AmbientFireDefinition,
    overrides: Record<string, AmbientFireTuning>,
): AmbientFireTuning => overrides[definition.key] ?? baseAmbientFireTuning(definition);

const ValueControl: React.FC<{
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    suffix?: string;
    onChange: (value: number) => void;
}> = ({ label, value, min, max, step, suffix, onChange }) => (
    <Box sx={{ display: "grid", gridTemplateColumns: "82px 1fr 92px", alignItems: "center", gap: 1 }}>
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
            sx={{
                minWidth: 0,
                bgcolor: "rgba(0,0,0,.34)",
                borderColor: hocColors.orangeBorder,
                "& input": { px: 0.5, textAlign: "right" },
            }}
        />
    </Box>
);

const nudgeButtonSx = { minWidth: 0, px: 1, fontFamily: "monospace" } as const;

const currentTuningExport = (
    definitions: readonly AmbientFireDefinition[],
    overrides: Record<string, AmbientFireTuning>,
): Record<string, AmbientFireTuning> =>
    Object.fromEntries(definitions.map((definition) => [definition.key, tuningFor(definition, overrides)]));

const formatTypeScript = (
    definitions: readonly AmbientFireDefinition[],
    overrides: Record<string, AmbientFireTuning>,
): string =>
    definitions
        .map((definition) => {
            const tuning = tuningFor(definition, overrides);
            return [
                `// ${definition.label}`,
                `sourceX: ${tuning.sourceX},`,
                `sourceY: ${tuning.sourceY},`,
                `sourceWidth: ${tuning.sourceWidth},`,
                `sourceHeight: ${tuning.sourceHeight},`,
                `alpha: ${tuning.alpha},`,
                `glowAlpha: ${tuning.glowAlpha},`,
                `contactGlowStrength: ${tuning.contactGlowStrength},`,
            ].join("\n");
        })
        .join("\n\n");

export const AmbientFireTuningEditor: React.FC<{
    windowSize: IWindowSize;
    definitions?: readonly AmbientFireDefinition[];
    title?: string;
}> = ({ windowSize, definitions = AMBIENT_FIRE_DEFINITIONS, title = "FIRE POSITION EDITOR" }) => {
    const [selectedKey, setSelectedKey] = useState(
        definitions === AMBIENT_FIRE_DEFINITIONS
            ? AMBIENT_FIRE_DEFINITIONS[2].key
            : (definitions[0]?.key ?? AMBIENT_FIRE_DEFINITIONS[0].key),
    );
    const [overrides, setOverrides] = useState<Record<string, AmbientFireTuning>>(() => readStoredAmbientFireTuning());
    const [status, setStatus] = useState("Настройки сохраняются автоматически");
    const [dock, setDock] = useState<"left" | "right">("right");
    const [collapsed, setCollapsed] = useState(false);

    useMemo(
        () =>
            startPreviewPlaySession({
                userTeam: TeamVals.LEFT,
                gridType: GridVals.NORMAL,
                leftArmy: [],
                rightArmy: [],
            }),
        [],
    );

    useEffect(() => {
        setAmbientFireEditorSelection(selectedKey);
        return () => setAmbientFireEditorSelection(undefined);
    }, [selectedKey]);

    if (import.meta.env.PROD || import.meta.env.VITE_IS_PROD === "true") {
        return <Typography sx={{ p: 4 }}>Ambient fire editor is available only in development builds.</Typography>;
    }

    const selectedDefinition =
        definitions.find((definition) => definition.key === selectedKey) ??
        definitions[0] ??
        AMBIENT_FIRE_DEFINITIONS[0];
    const tuning = tuningFor(selectedDefinition, overrides);

    const persist = (next: Record<string, AmbientFireTuning>, message = "Сохранено локально") => {
        setOverrides(next);
        writeStoredAmbientFireTuning(next);
        setStatus(message);
    };
    const updateTuning = (patch: Partial<AmbientFireTuning>) => {
        const nextTuning = normalizeAmbientFireTuning(
            { ...tuningFor(selectedDefinition, overrides), ...patch },
            baseAmbientFireTuning(selectedDefinition),
        );
        persist({ ...overrides, [selectedDefinition.key]: nextTuning });
    };
    const resetCurrent = () => {
        const next = { ...overrides };
        delete next[selectedDefinition.key];
        persist(next, `${selectedDefinition.label}: сброшено`);
    };
    const resetAll = () => {
        if (!window.confirm("Сбросить положение и размеры огней в этой панели?")) return;
        const scopedKeys = new Set(definitions.map((definition) => definition.key));
        persist(
            Object.fromEntries(Object.entries(overrides).filter(([key]) => !scopedKeys.has(key))),
            "Выбранные огни сброшены",
        );
    };
    const copyText = async (text: string, message: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setStatus(message);
        } catch {
            setStatus("Не удалось скопировать — разрешите доступ к буферу обмена");
        }
    };
    const nudge = (field: keyof AmbientFireTuning, delta: number) =>
        updateTuning({ [field]: roundValue(tuning[field] + delta) });

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
                    FIRE EDITOR
                </Button>
            ) : (
                <Sheet
                    sx={{
                        position: "fixed",
                        zIndex: 14000,
                        top: 14,
                        [dock]: 14,
                        width: 410,
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
                            {title}
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
                        Координаты исходного арта: 1576×1378 px. Бирюзовая точка — неподвижное основание пламени.
                    </Typography>

                    <Box sx={{ mt: 1.25, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0.75 }}>
                        {definitions.map((definition) => (
                            <Button
                                key={definition.key}
                                size="sm"
                                variant={definition.key === selectedKey ? "solid" : "outlined"}
                                color={definition.key === selectedKey ? "warning" : "neutral"}
                                onClick={() => setSelectedKey(definition.key)}
                                sx={{ minWidth: 0 }}
                            >
                                {definition.label}
                            </Button>
                        ))}
                    </Box>

                    <Typography level="title-lg" sx={{ mt: 1.5, color: "#ffd15a" }}>
                        {selectedDefinition.label}
                    </Typography>

                    <Box sx={{ mt: 1, display: "grid", gap: 1.1 }}>
                        <ValueControl
                            label="X центра"
                            value={tuning.sourceX}
                            min={-100}
                            max={1676}
                            step={0.1}
                            suffix="px"
                            onChange={(sourceX) => updateTuning({ sourceX })}
                        />
                        <ValueControl
                            label="Y низа"
                            value={tuning.sourceY}
                            min={-100}
                            max={1478}
                            step={0.1}
                            suffix="px"
                            onChange={(sourceY) => updateTuning({ sourceY })}
                        />
                        <ValueControl
                            label="Ширина"
                            value={tuning.sourceWidth}
                            min={10}
                            max={500}
                            step={0.1}
                            suffix="px"
                            onChange={(sourceWidth) => updateTuning({ sourceWidth })}
                        />
                        <ValueControl
                            label="Высота"
                            value={tuning.sourceHeight}
                            min={5}
                            max={300}
                            step={0.1}
                            suffix="px"
                            onChange={(sourceHeight) => updateTuning({ sourceHeight })}
                        />
                        <ValueControl
                            label="Плотность"
                            value={tuning.alpha}
                            min={0}
                            max={1.5}
                            step={0.01}
                            onChange={(alpha) => updateTuning({ alpha })}
                        />
                        <ValueControl
                            label="Свечение"
                            value={tuning.glowAlpha}
                            min={0}
                            max={1.5}
                            step={0.01}
                            onChange={(glowAlpha) => updateTuning({ glowAlpha })}
                        />
                        {selectedDefinition.key.includes("furnace") && (
                            <ValueControl
                                label="Свет снизу"
                                value={tuning.contactGlowStrength}
                                min={0}
                                max={3}
                                step={0.01}
                                onChange={(contactGlowStrength) => updateTuning({ contactGlowStrength })}
                            />
                        )}
                    </Box>

                    <Typography level="body-xs" sx={{ mt: 1.5, mb: 0.65, color: hocColors.muted }}>
                        Точная подстройка
                    </Typography>
                    <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0.6 }}>
                        <Button
                            size="sm"
                            variant="outlined"
                            color="neutral"
                            sx={nudgeButtonSx}
                            onClick={() => nudge("sourceX", -0.1)}
                        >
                            X −0.1
                        </Button>
                        <Button
                            size="sm"
                            variant="outlined"
                            color="neutral"
                            sx={nudgeButtonSx}
                            onClick={() => nudge("sourceX", 0.1)}
                        >
                            X +0.1
                        </Button>
                        <Button
                            size="sm"
                            variant="outlined"
                            color="neutral"
                            sx={nudgeButtonSx}
                            onClick={() => nudge("sourceY", -0.1)}
                        >
                            Y −0.1
                        </Button>
                        <Button
                            size="sm"
                            variant="outlined"
                            color="neutral"
                            sx={nudgeButtonSx}
                            onClick={() => nudge("sourceY", 0.1)}
                        >
                            Y +0.1
                        </Button>
                        <Button
                            size="sm"
                            variant="outlined"
                            color="neutral"
                            sx={nudgeButtonSx}
                            onClick={() => nudge("sourceWidth", -1)}
                        >
                            W −1
                        </Button>
                        <Button
                            size="sm"
                            variant="outlined"
                            color="neutral"
                            sx={nudgeButtonSx}
                            onClick={() => nudge("sourceWidth", 1)}
                        >
                            W +1
                        </Button>
                        <Button
                            size="sm"
                            variant="outlined"
                            color="neutral"
                            sx={nudgeButtonSx}
                            onClick={() => nudge("sourceHeight", -1)}
                        >
                            H −1
                        </Button>
                        <Button
                            size="sm"
                            variant="outlined"
                            color="neutral"
                            sx={nudgeButtonSx}
                            onClick={() => nudge("sourceHeight", 1)}
                        >
                            H +1
                        </Button>
                    </Box>

                    <Box sx={{ mt: 1.5, display: "flex", gap: 0.75, flexWrap: "wrap" }}>
                        <Button
                            size="sm"
                            variant="outlined"
                            color="neutral"
                            disabled={!overrides[selectedDefinition.key]}
                            onClick={resetCurrent}
                        >
                            Reset current
                        </Button>
                        <Button
                            size="sm"
                            variant="outlined"
                            color="danger"
                            disabled={!Object.keys(overrides).length}
                            onClick={resetAll}
                        >
                            Reset all
                        </Button>
                        <Button
                            size="sm"
                            variant="outlined"
                            color="neutral"
                            onClick={() =>
                                void copyText(
                                    JSON.stringify(currentTuningExport(definitions, overrides), null, 2),
                                    "JSON скопирован",
                                )
                            }
                        >
                            Copy JSON
                        </Button>
                        <Button
                            size="sm"
                            variant="outlined"
                            color="warning"
                            onClick={() =>
                                void copyText(formatTypeScript(definitions, overrides), "TypeScript скопирован")
                            }
                        >
                            Copy TypeScript
                        </Button>
                    </Box>

                    <Box
                        sx={{ mt: 1.5, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1 }}
                    >
                        <Typography level="body-xs" sx={{ color: hocColors.muted }}>
                            {status} · изменено {Object.keys(overrides).length}
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

export default AmbientFireTuningEditor;
