import { CREATURES_JSON, GridVals, TeamVals, getCreaturesByLevel } from "@heroesofcrypto/common";
import { Box, Button, Input, Sheet, Typography } from "@mui/joy";
import React, { useEffect, useState } from "react";

import { PREVIEW_PLACEMENT_GAME_ID, startPreviewPlaySession } from "../api/previewPlaySession";
import type { IWindowSize } from "../scenes/VisibleState";
import {
    normalizeBattlefieldShadowTuning,
    readBattlefieldShadowVisualBounds,
    readStoredBattlefieldShadowTuning,
    resetStoredBattlefieldShadowTuning,
    setBattlefieldShadowEditorActive,
    writeStoredBattlefieldShadowTuning,
    type BattlefieldShadowRowTuning,
    type BattlefieldShadowSegmentVisualBounds,
    type BattlefieldShadowTuning,
} from "./battlefieldShadowTuning";
import { hocColors, hocDisplayFontFamily } from "./hocTheme";
import { RankedGameView } from "./RankedGameView";
import { UNIT_ID_TO_NAME } from "./unit_ui_constants";

const creatureFactionByName = new Map<string, string>();
for (const [faction, roster] of Object.entries(CREATURES_JSON as Record<string, unknown>)) {
    if (!roster || typeof roster !== "object") continue;
    for (const name of Object.keys(roster)) creatureFactionByName.set(name, faction);
}

const SHADOW_EDITOR_CREATURES = [1, 2, 3, 4].flatMap((level) =>
    [...getCreaturesByLevel(level)]
        .map((id) => ({
            id,
            level,
            name: UNIT_ID_TO_NAME[id] ?? `Creature ${id}`,
            faction: creatureFactionByName.get(UNIT_ID_TO_NAME[id] ?? "") ?? "",
        }))
        .filter((creature) => creature.faction !== "Death"),
);
const SHADOW_EDITOR_SLOT_COUNT = 6;
const SHADOW_EDITOR_EMPTY_SLOT_ID = 0;
const SHADOW_EDITOR_SLOT_STORAGE_KEY = "hoc:shadow-editor:creature-slots-v2";
const shadowEditorCreatureIds = new Set(SHADOW_EDITOR_CREATURES.map((creature) => creature.id));

const defaultShadowEditorSlots = (): number[] =>
    Array.from(
        { length: SHADOW_EDITOR_SLOT_COUNT },
        (_, index) => SHADOW_EDITOR_CREATURES[index]?.id ?? SHADOW_EDITOR_EMPTY_SLOT_ID,
    );

const readShadowEditorSlots = (): number[] => {
    if (typeof window === "undefined" || typeof window.localStorage === "undefined") return defaultShadowEditorSlots();
    try {
        const parsed = JSON.parse(window.localStorage.getItem(SHADOW_EDITOR_SLOT_STORAGE_KEY) ?? "[]");
        if (!Array.isArray(parsed) || parsed.length !== SHADOW_EDITOR_SLOT_COUNT) return defaultShadowEditorSlots();
        const used = new Set<number>();
        return Array.from({ length: SHADOW_EDITOR_SLOT_COUNT }, (_, index) => {
            const id = Number(parsed[index]);
            if (!shadowEditorCreatureIds.has(id) || used.has(id)) return SHADOW_EDITOR_EMPTY_SLOT_ID;
            used.add(id);
            return id;
        });
    } catch {
        return defaultShadowEditorSlots();
    }
};

interface ScreenShadowBounds extends BattlefieldShadowSegmentVisualBounds {
    left: number;
    top: number;
    screenWidth: number;
    screenHeight: number;
    screenCellWidth: number;
    screenCellHeight: number;
    updatedAt: number;
}

