import { CREATURES_JSON, GridVals, TeamVals, getCreaturesByLevel } from "@heroesofcrypto/common";
import { Box, Button, Input, Sheet, Typography } from "@mui/joy";
import { Assets } from "pixi.js";
import React, { useEffect, useRef, useState } from "react";

import { PREVIEW_PLACEMENT_GAME_ID, startPreviewPlaySession } from "../api/previewPlaySession";
import { images } from "../generated/image_imports";
import { battleSidebarWidth } from "../pixi/boardFit";
import type { IWindowSize } from "../scenes/VisibleState";
import {
    BATTLEFIELD_CREATURE_FRAMING,
    BATTLEFIELD_CREATURE_FRAMING_STORAGE_KEY,
    DEFAULT_BATTLEFIELD_CREATURE_FRAMING,
    normalizeBattlefieldCreatureFraming,
    readBattlefieldCreatureVisualBounds,
    readStoredBattlefieldCreatureFraming,
    setBattlefieldCreatureEditorActive,
    writeStoredBattlefieldCreatureFraming,
    type BattlefieldCreatureFraming,
    type BattlefieldCreatureVisualBounds,
} from "./battlefieldCreatureFraming";
import { hocColors, hocDisplayFontFamily } from "./hocTheme";
import { RankedGameView } from "./RankedGameView";
import { UNIT_ID_TO_NAME } from "./unit_ui_constants";

const FACTION_ORDER = ["Life", "Nature", "Chaos", "Might"];
const EDITOR_PANEL_SIDE_STORAGE_KEY = "hoc:battlefield-creature-editor:panel-side";

type EditorPanelSide = "left" | "right";

interface EditorCreature {
    id: number;
    level: number;
    name: string;
    faction: string;
    footprintWidth: number;
    footprintHeight: number;
}

const creatureCatalogByName = (() => {
    const result = new Map<string, { faction: string; footprintWidth: number; footprintHeight: number }>();
    for (const [faction, roster] of Object.entries(CREATURES_JSON as Record<string, unknown>)) {
        if (!roster || typeof roster !== "object") continue;
        for (const [creatureName, rawConfig] of Object.entries(roster)) {
            const config = rawConfig as { size?: number; footprint_width?: number; footprint_height?: number };
            const size = config.size ?? 1;
            result.set(creatureName, {
                faction,
                footprintWidth: config.footprint_width ?? size,
                footprintHeight: config.footprint_height ?? size,
            });
        }
    }
    return result;
})();

const EDITOR_CREATURES: EditorCreature[] = [1, 2, 3, 4].flatMap((level) =>
    [...getCreaturesByLevel(level)]
        .map((id) => {
            const name = UNIT_ID_TO_NAME[id] ?? `Creature ${id}`;
            const catalog = creatureCatalogByName.get(name);
            return {
                id,
                level,
                name,
                faction: catalog?.faction ?? "",
                footprintWidth: catalog?.footprintWidth ?? 1,
                footprintHeight: catalog?.footprintHeight ?? 1,
            };
        })
        .filter((creature) => creature.faction !== "Death")
        .sort((left, right) => FACTION_ORDER.indexOf(left.faction) - FACTION_ORDER.indexOf(right.faction)),
);

const generatedImages = images as Readonly<Record<string, string | undefined>>;

const idleAtlasSlug = (unitName: string): string => {
    if (unitName === "Scavenger") return "thief";
    if (unitName === "Wandering Mage") return "ash_moth";
    return unitName.toLowerCase().replaceAll(" ", "_");
};

const idleAtlasUrlsForCreatures = (creatures: readonly EditorCreature[]): string[] =>
    creatures
        .map((creature) => generatedImages[`${idleAtlasSlug(creature.name)}_idle_atlas_quarter`])
        .filter((url): url is string => Boolean(url));

const roundDraftValue = (value: number): number => Math.round(value * 1000) / 1000;

