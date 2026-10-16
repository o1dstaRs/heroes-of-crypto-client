import { GridVals, TeamVals } from "@heroesofcrypto/common";
import { Box, Button, Checkbox, Input, Sheet, Typography } from "@mui/joy";
import React, { useEffect, useMemo, useState } from "react";

import { PREVIEW_PLACEMENT_GAME_ID, startPreviewPlaySession } from "../api/previewPlaySession";
import {
    readStoredMovementAreaTuning,
    resetStoredMovementAreaTuning,
    setMovementAreaEditorActive,
    writeStoredMovementAreaTuning,
    type MovementAreaTuning,
} from "../scenes/movementAreaTuning";
import type { IWindowSize } from "../scenes/VisibleState";
import { hocColors, hocDisplayFontFamily } from "./hocTheme";
import { RankedGameView } from "./RankedGameView";

const roundValue = (value: number): number => Math.round(value * 1000) / 1000;

const ValueControl: React.FC<{
    label: string;
    value: number;
    min?: number;
    max?: number;
    onChange: (value: number) => void;
}> = ({ label, value, min = -0.5, max = 1.5, onChange }) => (
    <Box sx={{ display: "grid", gridTemplateColumns: "118px 1fr 92px", alignItems: "center", gap: 1 }}>
        <Typography level="body-sm" sx={{ color: hocColors.mutedStrong }}>
            {label}
        </Typography>
        <Box
            component="input"
            type="range"
            min={min}
            max={max}
            step={0.005}
            value={value}
            onInput={(event) => onChange(Number((event.target as HTMLInputElement).value))}
            sx={{ width: "100%", accentColor: "#31dff5", cursor: "pointer" }}
        />
        <Input
            type="number"
            value={value}
            slotProps={{ input: { min, max, step: 0.005 } }}
            onChange={(event) => onChange(Number(event.target.value))}
            endDecorator="кл."
            sx={{
                minWidth: 0,
                bgcolor: "rgba(0,0,0,.34)",
                borderColor: hocColors.orangeBorder,
                "& input": { px: 0.5, textAlign: "right" },
            }}
        />
    </Box>
);

export const MovementAreaEditor: React.FC<{ windowSize: IWindowSize }> = ({ windowSize }) => {
    const [tuning, setTuning] = useState<MovementAreaTuning>(() => readStoredMovementAreaTuning());
    const [status, setStatus] = useState("Настройки сохраняются автоматически");
    const [dock, setDock] = useState<"left" | "right">("right");
    const [collapsed, setCollapsed] = useState(false);

    useMemo(
        () =>
            startPreviewPlaySession({
                userTeam: TeamVals.LEFT,
                gridType: GridVals.NORMAL,
                lowerArmy: [],
                upperArmy: [],
            }),
        [],
    );

    useEffect(() => {
        setMovementAreaEditorActive(true);
        return () => setMovementAreaEditorActive(false);
    }, []);

    if (import.meta.env.PROD || import.meta.env.VITE_IS_PROD === "true") {
        return <Typography sx={{ p: 4 }}>Movement-area editor is available only in development builds.</Typography>;
    }

    const persist = (patch: Partial<MovementAreaTuning>, message = "Сохранено локально") => {
        const next = writeStoredMovementAreaTuning({ ...tuning, ...patch });
        setTuning(next);
        setStatus(message);
    };
    const reset = () => {
        const next = resetStoredMovementAreaTuning();
        setTuning(next);
        setStatus("Высота двух рядов сброшена");
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
        <Box sx={{ position: "fixed", inset: 0, overflow: "hidden", bgcolor: "#000" }}>
            <RankedGameView gameId={PREVIEW_PLACEMENT_GAME_ID} userTeam={TeamVals.LEFT} windowSize={windowSize} />

            {collapsed ? (
                <Button
                    variant="solid"
                    color="warning"
                    onClick={() => setCollapsed(false)}
                    sx={{ position: "fixed", zIndex: 14000, top: 14, [dock]: 14 }}
                >
                    MOVE AREA
                </Button>
            ) : (
                <Sheet
                    sx={{
                        position: "fixed",
                        zIndex: 14000,
                        top: 14,
                        [dock]: 14,
                        width: 430,
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
                            MOVE AREA HEIGHT
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

                    <Typography level="body-xs" sx={{ mt: 0.6, color: hocColors.muted }}>
                        Меняются только выбранные горизонтальные грани. Ширина клеток и остальные 14 рядов остаются
                        неподвижными. Положительное значение поднимает грань вверх.
                    </Typography>

                    <Box sx={{ mt: 1.5, display: "grid", gap: 1.25 }}>
                        <ValueControl
                            label="1 ряд · верх"
                            value={tuning.firstRowTopLiftCells}
                            onChange={(firstRowTopLiftCells) =>
                                persist({ firstRowTopLiftCells: roundValue(firstRowTopLiftCells) })
                            }
                        />
                        <ValueControl
                            label="1 ряд · низ"
                            value={tuning.firstRowBottomLiftCells}
                            min={-0.5}
                            max={0.5}
                            onChange={(firstRowBottomLiftCells) =>
                                persist({ firstRowBottomLiftCells: roundValue(firstRowBottomLiftCells) })
                            }
                        />
                        <ValueControl
                            label="2 ряд · верх"
                            value={tuning.secondRowTopLiftCells}
                            onChange={(secondRowTopLiftCells) =>
                                persist({ secondRowTopLiftCells: roundValue(secondRowTopLiftCells) })
                            }
                        />
                    </Box>

                    <Checkbox
                        checked={tuning.guidesVisible}
                        onChange={(event) => persist({ guidesVisible: event.target.checked })}
                        label="Показывать точную область клеток"
                        sx={{ mt: 1.5, color: hocColors.mutedStrong }}
                    />
                    <Typography level="body-xs" sx={{ mt: 0.5, color: hocColors.muted }}>
                        Бирюзовый контур — первый ряд, оранжевый — второй. Полупрозрачное поле внутри контура —
                        фактический полигон заливки.
                    </Typography>

                    <Box sx={{ mt: 1.5, display: "flex", gap: 0.75, flexWrap: "wrap" }}>
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
                    <Typography level="body-xs" sx={{ mt: 1.2, color: hocColors.muted }}>
                        {status}
                    </Typography>
                </Sheet>
            )}
        </Box>
    );
};

export default MovementAreaEditor;