const shadowVisualBoundsOnScreen = (name: string): ScreenShadowBounds | undefined => {
    const visual = readBattlefieldShadowVisualBounds(name);
    const canvas = document.querySelector("main canvas") as HTMLCanvasElement | null;
    if (!visual || !canvas) return undefined;
    const canvasRect = canvas.getBoundingClientRect();
    const resolution = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
    const logicalWidth = canvas.width / resolution;
    const logicalHeight = canvas.height / resolution;
    if (!logicalWidth || !logicalHeight || !canvasRect.width || !canvasRect.height) return undefined;
    const scaleX = canvasRect.width / logicalWidth;
    const scaleY = canvasRect.height / logicalHeight;
    return {
        ...visual.bounds,
        left: canvasRect.left + visual.bounds.x * scaleX,
        top: canvasRect.top + visual.bounds.y * scaleY,
        screenWidth: Math.max(12, visual.bounds.width * scaleX),
        screenHeight: Math.max(12, visual.bounds.height * scaleY),
        screenCellWidth: Math.max(1, visual.cellWidth * scaleX),
        screenCellHeight: Math.max(1, visual.cellHeight * scaleY),
        updatedAt: visual.updatedAt,
    };
};

interface TransformHandle {
    key: string;
    x: number;
    y: number;
    widthDirection: -1 | 0 | 1;
    lengthDirection: -1 | 0 | 1;
    proportional: boolean;
    cursor: string;
}

interface MapViewTransform {
    zoom: number;
    x: number;
    y: number;
}

const clampMapZoom = (value: number): number => Math.max(1, Math.min(10, Math.round(value * 100) / 100));
const clampMapPan = (value: number, zoom: number, viewportSize: number): number =>
    Math.min(0, Math.max(viewportSize * (1 - zoom), value));

const TRANSFORM_HANDLES: readonly TransformHandle[] = [
    { key: "nw", x: 0, y: 0, widthDirection: -1, lengthDirection: -1, proportional: true, cursor: "nwse-resize" },
    { key: "n", x: 0.5, y: 0, widthDirection: 0, lengthDirection: -1, proportional: false, cursor: "ns-resize" },
    { key: "ne", x: 1, y: 0, widthDirection: 1, lengthDirection: -1, proportional: true, cursor: "nesw-resize" },
    { key: "e", x: 1, y: 0.5, widthDirection: 1, lengthDirection: 0, proportional: false, cursor: "ew-resize" },
    { key: "se", x: 1, y: 1, widthDirection: 1, lengthDirection: 1, proportional: true, cursor: "nwse-resize" },
    { key: "s", x: 0.5, y: 1, widthDirection: 0, lengthDirection: 1, proportional: false, cursor: "ns-resize" },
    { key: "sw", x: 0, y: 1, widthDirection: -1, lengthDirection: 1, proportional: true, cursor: "nesw-resize" },
    { key: "w", x: 0, y: 0.5, widthDirection: -1, lengthDirection: 0, proportional: false, cursor: "ew-resize" },
];