const ValueSlider: React.FC<{
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (value: number) => void;
}> = ({ label, value, min, max, step, onChange }) => (
    <Box sx={{ display: "grid", gridTemplateColumns: "78px 1fr 74px", gap: 1, alignItems: "center" }}>
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
            sx={{ minWidth: 0, "& input": { px: 0.5, textAlign: "center" }, bgcolor: "rgba(0,0,0,.34)" }}
        />
    </Box>
);

interface ScreenVisualBounds extends BattlefieldCreatureVisualBounds {
    left: number;
    top: number;
    screenWidth: number;
    screenHeight: number;
    screenCellWidth: number;
    screenCellHeight: number;
}

const visualBoundsOnScreen = (name: string): ScreenVisualBounds | undefined => {
    const visual = readBattlefieldCreatureVisualBounds(name);
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
        ...visual,
        left: canvasRect.left + visual.x * scaleX,
        top: canvasRect.top + visual.y * scaleY,
        screenWidth: visual.width * scaleX,
        screenHeight: visual.height * scaleY,
        screenCellWidth: Math.max(1, visual.cellWidth * scaleX),
        screenCellHeight: Math.max(1, visual.cellHeight * scaleY),
    };
};

type DragMode = "move" | "width" | "height" | "both";

const CreatureSelectionOverlays: React.FC<{
    creatures: readonly EditorCreature[];
    selectedCreatureName: string;
    onSelect: (creatureId: number) => void;
}> = ({ creatures, selectedCreatureName, onSelect }) => {
    const [visuals, setVisuals] = useState<Record<string, ScreenVisualBounds>>({});

    useEffect(() => {
        let frame = 0;
        let lastUpdate = 0;
        const tick = (now: number) => {
            if (now - lastUpdate >= 80) {
                lastUpdate = now;
                setVisuals(
                    Object.fromEntries(
                        creatures
                            .map((creature) => [creature.name, visualBoundsOnScreen(creature.name)] as const)
                            .filter((entry): entry is readonly [string, ScreenVisualBounds] => Boolean(entry[1])),
                    ),
                );
            }
            frame = window.requestAnimationFrame(tick);
        };
        frame = window.requestAnimationFrame(tick);
        return () => window.cancelAnimationFrame(frame);
    }, [creatures]);

    return (
        <>
            {creatures.map((creature) => {
                const visual = visuals[creature.name];
                if (!visual || performance.now() - visual.updatedAt > 1000) return null;
                const selected = creature.name === selectedCreatureName;
                return (
                    <Box
                        key={creature.id}
                        component="button"
                        type="button"
                        title={`Редактировать ${creature.name}`}
                        onPointerDown={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                        }}
                        onClick={() => onSelect(creature.id)}
                        sx={{
                            position: "fixed",
                            zIndex: 11000,
                            left: visual.left,
                            top: visual.top,
                            width: visual.screenWidth,
                            height: visual.screenHeight,
                            p: 0,
                            border: selected ? "1px solid rgba(255,209,90,.3)" : "1px solid transparent",
                            bgcolor: "transparent",
                            cursor: "pointer",
                            "&:hover": {
                                borderColor: "#ffd15a",
                                bgcolor: "rgba(255,174,37,.08)",
                            },
                            "&::after": {
                                content: JSON.stringify(creature.name),
                                position: "absolute",
                                left: "50%",
                                bottom: -18,
                                transform: "translateX(-50%)",
                                px: 0.5,
                                color: selected ? "#ffd15a" : "rgba(255,255,255,.66)",
                                bgcolor: "rgba(7,5,3,.78)",
                                fontSize: 9,
                                whiteSpace: "nowrap",
                                opacity: selected ? 1 : 0,
                            },
                            "&:hover::after": { opacity: 1 },
                        }}
                    />
                );
            })}
        </>
    );
};

const CreatureTransformHandles: React.FC<{
    creatureName: string;
    framing: BattlefieldCreatureFraming;
    onChange: (patch: Partial<BattlefieldCreatureFraming>) => void;
}> = ({ creatureName, framing, onChange }) => {
    const [visual, setVisual] = useState<ScreenVisualBounds>();
    const framingRef = useRef(framing);
    framingRef.current = framing;

    useEffect(() => {
        let frame = 0;
        let lastUpdate = 0;
        const tick = (now: number) => {
            if (now - lastUpdate >= 50) {
                lastUpdate = now;
                setVisual(visualBoundsOnScreen(creatureName));
            }
            frame = window.requestAnimationFrame(tick);
        };
        frame = window.requestAnimationFrame(tick);
        return () => window.cancelAnimationFrame(frame);
    }, [creatureName]);

    if (!visual || performance.now() - visual.updatedAt > 1000) return null;

    const startDrag = (mode: DragMode, event: React.PointerEvent) => {
        event.preventDefault();
        event.stopPropagation();
        const startX = event.clientX;
        const startY = event.clientY;
        const start = framingRef.current;
        const startWidth = Math.max(1, visual.screenWidth);
        const startHeight = Math.max(1, visual.screenHeight);

        const move = (pointerEvent: PointerEvent) => {
            const dx = pointerEvent.clientX - startX;
            const dy = pointerEvent.clientY - startY;
            if (mode === "move") {
                onChange({
                    offsetXCells: roundDraftValue(start.offsetXCells + dx / visual.screenCellWidth),
                    offsetYCells: roundDraftValue(start.offsetYCells + dy / visual.screenCellHeight),
                });
                return;
            }
            const patch: Partial<BattlefieldCreatureFraming> = {};
            if (mode === "width" || mode === "both") {
                patch.scaleX = roundDraftValue(start.scaleX * Math.max(0.1, 1 + dx / startWidth));
            }
            if (mode === "height" || mode === "both") {
                patch.scaleY = roundDraftValue(start.scaleY * Math.max(0.1, 1 - dy / startHeight));
            }
            onChange(patch);
        };
        const stop = () => {
            window.removeEventListener("pointermove", move, true);
            window.removeEventListener("pointerup", stop, true);
        };
        window.addEventListener("pointermove", move, true);
        window.addEventListener("pointerup", stop, true);
    };

    const handleStyle = {
        position: "absolute" as const,
        width: 16,
        height: 16,
        bgcolor: "#ffd15a",
        border: "2px solid #1b1106",
        borderRadius: "3px",
        boxShadow: "0 0 8px rgba(255,174,37,.8)",
        pointerEvents: "auto" as const,
    };

    return (
        <Box
            sx={{
                position: "fixed",
                zIndex: 12000,
                left: visual.left,
                top: visual.top,
                width: visual.screenWidth,
                height: visual.screenHeight,
                border: "1px dashed rgba(255,209,90,.44)",
                boxShadow: "0 0 0 1px rgba(0,0,0,.38), inset 0 0 12px rgba(255,174,37,.035)",
                pointerEvents: "none",
            }}
        >
            <Box
                onPointerDown={(event) => startDrag("move", event)}
                title="Перетащить существо"
                sx={{ position: "absolute", inset: 0, pointerEvents: "auto", cursor: "move" }}
            />
            <Box
                onPointerDown={(event) => startDrag("width", event)}
                title="Растянуть по ширине"
                sx={{ ...handleStyle, right: -9, top: "50%", mt: "-8px", cursor: "ew-resize" }}
            />
            <Box
                onPointerDown={(event) => startDrag("height", event)}
                title="Растянуть по высоте"
                sx={{ ...handleStyle, left: "50%", top: -9, ml: "-8px", cursor: "ns-resize" }}
            />
            <Box
                onPointerDown={(event) => startDrag("both", event)}
                title="Растянуть по ширине и высоте"
                sx={{ ...handleStyle, right: -9, top: -9, cursor: "nesw-resize" }}
            />
            <Box
                sx={{
                    position: "absolute",
                    left: 0,
                    bottom: -24,
                    px: 0.75,
                    py: 0.2,
                    bgcolor: "rgba(10,7,4,.9)",
                    color: "#ffd15a",
                    fontSize: 11,
                    whiteSpace: "nowrap",
                }}
            >
                drag · W справа · H сверху
            </Box>
        </Box>
    );
};