const ShadowDirectManipulation: React.FC<{
    creatures: readonly { id: number; name: string }[];
    selectedCreatureId: number;
    tuning: BattlefieldShadowTuning;
    onSelect: (creatureId: number) => void;
    onTransform: (patch: Partial<BattlefieldShadowRowTuning>) => void;
}> = ({ creatures, selectedCreatureId, tuning, onSelect, onTransform }) => {
    const [visuals, setVisuals] = useState<Record<string, ScreenShadowBounds>>({});

    useEffect(() => {
        let frame = 0;
        let lastUpdate = 0;
        const tick = (now: number) => {
            if (now - lastUpdate >= 50) {
                lastUpdate = now;
                setVisuals(
                    Object.fromEntries(
                        creatures
                            .map((creature) => [creature.name, shadowVisualBoundsOnScreen(creature.name)] as const)
                            .filter((entry): entry is readonly [string, ScreenShadowBounds] => Boolean(entry[1])),
                    ),
                );
            }
            frame = window.requestAnimationFrame(tick);
        };
        frame = window.requestAnimationFrame(tick);
        return () => window.cancelAnimationFrame(frame);
    }, [creatures]);

    const startMove = (bounds: ScreenShadowBounds, event: React.PointerEvent) => {
        event.preventDefault();
        event.stopPropagation();
        const startX = event.clientX;
        const startY = event.clientY;
        const startOffsetX = tuning.top.offsetXCells;
        const startOffsetY = tuning.top.offsetYCells;
        const move = (pointerEvent: PointerEvent) => {
            onTransform({
                offsetXCells:
                    Math.round((startOffsetX + (pointerEvent.clientX - startX) / bounds.screenCellWidth) * 1000) / 1000,
                offsetYCells:
                    Math.round((startOffsetY - (pointerEvent.clientY - startY) / bounds.screenCellHeight) * 1000) /
                    1000,
            });
        };
        const stop = () => {
            window.removeEventListener("pointermove", move, true);
            window.removeEventListener("pointerup", stop, true);
        };
        window.addEventListener("pointermove", move, true);
        window.addEventListener("pointerup", stop, true);
    };

    const startResize = (handle: TransformHandle, bounds: ScreenShadowBounds, event: React.PointerEvent) => {
        event.preventDefault();
        event.stopPropagation();
        const startX = event.clientX;
        const startY = event.clientY;
        const startWidthScale = tuning.top.widthScale;
        const startLengthScale = tuning.top.lengthScale;
        const startOffsetX = tuning.top.offsetXCells;
        const startOffsetY = tuning.top.offsetYCells;
        const rounded = (value: number) => Math.round(value * 1000) / 1000;
        const move = (pointerEvent: PointerEvent) => {
            const deltaX = pointerEvent.clientX - startX;
            const deltaY = pointerEvent.clientY - startY;
            const widthFactor = Math.max(0.1, 1 + (handle.widthDirection * deltaX) / bounds.screenWidth);
            const lengthFactor = Math.max(0.1, 1 + (handle.lengthDirection * deltaY) / bounds.screenHeight);
            if (handle.proportional && !pointerEvent.shiftKey) {
                const factor = Math.abs(widthFactor - 1) >= Math.abs(lengthFactor - 1) ? widthFactor : lengthFactor;
                const widthGrowth = bounds.screenWidth * (factor - 1);
                const lengthGrowth = bounds.screenHeight * (factor - 1);
                onTransform({
                    widthScale: rounded(startWidthScale * factor),
                    lengthScale: rounded(startLengthScale * factor),
                    offsetXCells: rounded(
                        startOffsetX + (handle.widthDirection * widthGrowth) / (2 * bounds.screenCellWidth),
                    ),
                    offsetYCells: rounded(
                        startOffsetY + (handle.lengthDirection === -1 ? lengthGrowth / bounds.screenCellHeight : 0),
                    ),
                });
                return;
            }
            const widthGrowth = bounds.screenWidth * (widthFactor - 1);
            const lengthGrowth = bounds.screenHeight * (lengthFactor - 1);
            onTransform({
                ...(handle.widthDirection
                    ? {
                          widthScale: rounded(startWidthScale * widthFactor),
                          offsetXCells: rounded(
                              startOffsetX + (handle.widthDirection * widthGrowth) / (2 * bounds.screenCellWidth),
                          ),
                      }
                    : {}),
                ...(handle.lengthDirection
                    ? {
                          lengthScale: rounded(startLengthScale * lengthFactor),
                          offsetYCells: rounded(
                              startOffsetY +
                                  (handle.lengthDirection === -1 ? lengthGrowth / bounds.screenCellHeight : 0),
                          ),
                      }
                    : {}),
            });
        };
        const stop = () => {
            window.removeEventListener("pointermove", move, true);
            window.removeEventListener("pointerup", stop, true);
        };
        window.addEventListener("pointermove", move, true);
        window.addEventListener("pointerup", stop, true);
    };

    return (
        <>
            {creatures.flatMap((creature) => {
                const visual = visuals[creature.name];
                if (!visual || performance.now() - visual.updatedAt > 1000) return [];
                const selected = creature.id === selectedCreatureId;
                return [
                    <Box
                        key={`${creature.id}-shadow-frame`}
                        component="button"
                        type="button"
                        title={selected ? `Переместить тень ${creature.name}` : `Выбрать тень ${creature.name}`}
                        onPointerDown={(event) => {
                            if (selected) startMove(visual, event);
                        }}
                        onClick={() => onSelect(creature.id)}
                        sx={{
                            position: "fixed",
                            zIndex: 12500,
                            left: visual.left,
                            top: visual.top,
                            width: visual.screenWidth,
                            height: visual.screenHeight,
                            p: 0,
                            border: selected ? "1px solid rgba(255,255,255,.72)" : "1px solid transparent",
                            borderRadius: selected ? "16px" : "4px",
                            bgcolor: "transparent",
                            cursor: selected ? "move" : "pointer",
                            boxShadow: selected ? "0 0 0 1px rgba(0,0,0,.55)" : "none",
                            "&:hover": { borderColor: "rgba(255,255,255,.95)", bgcolor: "transparent" },
                        }}
                    />,
                    ...(selected
                        ? TRANSFORM_HANDLES.map((handle) => (
                              <Box
                                  key={`${creature.id}-${handle.key}`}
                                  component="button"
                                  type="button"
                                  title={
                                      handle.proportional
                                          ? `Пропорционально масштабировать тень ${creature.name}`
                                          : handle.widthDirection
                                            ? `Изменить ширину тени ${creature.name}`
                                            : `Изменить длину тени ${creature.name}`
                                  }
                                  onPointerDown={(event) => startResize(handle, visual, event)}
                                  sx={{
                                      position: "fixed",
                                      zIndex: 13000,
                                      left: visual.left + visual.screenWidth * handle.x - 8,
                                      top: visual.top + visual.screenHeight * handle.y - 8,
                                      width: 16,
                                      height: 16,
                                      p: 0,
                                      border: "2px solid rgba(0,0,0,.88)",
                                      borderRadius: "50%",
                                      bgcolor: "#f4efe3",
                                      boxShadow: "0 1px 5px rgba(0,0,0,.85)",
                                      cursor: handle.cursor,
                                  }}
                              />
                          ))
                        : []),
                ];
            })}
        </>
    );
};

const ValueControl: React.FC<{
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (value: number) => void;
}> = ({ label, value, min, max, step, onChange }) => (
    <Box sx={{ display: "grid", gridTemplateColumns: "92px 1fr 78px", alignItems: "center", gap: 1 }}>
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

const RowControls: React.FC<{
    title: string;
    tuning: BattlefieldShadowRowTuning;
    onChange: (patch: Partial<BattlefieldShadowRowTuning>) => void;
}> = ({ title, tuning, onChange }) => (
    <Box sx={{ mt: 1.25, p: 1.25, border: `1px solid ${hocColors.orangeBorder}`, borderRadius: "9px" }}>
        <Typography level="title-sm" sx={{ mb: 1, color: "#ffd15a" }}>
            {title}
        </Typography>
        <Box sx={{ display: "grid", gap: 1 }}>
            <ValueControl
                label="X (клетки)"
                value={tuning.offsetXCells}
                min={-2}
                max={2}
                step={0.01}
                onChange={(offsetXCells) => onChange({ offsetXCells })}
            />
            <ValueControl
                label="Y (клетки)"
                value={tuning.offsetYCells}
                min={-2}
                max={2}
                step={0.01}
                onChange={(offsetYCells) => onChange({ offsetYCells })}
            />
            <ValueControl
                label="Длина"
                value={tuning.lengthScale}
                min={0.05}
                max={1.5}
                step={0.01}
                onChange={(lengthScale) => onChange({ lengthScale })}
            />
            <ValueControl
                label="Ширина"
                value={tuning.widthScale}
                min={0.1}
                max={2}
                step={0.01}
                onChange={(widthScale) => onChange({ widthScale })}
            />
            <ValueControl
                label="Прозрачность"
                value={tuning.alpha}
                min={0}
                max={1}
                step={0.01}
                onChange={(alpha) => onChange({ alpha })}
            />
            <ValueControl
                label="Угол °"
                value={tuning.rotationDegrees}
                min={-60}
                max={60}
                step={1}
                onChange={(rotationDegrees) => onChange({ rotationDegrees })}
            />
        </Box>
    </Box>
);

export const BattlefieldShadowEditor: React.FC<{ windowSize: IWindowSize }> = ({ windowSize }) => {
    const [selectedCreatureId, setSelectedCreatureId] = useState(SHADOW_EDITOR_CREATURES[0]?.id ?? 0);
    const selectedCreature =
        SHADOW_EDITOR_CREATURES.find((creature) => creature.id === selectedCreatureId) ?? SHADOW_EDITOR_CREATURES[0];
    const [slotCreatureIds, setSlotCreatureIds] = useState<number[]>(readShadowEditorSlots);
    const previewCreatures = slotCreatureIds
        .map((id) => SHADOW_EDITOR_CREATURES.find((creature) => creature.id === id))
        .filter((creature): creature is (typeof SHADOW_EDITOR_CREATURES)[number] => Boolean(creature));
    const [tuning, setTuning] = useState<BattlefieldShadowTuning>(() =>
        readStoredBattlefieldShadowTuning(SHADOW_EDITOR_CREATURES[0]?.name),
    );
    const [status, setStatus] = useState("Настройки сохраняются автоматически");
    const [dock, setDock] = useState<"left" | "right">("right");
    const [collapsed, setCollapsed] = useState(false);
    const [mapView, setMapView] = useState<MapViewTransform>({ zoom: 1, x: 0, y: 0 });

    useEffect(() => {
        setBattlefieldShadowEditorActive(true);
        return () => setBattlefieldShadowEditorActive(false);
    }, []);

    useEffect(() => {
        if (!selectedCreature) return;
        setTuning(readStoredBattlefieldShadowTuning(selectedCreature.name));
    }, [selectedCreature]);

    useEffect(() => {
        startPreviewPlaySession({
            userTeam: TeamVals.LEFT,
            gridType: GridVals.NORMAL,
            leftArmy: slotCreatureIds,
            rightArmy: [],
            spreadLeftArmyAcrossBoard: true,
            comparisonRowSizes: [SHADOW_EDITOR_SLOT_COUNT],
            comparisonRowGroundYs: [15],
            comparisonHorizontalGapCells: 1,
            comparisonFixedSlotCount: SHADOW_EDITOR_SLOT_COUNT,
        });
        window.localStorage.setItem(SHADOW_EDITOR_SLOT_STORAGE_KEY, JSON.stringify(slotCreatureIds));
    }, [slotCreatureIds]);

    if (import.meta.env.PROD || import.meta.env.VITE_IS_PROD === "true") {
        return (
            <Typography sx={{ p: 4 }}>Battlefield shadow editor is available only in development builds.</Typography>
        );
    }

    const persist = (nextValue: BattlefieldShadowTuning, message = "Сохранено локально") => {
        const next = normalizeBattlefieldShadowTuning(nextValue);
        setTuning(next);
        if (selectedCreature) writeStoredBattlefieldShadowTuning(selectedCreature.name, next);
        setStatus(message);
    };
    const updateTopRow = (patch: Partial<BattlefieldShadowRowTuning>) => {
        persist({ ...tuning, top: { ...tuning.top, ...patch } });
    };
    const zoomMapAt = (requestedZoom: number, screenX: number, screenY: number) => {
        setMapView((current) => {
            const zoom = clampMapZoom(requestedZoom);
            if (zoom === 1) return { zoom, x: 0, y: 0 };
            const ratio = zoom / current.zoom;
            return {
                zoom,
                x: clampMapPan(screenX - (screenX - current.x) * ratio, zoom, window.innerWidth),
                y: clampMapPan(screenY - (screenY - current.y) * ratio, zoom, window.innerHeight),
            };
        });
    };
    const startMapPan = (event: React.PointerEvent) => {
        if (event.button !== 0) return;
        event.preventDefault();
        const startX = event.clientX;
        const startY = event.clientY;
        const startPanX = mapView.x;
        const startPanY = mapView.y;
        const zoom = mapView.zoom;
        const move = (pointerEvent: PointerEvent) => {
            setMapView((current) => ({
                ...current,
                x: clampMapPan(startPanX + pointerEvent.clientX - startX, zoom, window.innerWidth),
                y: clampMapPan(startPanY + pointerEvent.clientY - startY, zoom, window.innerHeight),
            }));
        };
        const stop = () => {
            window.removeEventListener("pointermove", move, true);
            window.removeEventListener("pointerup", stop, true);
        };
        window.addEventListener("pointermove", move, true);
        window.addEventListener("pointerup", stop, true);
    };
    const copyJson = async () => {
        try {
            await navigator.clipboard.writeText(
                JSON.stringify({ [selectedCreature?.name ?? "creature"]: tuning }, null, 2),
            );
            setStatus("JSON скопирован");
        } catch {
            setStatus("Не удалось скопировать — разрешите доступ к буферу обмена");
        }
    };

    return (
        <Box sx={{ position: "fixed", inset: 0, overflow: "hidden", bgcolor: "#000" }}>
            <Box
                sx={{
                    position: "absolute",
                    inset: 0,
                    transformOrigin: "0 0",
                    transform: `translate3d(${mapView.x}px, ${mapView.y}px, 0) scale(${mapView.zoom})`,
                    willChange: "transform",
                    pointerEvents: "none",
                }}
            >
                <RankedGameView gameId={PREVIEW_PLACEMENT_GAME_ID} userTeam={TeamVals.LEFT} windowSize={windowSize} />
            </Box>
            <Box
                title="Перетащить карту; колесо — изменить масштаб"
                onPointerDown={startMapPan}
                onWheel={(event) => {
                    event.preventDefault();
                    zoomMapAt(mapView.zoom * Math.exp(-event.deltaY * 0.002), event.clientX, event.clientY);
                }}
                sx={{
                    position: "fixed",
                    zIndex: 11000,
                    inset: 0,
                    cursor: mapView.zoom > 1 ? "grab" : "zoom-in",
                    touchAction: "none",
                }}
            />
            <ShadowDirectManipulation
                creatures={previewCreatures}
                selectedCreatureId={selectedCreatureId}
                tuning={tuning}
                onSelect={setSelectedCreatureId}
                onTransform={updateTopRow}
            />

            {collapsed ? (
                <Button
                    variant="solid"
                    color="warning"
                    onClick={() => setCollapsed(false)}
                    sx={{ position: "fixed", zIndex: 14000, top: 14, [dock]: 14 }}
                >
                    SHADOW EDITOR
                </Button>
            ) : (
                <Sheet
                    sx={{
                        position: "fixed",
                        zIndex: 14000,
                        top: 14,
                        [dock]: 14,
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
                            SHADOW EDITOR
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
                        Шесть слотов верхней линии настраиваются независимо; в любом можно выбрать «Никого». Для нижних
                        рядов размер и заметность уменьшаются автоматически. Клик выбирает тень, перетаскивание рамки
                        двигает её целиком. Углы масштабируют пропорционально, боковые точки — только по ширине или
                        длине. Верхние точки тянут верхний край, нижние — нижний; Shift на углу включает свободное
                        масштабирование.
                    </Typography>

                    <Box
                        component="select"
                        value={selectedCreatureId}
                        onChange={(event) => setSelectedCreatureId(Number((event.target as HTMLSelectElement).value))}
                        sx={{
                            mt: 1.25,
                            width: "100%",
                            p: 1,
                            color: hocColors.parchment,
                            bgcolor: "#17100a",
                            border: `1px solid ${hocColors.orangeBorder}`,
                            borderRadius: "8px",
                        }}
                    >
                        {SHADOW_EDITOR_CREATURES.map((creature) => (
                            <option key={creature.id} value={creature.id}>
                                L{creature.level} · {creature.faction} · {creature.name}
                            </option>
                        ))}
                    </Box>

                    <Typography level="title-sm" sx={{ mt: 1.25, color: "#ffd15a" }}>
                        Отображаемые существа
                    </Typography>
                    <Box sx={{ mt: 0.75, display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 0.65 }}>
                        {slotCreatureIds.map((creatureId, slotIndex) => (
                            <Box key={slotIndex} sx={{ minWidth: 0 }}>
                                <Typography level="body-xs" sx={{ mb: 0.25, color: hocColors.mutedStrong }}>
                                    Слот {slotIndex + 1}
                                </Typography>
                                <Box
                                    component="select"
                                    aria-label={`Слот ${slotIndex + 1}`}
                                    value={creatureId}
                                    onChange={(event) => {
                                        const nextCreatureId = Number((event.target as HTMLSelectElement).value);
                                        setSlotCreatureIds((current) => {
                                            const next = [...current];
                                            next[slotIndex] = nextCreatureId;
                                            return next;
                                        });
                                        if (nextCreatureId !== SHADOW_EDITOR_EMPTY_SLOT_ID) {
                                            setSelectedCreatureId(nextCreatureId);
                                        }
                                    }}
                                    sx={{
                                        width: "100%",
                                        minWidth: 0,
                                        p: 0.75,
                                        color: creatureId ? hocColors.parchment : hocColors.mutedStrong,
                                        bgcolor: "#17100a",
                                        border: `1px solid ${
                                            creatureId === selectedCreatureId
                                                ? "rgba(242,173,63,.9)"
                                                : hocColors.orangeBorder
                                        }`,
                                        borderRadius: "7px",
                                    }}
                                >
                                    <option value={SHADOW_EDITOR_EMPTY_SLOT_ID}>Никого</option>
                                    {SHADOW_EDITOR_CREATURES.map((creature) => (
                                        <option
                                            key={creature.id}
                                            value={creature.id}
                                            disabled={
                                                creature.id !== creatureId && slotCreatureIds.includes(creature.id)
                                            }
                                        >
                                            L{creature.level} · {creature.name}
                                        </option>
                                    ))}
                                </Box>
                            </Box>
                        ))}
                    </Box>

                    <Box sx={{ mt: 1.25, p: 1.25, border: `1px solid ${hocColors.orangeBorder}`, borderRadius: "9px" }}>
                        <ValueControl
                            label="Зум карты ×"
                            value={mapView.zoom}
                            min={1}
                            max={10}
                            step={0.01}
                            onChange={(zoom) => zoomMapAt(zoom, window.innerWidth / 2, window.innerHeight / 2)}
                        />
                        <Box sx={{ mt: 0.75, display: "flex", alignItems: "center", gap: 1 }}>
                            <Button
                                size="sm"
                                variant="outlined"
                                color="neutral"
                                disabled={mapView.zoom === 1 && mapView.x === 0 && mapView.y === 0}
                                onClick={() => setMapView({ zoom: 1, x: 0, y: 0 })}
                            >
                                Сбросить вид
                            </Button>
                            <Typography level="body-xs" sx={{ color: hocColors.muted }}>
                                Колесо — зум под курсором; потяните свободное место для перемещения.
                            </Typography>
                        </Box>
                    </Box>

                    <RowControls
                        title={`${selectedCreature?.name ?? "Существо"} — верхняя базовая точка`}
                        tuning={tuning.top}
                        onChange={updateTopRow}
                    />

                    <Box sx={{ mt: 1.25 }}>
                        <ValueControl
                            label="Контактная"
                            value={tuning.contactAlpha}
                            min={0}
                            max={1}
                            step={0.01}
                            onChange={(contactAlpha) => persist({ ...tuning, contactAlpha })}
                        />
                        <Typography level="body-xs" sx={{ mt: 0.5, color: hocColors.muted }}>
                            Контактная — исходное маленькое пятно непосредственно под ногами.
                        </Typography>
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
                                if (!selectedCreature) return;
                                resetStoredBattlefieldShadowTuning(selectedCreature.name);
                                setTuning(readStoredBattlefieldShadowTuning(selectedCreature.name));
                                setStatus(`${selectedCreature.name}: настройки сброшены`);
                            }}
                        >
                            Reset
                        </Button>
                    </Box>
                    <Typography level="body-xs" sx={{ mt: 1, color: hocColors.mutedStrong }}>
                        {status}
                    </Typography>
                </Sheet>
            )}
        </Box>
    );
};