const formatTypeScriptConfig = (overrides: Record<string, BattlefieldCreatureFraming>): string => {
    const rows = Object.entries(overrides)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, framing]) => `    ${JSON.stringify(name)}: ${JSON.stringify(framing)},`);
    return `export const BATTLEFIELD_CREATURE_FRAMING = {\n${rows.join("\n")}\n} as const;`;
};

export const BattlefieldCreatureFramingEditor: React.FC<{ windowSize: IWindowSize }> = ({ windowSize }) => {
    const searchParams = new URLSearchParams(window.location.search);
    const twoByOneMode = searchParams.get("footprint") === "2x1";
    const requestedLevelParam = searchParams.get("level");
    const allLevelsMode = !twoByOneMode && (requestedLevelParam === null || requestedLevelParam === "all");
    const requestedLevel = Number(requestedLevelParam);
    const editorLevel = [1, 2, 3, 4].includes(requestedLevel) ? requestedLevel : 1;
    const filteredCreatures = twoByOneMode
        ? EDITOR_CREATURES.filter((creature) => creature.footprintWidth === 2 && creature.footprintHeight === 1)
        : allLevelsMode
          ? EDITOR_CREATURES
          : EDITOR_CREATURES.filter((creature) => creature.level === editorLevel);
    const editorModeKey = twoByOneMode ? "footprint-2x1" : allLevelsMode ? "all-levels" : `level-${editorLevel}`;
    const idleAtlasUrls = idleAtlasUrlsForCreatures(filteredCreatures);
    const initialId = Number(searchParams.get("creature"));
    const [selectedCreatureId, setSelectedCreatureId] = useState(
        filteredCreatures.some((creature) => creature.id === initialId) ? initialId : (filteredCreatures[0]?.id ?? 0),
    );
    const [overrides, setOverrides] = useState<Record<string, BattlefieldCreatureFraming>>(() =>
        readStoredBattlefieldCreatureFraming(),
    );
    const [hiddenCreatureIds, setHiddenCreatureIds] = useState<Set<number>>(() => new Set());
    const [status, setStatus] = useState("Настройки сохраняются автоматически");
    const [atlasesReady, setAtlasesReady] = useState(false);
    const [panelExpanded, setPanelExpanded] = useState(false);
    const [panelSide, setPanelSide] = useState<EditorPanelSide>(() => {
        try {
            return window.localStorage.getItem(EDITOR_PANEL_SIDE_STORAGE_KEY) === "right" ? "right" : "left";
        } catch {
            return "left";
        }
    });
    const editorRailWidth = Math.max(44, battleSidebarWidth(windowSize.width, windowSize.height));
    const visibleCreatures = filteredCreatures.filter((creature) => !hiddenCreatureIds.has(creature.id));
    const visibleCreatureIds = visibleCreatures.map((creature) => creature.id);
    const visibleCreatureIdsKey = visibleCreatureIds.join(",");
    const comparisonRowSizesKey = allLevelsMode
        ? [1, 2, 3, 4].map((level) => visibleCreatures.filter((creature) => creature.level === level).length).join(",")
        : "";
    const selectedCreature = filteredCreatures.find((creature) => creature.id === selectedCreatureId);
    const framing = selectedCreature
        ? (overrides[selectedCreature.name] ??
          BATTLEFIELD_CREATURE_FRAMING[selectedCreature.name] ??
          DEFAULT_BATTLEFIELD_CREATURE_FRAMING)
        : DEFAULT_BATTLEFIELD_CREATURE_FRAMING;

    // React Fast Refresh preserves component state. When the approved framing baseline changes,
    // reload drafts from its new storage namespace so an in-memory copy of the previous baseline
    // cannot immediately repopulate the fresh namespace on the next slider movement.
    useEffect(() => {
        setOverrides(readStoredBattlefieldCreatureFraming());
    }, [BATTLEFIELD_CREATURE_FRAMING_STORAGE_KEY]);

    useEffect(() => {
        startPreviewPlaySession({
            userTeam: TeamVals.LOWER,
            gridType: GridVals.NORMAL,
            lowerArmy: visibleCreatureIds,
            upperArmy: [],
            spreadLowerArmyAcrossBoard: true,
            comparisonRowSizes: comparisonRowSizesKey
                ? comparisonRowSizesKey.split(",").map((size) => Number(size))
                : undefined,
        });
    }, [comparisonRowSizesKey, editorModeKey, visibleCreatureIdsKey]);

    useEffect(() => {
        setBattlefieldCreatureEditorActive(true);
        return () => setBattlefieldCreatureEditorActive(false);
    }, []);

    useEffect(() => {
        let cancelled = false;
        void Promise.all(idleAtlasUrls.map((url) => Assets.load(url).catch(() => undefined))).then(() => {
            if (!cancelled) setAtlasesReady(true);
        });
        return () => {
            cancelled = true;
        };
    }, [editorModeKey]);

    if (import.meta.env.PROD || import.meta.env.VITE_IS_PROD === "true") {
        return (
            <Typography sx={{ p: 4 }}>Battlefield creature editor is available only in development builds.</Typography>
        );
    }
    if (!selectedCreature) return null;

    const persist = (next: Record<string, BattlefieldCreatureFraming>, message = "Сохранено локально") => {
        setOverrides(next);
        writeStoredBattlefieldCreatureFraming(next);
        setStatus(message);
    };
    const updateFraming = (patch: Partial<BattlefieldCreatureFraming>) => {
        persist({
            ...overrides,
            [selectedCreature.name]: normalizeBattlefieldCreatureFraming({ ...framing, ...patch }),
        });
    };
    const resetCurrent = () => {
        const next = { ...overrides };
        delete next[selectedCreature.name];
        persist(next, `${selectedCreature.name}: настройки сброшены`);
    };
    const resetAll = () => {
        if (!window.confirm("Сбросить настройки всех существ на карте?")) return;
        persist({}, "Все настройки сброшены");
    };
    const copyText = async (text: string, message: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setStatus(message);
        } catch {
            setStatus("Не удалось скопировать — разрешите доступ к буферу обмена");
        }
    };
    const switchLevel = (level: number) => {
        if (!twoByOneMode && !allLevelsMode && level === editorLevel) return;
        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.set("level", String(level));
        nextUrl.searchParams.delete("footprint");
        nextUrl.searchParams.delete("creature");
        window.location.assign(nextUrl.toString());
    };
    const switchToAllLevels = () => {
        if (allLevelsMode) return;
        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.set("level", "all");
        nextUrl.searchParams.delete("footprint");
        nextUrl.searchParams.delete("creature");
        window.location.assign(nextUrl.toString());
    };
    const switchToTwoByOne = () => {
        if (twoByOneMode) return;
        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.set("footprint", "2x1");
        nextUrl.searchParams.delete("level");
        nextUrl.searchParams.delete("creature");
        window.location.assign(nextUrl.toString());
    };
    const togglePanelSide = () => {
        const nextSide: EditorPanelSide = panelSide === "left" ? "right" : "left";
        setPanelSide(nextSide);
        try {
            window.localStorage.setItem(EDITOR_PANEL_SIDE_STORAGE_KEY, nextSide);
        } catch {
            // The editor still works when storage is unavailable; the side simply will not persist.
        }
    };
    const toggleCreatureVisibility = (creatureId: number) => {
        const isHidden = hiddenCreatureIds.has(creatureId);
        if (!isHidden && visibleCreatures.length <= 1) {
            setStatus("На карте должно остаться хотя бы одно существо");
            return;
        }
        const next = new Set(hiddenCreatureIds);
        if (isHidden) next.delete(creatureId);
        else next.add(creatureId);
        setHiddenCreatureIds(next);

        if (!isHidden && selectedCreatureId === creatureId) {
            const fallback = filteredCreatures.find((creature) => creature.id !== creatureId && !next.has(creature.id));
            if (fallback) setSelectedCreatureId(fallback.id);
        }
        setStatus(isHidden ? "Существо снова показано" : "Существо временно скрыто");
    };

    return (
        <Box sx={{ position: "fixed", inset: 0, overflow: "hidden", bgcolor: "#000" }}>
            {atlasesReady ? (
                <>
                    <RankedGameView
                        gameId={PREVIEW_PLACEMENT_GAME_ID}
                        userTeam={TeamVals.LOWER}
                        windowSize={windowSize}
                    />
                    <CreatureSelectionOverlays
                        creatures={visibleCreatures}
                        selectedCreatureName={selectedCreature.name}
                        onSelect={setSelectedCreatureId}
                    />
                    {!hiddenCreatureIds.has(selectedCreature.id) && (
                        <CreatureTransformHandles
                            creatureName={selectedCreature.name}
                            framing={framing}
                            onChange={updateFraming}
                        />
                    )}
                </>
            ) : (
                <Typography sx={{ position: "fixed", left: 32, top: 32, color: "#e0c999" }}>
                    Загружаю модели {twoByOneMode ? "2×1" : allLevelsMode ? "всех уровней" : `уровня ${editorLevel}`}…
                </Typography>
            )}
            {!panelExpanded && (
                <Button
                    type="button"
                    size="sm"
                    variant="solid"
                    color="warning"
                    aria-label="Открыть редактор моделей"
                    aria-expanded={false}
                    onClick={() => setPanelExpanded(true)}
                    sx={{
                        position: "fixed",
                        zIndex: 20000,
                        top: 14,
                        left: panelSide === "left" ? 4 : undefined,
                        right: panelSide === "right" ? 4 : undefined,
                        width: Math.max(36, editorRailWidth - 8),
                        height: 132,
                        minWidth: 0,
                        px: 0,
                        writingMode: "vertical-rl",
                        letterSpacing: "0.12em",
                        pointerEvents: "auto",
                    }}
                >
                    РЕДАКТОР
                </Button>
            )}
            <Sheet
                sx={{
                    position: "fixed",
                    zIndex: 13000,
                    top: panelExpanded ? 14 : 0,
                    left: panelSide === "left" ? (panelExpanded ? 14 : 0) : undefined,
                    right: panelSide === "right" ? (panelExpanded ? 14 : 0) : undefined,
                    width: panelExpanded ? 390 : editorRailWidth,
                    height: panelExpanded ? "calc(100dvh - 28px)" : "100dvh",
                    maxWidth: panelExpanded ? "calc(100vw - 28px)" : undefined,
                    overflow: "hidden",
                    p: panelExpanded ? 2 : 0.5,
                    color: hocColors.parchment,
                    bgcolor: "rgba(14,9,5,.96)",
                    border: `1px solid ${hocColors.orangeBorder}`,
                    borderRadius: panelExpanded ? "14px" : 0,
                    boxShadow: "0 16px 46px rgba(0,0,0,.7)",
                    display: panelExpanded ? "flex" : "none",
                    flexDirection: "column",
                    pointerEvents: panelExpanded ? "auto" : "none",
                    transition:
                        "width 160ms ease, top 160ms ease, left 160ms ease, right 160ms ease, border-radius 160ms ease",
                }}
            >
                <Box sx={{ display: panelExpanded ? "grid" : "none", gridTemplateColumns: "1fr 1fr", gap: 0.75 }}>
                    <Button
                        type="button"
                        size="sm"
                        variant="outlined"
                        color="warning"
                        aria-label="Свернуть настройки редактора"
                        aria-expanded={panelExpanded}
                        onClick={() => setPanelExpanded(false)}
                        sx={{ minWidth: 0, px: 1 }}
                    >
                        Свернуть
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        variant="outlined"
                        color="neutral"
                        aria-label={`Переместить настройки ${panelSide === "left" ? "вправо" : "влево"}`}
                        onClick={togglePanelSide}
                        sx={{ minWidth: 0, px: 1 }}
                    >
                        {panelSide === "left" ? "Вправо →" : "← Влево"}
                    </Button>
                </Box>

                <Box
                    sx={{
                        display: panelExpanded ? "block" : "none",
                        flex: "1 1 auto",
                        minHeight: 0,
                        mt: 1,
                        overflowY: "auto",
                    }}
                >
                    <Typography level="h3" sx={{ color: "#e0c999", fontFamily: hocDisplayFontFamily }}>
                        BATTLEFIELD MODEL EDITOR
                    </Typography>
                    <Typography level="body-xs" sx={{ mt: 0.5, color: hocColors.muted }}>
                        {twoByOneMode
                            ? "Все существа 2×1 стоят одной линией по нижнему краю карты."
                            : allLevelsMode
                              ? "Все существа L1–L4 разложены по четырём рядам: один уровень на ряд."
                              : `Существа L${editorLevel} стоят одной линией по нижнему краю карты.`}{" "}
                        Кликните по модели, затем двигайте рамку; жёлтые ручки меняют ширину и высоту независимо.
                    </Typography>

                    <Box sx={{ mt: 1.25, display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 0.75 }}>
                        <Button
                            size="sm"
                            variant={allLevelsMode ? "solid" : "outlined"}
                            color={allLevelsMode ? "warning" : "neutral"}
                            aria-label="Показать существ всех уровней"
                            aria-pressed={allLevelsMode}
                            onClick={switchToAllLevels}
                            sx={{ minWidth: 0 }}
                        >
                            ALL
                        </Button>
                        {[1, 2, 3, 4].map((level) => (
                            <Button
                                key={level}
                                size="sm"
                                variant={!twoByOneMode && level === editorLevel ? "solid" : "outlined"}
                                color={!twoByOneMode && level === editorLevel ? "warning" : "neutral"}
                                aria-pressed={!twoByOneMode && level === editorLevel}
                                onClick={() => switchLevel(level)}
                                sx={{ minWidth: 0 }}
                            >
                                L{level}
                            </Button>
                        ))}
                        <Button
                            size="sm"
                            variant={twoByOneMode ? "solid" : "outlined"}
                            color={twoByOneMode ? "warning" : "neutral"}
                            aria-pressed={twoByOneMode}
                            onClick={switchToTwoByOne}
                            sx={{ minWidth: 0 }}
                        >
                            2×1
                        </Button>
                    </Box>

                    <Box sx={{ mt: 1.5, p: 1, border: `1px solid ${hocColors.orangeBorder}`, borderRadius: "8px" }}>
                        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
                            <Typography level="title-sm" sx={{ color: "#ffd15a" }}>
                                Отображение на карте
                            </Typography>
                            <Button
                                size="sm"
                                variant="plain"
                                color="warning"
                                disabled={!hiddenCreatureIds.size}
                                onClick={() => {
                                    setHiddenCreatureIds(new Set());
                                    setStatus("Все существа показаны");
                                }}
                            >
                                Показать всех
                            </Button>
                        </Box>
                        <Box
                            sx={{
                                mt: 0.75,
                                display: "grid",
                                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                                gap: 0.5,
                            }}
                        >
                            {filteredCreatures.map((creature) => {
                                const visible = !hiddenCreatureIds.has(creature.id);
                                return (
                                    <Box
                                        key={creature.id}
                                        component="label"
                                        sx={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 0.65,
                                            minWidth: 0,
                                            px: 0.5,
                                            py: 0.35,
                                            borderRadius: "5px",
                                            color: visible ? hocColors.parchment : hocColors.muted,
                                            bgcolor: visible ? "rgba(255,174,37,.055)" : "rgba(0,0,0,.22)",
                                            cursor: "pointer",
                                            fontSize: 12,
                                        }}
                                    >
                                        <Box
                                            component="input"
                                            type="checkbox"
                                            checked={visible}
                                            onChange={() => toggleCreatureVisibility(creature.id)}
                                            sx={{ accentColor: hocColors.orange, flex: "0 0 auto" }}
                                        />
                                        <Box
                                            component="span"
                                            title={creature.name}
                                            sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                                        >
                                            {creature.name}
                                        </Box>
                                    </Box>
                                );
                            })}
                        </Box>
                        <Typography level="body-xs" sx={{ mt: 0.75, color: hocColors.muted }}>
                            Показано {visibleCreatures.length} из {filteredCreatures.length}. Скрытие временное и не
                            меняет настройки размеров.
                        </Typography>
                    </Box>

                    <Box
                        component="select"
                        value={selectedCreatureId}
                        onChange={(event) => setSelectedCreatureId(Number((event.target as HTMLSelectElement).value))}
                        sx={{
                            mt: 1.5,
                            width: "100%",
                            p: 1,
                            color: hocColors.parchment,
                            bgcolor: "#17100a",
                            border: `1px solid ${hocColors.orangeBorder}`,
                            borderRadius: "8px",
                        }}
                    >
                        {filteredCreatures.map((creature) => (
                            <option key={creature.id} value={creature.id}>
                                L{creature.level} · {creature.faction} · {creature.name}
                            </option>
                        ))}
                    </Box>

                    <Typography level="title-lg" sx={{ mt: 1.5, color: "#ffd15a" }}>
                        {selectedCreature.name}
                    </Typography>
                    <Typography level="body-xs" sx={{ color: hocColors.muted }}>
                        L{selectedCreature.level} · {selectedCreature.faction}
                    </Typography>

                    <Box sx={{ mt: 1.5, display: "grid", gap: 1.25 }}>
                        <ValueSlider
                            label="Ширина"
                            value={framing.scaleX}
                            min={0.25}
                            max={3}
                            step={0.01}
                            onChange={(scaleX) => updateFraming({ scaleX })}
                        />
                        <ValueSlider
                            label="Высота"
                            value={framing.scaleY}
                            min={0.25}
                            max={3}
                            step={0.01}
                            onChange={(scaleY) => updateFraming({ scaleY })}
                        />
                        <ValueSlider
                            label="X (клетки)"
                            value={framing.offsetXCells}
                            min={-2}
                            max={2}
                            step={0.01}
                            onChange={(offsetXCells) => updateFraming({ offsetXCells })}
                        />
                        <ValueSlider
                            label="Y (клетки)"
                            value={framing.offsetYCells}
                            min={-2}
                            max={2}
                            step={0.01}
                            onChange={(offsetYCells) => updateFraming({ offsetYCells })}
                        />
                        <Typography level="title-sm" sx={{ mt: 0.75, color: "#ffd15a" }}>
                            Флаг над существом
                        </Typography>
                        <ValueSlider
                            label="Флаг X"
                            value={framing.flagOffsetXCells ?? 0}
                            min={-2}
                            max={2}
                            step={0.01}
                            onChange={(flagOffsetXCells) => updateFraming({ flagOffsetXCells })}
                        />
                        <ValueSlider
                            label="Флаг Y"
                            value={framing.flagOffsetYCells ?? 0}
                            min={-2}
                            max={2}
                            step={0.01}
                            onChange={(flagOffsetYCells) => updateFraming({ flagOffsetYCells })}
                        />
                    </Box>

                    <Box sx={{ mt: 1.5, display: "flex", gap: 0.75, flexWrap: "wrap" }}>
                        <Button
                            size="sm"
                            variant="outlined"
                            color="warning"
                            onClick={() =>
                                updateFraming({
                                    scaleY: framing.scaleX,
                                })
                            }
                        >
                            Высота = ширине
                        </Button>
                        <Button
                            size="sm"
                            variant="outlined"
                            color="neutral"
                            disabled={!overrides[selectedCreature.name]}
                            onClick={resetCurrent}
                        >
                            Reset current
                        </Button>
                    </Box>

                    <Box sx={{ mt: 1.5, display: "flex", gap: 0.75, flexWrap: "wrap" }}>
                        <Button
                            size="sm"
                            variant="outlined"
                            color="neutral"
                            onClick={() => void copyText(JSON.stringify(overrides, null, 2), "JSON скопирован")}
                        >
                            Copy JSON
                        </Button>
                        <Button
                            size="sm"
                            variant="outlined"
                            color="warning"
                            onClick={() => void copyText(formatTypeScriptConfig(overrides), "TypeScript скопирован")}
                        >
                            Copy TypeScript
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
                    </Box>

                    <Typography level="body-xs" sx={{ mt: 1.5, color: hocColors.muted }}>
                        {status} · настроено {Object.keys(overrides).length}
                    </Typography>
                </Box>
            </Sheet>
        </Box>
    );
};
