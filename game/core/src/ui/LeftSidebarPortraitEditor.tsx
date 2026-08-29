import {
    CREATURES_JSON,
    CreatureVals,
    FactionVals,
    getCreaturesByLevel,
    HoCConfig,
    TeamVals,
} from "@heroesofcrypto/common";
import { Box, Button, Input, List, Sheet, Typography } from "@mui/joy";
import React, { useEffect, useMemo, useState } from "react";

import { images } from "../generated/image_imports";
import { battleSidebarWidth } from "../pixi/boardFit";
import type { IVisibleOverallImpact } from "../scenes/VisibleState";
import { CreaturePortraitImage } from "./CreaturePortraitImage";
import { hocColors, hocDisplayFontFamily } from "./hocTheme";
import {
    LEFT_SIDEBAR_BG_IMAGE,
    LEFT_SIDEBAR_BG_POSITION,
    SIDEBAR_BG,
    SIDEBAR_BG_REPEAT,
    sidebarBackgroundSize,
    sidebarVerticalRailWidth,
} from "./LeftSideBar";
import {
    computeBattleSidebarMetrics,
    SIDEBAR_FRAME_RIGHT_INSET_PX,
    SidebarMetricsContext,
    sidebarFrameBottomInsetPx,
    sidebarFrameSideInsetPx,
    sidebarFrameTopInsetPx,
} from "./LeftSideBar/sidebarMetrics";
import { UnitStatsListItem } from "./LeftSideBar/UnitStatsListItem";
import { useFitScale } from "./LeftSideBar/useFitScale";
import {
    committedLeftSidebarPortraitTuning,
    LEFT_SIDEBAR_PORTRAIT_TUNING,
    LEFT_SIDEBAR_ART_OFFSET_MAX,
    LEFT_SIDEBAR_ART_OFFSET_MIN,
    LEFT_SIDEBAR_ART_SCALE_MAX,
    LEFT_SIDEBAR_ART_SCALE_MIN,
    LEFT_SIDEBAR_CONTAINER_OFFSET_MAX,
    LEFT_SIDEBAR_CONTAINER_OFFSET_MIN,
    LEFT_SIDEBAR_CONTAINER_WIDTH_MAX,
    LEFT_SIDEBAR_CONTAINER_WIDTH_MIN,
    leftSidebarPortraitTuningEquals,
    normalizeLeftSidebarPortraitTuning,
    readStoredLeftSidebarPortraitTunings,
    writeStoredLeftSidebarPortraitTunings,
    type LeftSidebarPortraitTuning,
} from "./leftSidebarPortraitTuning";
import { resolveLeftSidebarPortraitArt } from "./leftSidebarPortraitArt";
import { UNIT_ID_TO_NAME } from "./unit_ui_constants";

const FACTION_ORDER = ["Life", "Nature", "Chaos", "Might"];
const enumNames = CreatureVals as unknown as Record<number, string>;

const creatureFactionByName = (() => {
    const result = new Map<string, string>();
    for (const [faction, roster] of Object.entries(CREATURES_JSON as Record<string, unknown>)) {
        if (!roster || typeof roster !== "object") continue;
        for (const creatureName of Object.keys(roster)) result.set(creatureName, faction);
    }
    return result;
})();

interface EditorCreature {
    id: number;
    level: number;
    name: string;
    faction: string;
}

const EDITOR_CREATURES: EditorCreature[] = [1, 2, 3, 4].flatMap((level) =>
    [...getCreaturesByLevel(level)]
        .map((id) => {
            const name = UNIT_ID_TO_NAME[id] ?? `Creature ${id}`;
            return { id, level, name, faction: creatureFactionByName.get(name) ?? "" };
        })
        .filter((creature) => creature.faction !== "Death")
        .sort((left, right) => FACTION_ORDER.indexOf(left.faction) - FACTION_ORDER.indexOf(right.faction)),
);

const EMPTY_IMPACT: IVisibleOverallImpact = Object.freeze({ abilities: [], buffs: [], debuffs: [] });
const DEFAULT_BATTLE_VIEWPORT = Object.freeze({ width: 2560, height: 1080 });

const ValueSlider: React.FC<{
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    suffix?: string;
    onChange: (value: number) => void;
}> = ({ label, value, min, max, step, suffix = "", onChange }) => (
    <Box sx={{ display: "grid", gridTemplateColumns: "112px 1fr 92px", gap: 1.25, alignItems: "center" }}>
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
            endDecorator={suffix || undefined}
            sx={{
                minWidth: 0,
                bgcolor: "rgba(0,0,0,.34)",
                color: hocColors.parchment,
                borderColor: hocColors.orangeBorder,
                "& input": { px: 0.75, textAlign: "center" },
            }}
        />
    </Box>
);

const SidebarPreview: React.FC<{ creature: EditorCreature }> = ({ creature }) => {
    const [viewport, setViewport] = useState<{ width: number; height: number }>(() => ({
        ...DEFAULT_BATTLE_VIEWPORT,
    }));
    const [previewScale, setPreviewScale] = useState(0.6);
    const { setViewport: setFitViewport, setContent, scale: fitScale } = useFitScale();

    const barSize = battleSidebarWidth(viewport.width, viewport.height);
    const topInset = Math.max(8, Math.round(sidebarFrameTopInsetPx(viewport.height) * 0.45));
    const bottomInset = sidebarFrameBottomInsetPx(viewport.height);
    const cardHeight = Math.max(140, viewport.height - topInset - bottomInset);
    const metrics = useMemo(
        () => computeBattleSidebarMetrics(barSize, viewport.width, viewport.height, cardHeight),
        [barSize, cardHeight, viewport.height, viewport.width],
    );
    const unitProperties = useMemo(
        () =>
            HoCConfig.getCreatureConfig(
                TeamVals.LEFT,
                creature.faction,
                creature.name,
                `${creature.name.toLowerCase().replaceAll(" ", "_")}_512`,
                1,
            ),
        [creature.faction, creature.name],
    );
    const balancedOuterInset = Math.round((sidebarFrameSideInsetPx(barSize) + SIDEBAR_FRAME_RIGHT_INSET_PX) / 2);
    const unitDetailsShellPadding = Math.max(2, Math.round(metrics.padPx * 0.16));
    const verticalRailWidth = sidebarVerticalRailWidth(barSize);

    return (
        <Box
            sx={{
                display: "grid",
                justifyItems: "center",
                gap: 0.75,
            }}
        >
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0.75, flexWrap: "wrap" }}>
                <Typography level="body-xs" sx={{ color: hocColors.mutedStrong }}>
                    Игровой viewport
                </Typography>
                <Input
                    type="number"
                    value={viewport.width}
                    slotProps={{ input: { min: 1024, max: 5120, step: 1 } }}
                    onChange={(event) =>
                        setViewport((current) => ({ ...current, width: Math.max(1024, Number(event.target.value)) }))
                    }
                    sx={{ width: 92, bgcolor: "rgba(0,0,0,.34)", color: hocColors.parchment }}
                />
                <Typography level="body-xs">×</Typography>
                <Input
                    type="number"
                    value={viewport.height}
                    slotProps={{ input: { min: 720, max: 2160, step: 1 } }}
                    onChange={(event) =>
                        setViewport((current) => ({ ...current, height: Math.max(720, Number(event.target.value)) }))
                    }
                    sx={{ width: 92, bgcolor: "rgba(0,0,0,.34)", color: hocColors.parchment }}
                />
                <Typography level="body-xs" sx={{ ml: 1, color: hocColors.mutedStrong }}>
                    Размер блока {Math.round(previewScale * 100)}%
                </Typography>
                <Box
                    component="input"
                    type="range"
                    min={0.4}
                    max={1}
                    step={0.05}
                    value={previewScale}
                    onInput={(event) => setPreviewScale(Number((event.target as HTMLInputElement).value))}
                    sx={{ width: 112, accentColor: hocColors.orange, cursor: "pointer" }}
                />
            </Box>
            <Box
                data-left-sidebar-preview-frame
                sx={{
                    position: "relative",
                    width: `${barSize * previewScale}px`,
                    height: `${viewport.height * previewScale}px`,
                }}
            >
                <Box
                    data-left-sidebar-preview-canvas
                    sx={{
                        position: "relative",
                        width: `${barSize}px`,
                        height: `${viewport.height}px`,
                        overflow: "hidden",
                        transform: `scale(${previewScale})`,
                        transformOrigin: "top left",
                        bgcolor: SIDEBAR_BG,
                        backgroundImage: LEFT_SIDEBAR_BG_IMAGE,
                        backgroundSize: sidebarBackgroundSize(barSize),
                        backgroundRepeat: SIDEBAR_BG_REPEAT,
                        backgroundPosition: LEFT_SIDEBAR_BG_POSITION,
                        "&::before": {
                            content: '\"\"',
                            position: "absolute",
                            inset: "0 auto 0 0",
                            width: `${verticalRailWidth}px`,
                            zIndex: 30,
                            pointerEvents: "none",
                            backgroundImage: `url(${images.ui_sidebar_bg_left_smoked_bronze_inner_v11})`,
                            backgroundRepeat: "no-repeat",
                            backgroundPosition: "center",
                            backgroundSize: "100% 103%",
                            transform: "scaleX(-1)",
                        },
                        "&::after": {
                            content: '\"\"',
                            position: "absolute",
                            inset: "0 0 0 auto",
                            width: `${verticalRailWidth}px`,
                            zIndex: 30,
                            pointerEvents: "none",
                            backgroundImage: `url(${images.ui_sidebar_bg_left_smoked_bronze_inner_v11})`,
                            backgroundRepeat: "no-repeat",
                            backgroundPosition: "center",
                            backgroundSize: "100% 103%",
                        },
                    }}
                >
                    <SidebarMetricsContext.Provider value={metrics}>
                        <Box
                            ref={setFitViewport}
                            sx={{
                                position: "absolute",
                                inset: `${topInset}px ${balancedOuterInset}px ${bottomInset}px`,
                                "--sidebar-card-top-inset": `${topInset}px`,
                                "--sidebar-card-left-bleed": `${balancedOuterInset + unitDetailsShellPadding}px`,
                                "--sidebar-card-right-bleed": `${balancedOuterInset + unitDetailsShellPadding}px`,
                                "--sidebar-card-frame-top-gap": `${unitDetailsShellPadding + 2}px`,
                                "--sidebar-card-top-extension": `${Math.max(
                                    8,
                                    Math.round(sidebarFrameTopInsetPx(viewport.height) * 1.45),
                                )}px`,
                                boxSizing: "border-box",
                            }}
                        >
                            <Box
                                ref={setContent}
                                className="SidebarCard"
                                sx={{
                                    width: "100%",
                                    height: "100%",
                                    "--sidebar-card-fit-scale": `${fitScale}`,
                                    "--sidebar-card-inverse-fit-scale": `${1 / fitScale}`,
                                    transform: fitScale === 1 ? "none" : `scale(${fitScale})`,
                                    transformOrigin: "top center",
                                    transition: "transform 160ms ease-out",
                                }}
                            >
                                <List
                                    size="sm"
                                    sx={{
                                        width: "100%",
                                        height: "100%",
                                        p: 0,
                                        gap: 0,
                                        "--List-nestedInsetStart": "0px",
                                        "--ListItem-paddingX": "0px",
                                        "--ListItem-paddingY": "0px",
                                    }}
                                >
                                    <UnitStatsListItem
                                        unitProperties={unitProperties}
                                        overallImpact={EMPTY_IMPACT}
                                        factionType={FactionVals.NO_FACTION}
                                    />
                                </List>
                            </Box>
                        </Box>
                    </SidebarMetricsContext.Provider>
                </Box>
            </Box>
            <Typography level="body-xs" sx={{ color: "rgba(229,210,172,.58)" }}>
                Боевой sidebar 1:1 · viewport {viewport.width} × {viewport.height} · sidebar {barSize}px · контент{" "}
                {metrics.contentWidth}px · отображение {Math.round(previewScale * 100)}% · fit{" "}
                {Math.round(fitScale * 100)}%
            </Typography>
        </Box>
    );
};

const formatTypeScriptConfig = (overrides: Record<number, LeftSidebarPortraitTuning>): string => {
    const rows = Object.entries(overrides)
        .map(([creatureId, tuning]) => [Number(creatureId), normalizeLeftSidebarPortraitTuning(tuning)] as const)
        .sort(([left], [right]) => left - right)
        .map(([creatureId, tuning]) => {
            const enumName = enumNames[creatureId] ?? String(creatureId);
            return `    [CreatureVals.${enumName}]: ${JSON.stringify(tuning)},`;
        });
    return `export const LEFT_SIDEBAR_PORTRAIT_TUNING: Partial<Record<number, LeftSidebarPortraitTuning>> = {\n${rows.join("\n")}\n};`;
};

export const LeftSidebarPortraitEditor: React.FC = () => {
    const [selectedCreatureId, setSelectedCreatureId] = useState(EDITOR_CREATURES[0]?.id ?? 0);
    const [overrides, setOverrides] = useState<Record<number, LeftSidebarPortraitTuning>>(() =>
        readStoredLeftSidebarPortraitTunings(),
    );
    const [levelFilter, setLevelFilter] = useState<number | "all">("all");
    const [search, setSearch] = useState("");
    const [status, setStatus] = useState("Настройки сохраняются автоматически и применяются в dev-игре");

    const selectedCreature = EDITOR_CREATURES.find((creature) => creature.id === selectedCreatureId);
    const baseline = selectedCreature
        ? committedLeftSidebarPortraitTuning(selectedCreature.id)
        : committedLeftSidebarPortraitTuning(0);
    const tuning = selectedCreature ? (overrides[selectedCreature.id] ?? baseline) : baseline;

    const visibleCreatures = useMemo(() => {
        const normalizedSearch = search.trim().toLowerCase();
        return EDITOR_CREATURES.filter(
            (creature) =>
                (levelFilter === "all" || creature.level === levelFilter) &&
                (!normalizedSearch || creature.name.toLowerCase().includes(normalizedSearch)),
        );
    }, [levelFilter, search]);

    useEffect(() => {
        const previousHtmlOverflowX = document.documentElement.style.overflowX;
        const previousBodyOverflowX = document.body.style.overflowX;
        document.documentElement.style.overflowX = "hidden";
        document.body.style.overflowX = "hidden";
        return () => {
            document.documentElement.style.overflowX = previousHtmlOverflowX;
            document.body.style.overflowX = previousBodyOverflowX;
        };
    }, []);

    if (import.meta.env.PROD || import.meta.env.VITE_IS_PROD === "true") {
        return (
            <Typography sx={{ p: 4 }}>Left sidebar portrait editor is available only in development builds.</Typography>
        );
    }
    if (!selectedCreature) return null;

    const persist = (next: Record<number, LeftSidebarPortraitTuning>, message = "Сохранено локально") => {
        setOverrides(next);
        writeStoredLeftSidebarPortraitTunings(next);
        setStatus(message);
    };
    const updateTuning = (patch: Partial<LeftSidebarPortraitTuning>) =>
        persist({
            ...overrides,
            [selectedCreature.id]: normalizeLeftSidebarPortraitTuning({ ...tuning, ...patch }, baseline),
        });
    const resetCurrent = () => {
        const next = { ...overrides };
        delete next[selectedCreature.id];
        persist(next, `${selectedCreature.name}: восстановлена базовая настройка`);
    };
    const resetAll = () => {
        if (!window.confirm("Сбросить все локальные настройки левого боевого портрета?")) return;
        persist({}, "Все локальные настройки сброшены");
    };
    const copyText = async (text: string, successMessage: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setStatus(successMessage);
        } catch {
            setStatus("Не удалось скопировать — разрешите доступ к буферу обмена");
        }
    };
    const savedCount = Object.keys(overrides).length;

    return (
        <Box
            sx={{
                minHeight: "100vh",
                p: { xs: 1.5, md: 2.5 },
                color: hocColors.parchment,
                backgroundImage: `linear-gradient(rgba(4,3,2,.74), rgba(4,3,2,.9)), url(${images.pick_phase_ember_background_v2})`,
                backgroundSize: "cover",
                backgroundAttachment: "fixed",
            }}
        >
            <Box sx={{ maxWidth: 1680, mx: "auto" }}>
                <Box sx={{ mb: 2, display: "flex", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
                    <Box>
                        <Typography
                            level="h2"
                            sx={{ fontFamily: hocDisplayFontFamily, color: "#e0c999", letterSpacing: ".08em" }}
                        >
                            LEFT SIDEBAR PORTRAIT EDITOR
                        </Typography>
                        <Typography level="body-sm" sx={{ color: hocColors.muted }}>
                            Только песочница и бой · в проекте {Object.keys(LEFT_SIDEBAR_PORTRAIT_TUNING).length} ·
                            локально изменено {savedCount}
                        </Typography>
                    </Box>
                    <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                        <Button
                            variant="outlined"
                            color="neutral"
                            onClick={() => void copyText(JSON.stringify(overrides, null, 2), "JSON скопирован")}
                        >
                            Copy JSON
                        </Button>
                        <Button
                            variant="outlined"
                            color="warning"
                            onClick={() =>
                                void copyText(formatTypeScriptConfig(overrides), "TypeScript-конфигурация скопирована")
                            }
                        >
                            Copy TypeScript
                        </Button>
                        <Button variant="outlined" color="danger" onClick={resetAll} disabled={!savedCount}>
                            Reset all
                        </Button>
                    </Box>
                </Box>

                <Box
                    sx={{
                        display: "grid",
                        gridTemplateColumns: { xs: "1fr", xl: "minmax(0, 1fr) 480px" },
                        gap: 2,
                        alignItems: "start",
                    }}
                >
                    <Sheet
                        sx={{
                            p: 1.5,
                            bgcolor: "rgba(14,9,5,.92)",
                            border: `1px solid ${hocColors.orangeBorder}`,
                            borderRadius: "14px",
                        }}
                    >
                        <Box sx={{ display: "flex", gap: 1, mb: 1.5, flexWrap: "wrap" }}>
                            {["all", 1, 2, 3, 4].map((level) => (
                                <Button
                                    key={level}
                                    size="sm"
                                    variant={levelFilter === level ? "solid" : "outlined"}
                                    color={levelFilter === level ? "warning" : "neutral"}
                                    onClick={() => setLevelFilter(level as number | "all")}
                                >
                                    {level === "all" ? "Все" : `L${level}`}
                                </Button>
                            ))}
                            <Input
                                size="sm"
                                value={search}
                                placeholder="Поиск существа"
                                onChange={(event) => setSearch(event.target.value)}
                                sx={{ ml: { sm: "auto" }, minWidth: 210, bgcolor: "rgba(0,0,0,.3)" }}
                            />
                        </Box>
                        <Box
                            sx={{
                                display: "grid",
                                gridTemplateColumns: "repeat(auto-fill, minmax(104px, 1fr))",
                                gap: 1,
                            }}
                        >
                            {visibleCreatures.map((creature) => {
                                const creatureTuning =
                                    overrides[creature.id] ?? committedLeftSidebarPortraitTuning(creature.id);
                                const sidebarPortraitArt = resolveLeftSidebarPortraitArt(creature.id);
                                const customized = !leftSidebarPortraitTuningEquals(
                                    creatureTuning,
                                    committedLeftSidebarPortraitTuning(creature.id),
                                );
                                return (
                                    <Box
                                        component="button"
                                        type="button"
                                        key={creature.id}
                                        onClick={() => setSelectedCreatureId(creature.id)}
                                        sx={{
                                            minWidth: 0,
                                            p: 0,
                                            border: 0,
                                            bgcolor: "transparent",
                                            color: "inherit",
                                            cursor: "pointer",
                                        }}
                                    >
                                        <Box
                                            sx={{
                                                position: "relative",
                                                width: "100%",
                                                aspectRatio: "190 / 256",
                                                overflow: "hidden",
                                                borderRadius: "8px",
                                                border:
                                                    selectedCreatureId === creature.id
                                                        ? "2px solid #54c778"
                                                        : "2px solid rgba(255,255,255,.18)",
                                                boxShadow:
                                                    selectedCreatureId === creature.id
                                                        ? "0 0 14px rgba(84,199,120,.4)"
                                                        : "none",
                                            }}
                                        >
                                            <CreaturePortraitImage
                                                creatureId={creature.id}
                                                artScale={creatureTuning.artScale}
                                                artScaleX={sidebarPortraitArt.artScaleX}
                                                artOffsetX={creatureTuning.artOffsetX}
                                                artOffsetY={creatureTuning.artOffsetY}
                                                artSource={sidebarPortraitArt.source}
                                                artFit={sidebarPortraitArt.fit}
                                                artBaseScale={sidebarPortraitArt.baseScale}
                                                highQualityArt
                                                sx={{ width: "100%", height: "100%" }}
                                            />
                                            {customized && (
                                                <Box
                                                    title="Есть локальная настройка"
                                                    sx={{
                                                        position: "absolute",
                                                        top: 5,
                                                        right: 5,
                                                        width: 9,
                                                        height: 9,
                                                        borderRadius: "50%",
                                                        bgcolor: "#54c778",
                                                        boxShadow: "0 0 7px rgba(84,199,120,.8)",
                                                        zIndex: 4,
                                                    }}
                                                />
                                            )}
                                        </Box>
                                        <Typography
                                            level="body-xs"
                                            sx={{
                                                mt: 0.5,
                                                overflow: "hidden",
                                                textOverflow: "ellipsis",
                                                whiteSpace: "nowrap",
                                            }}
                                        >
                                            {creature.name}
                                        </Typography>
                                    </Box>
                                );
                            })}
                        </Box>
                    </Sheet>

                    <Sheet
                        sx={{
                            position: { xl: "sticky" },
                            order: { xs: -1, xl: 0 },
                            top: 16,
                            p: 2,
                            bgcolor: "rgba(14,9,5,.96)",
                            border: `1px solid ${hocColors.orangeBorder}`,
                            borderRadius: "14px",
                            boxShadow: "0 14px 38px rgba(0,0,0,.55)",
                        }}
                    >
                        <Box sx={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 1 }}>
                            <Typography level="h3" sx={{ color: "#e0c999", fontFamily: hocDisplayFontFamily }}>
                                {selectedCreature.name}
                            </Typography>
                            <Typography level="body-xs" sx={{ color: hocColors.muted }}>
                                L{selectedCreature.level} · {selectedCreature.faction}
                            </Typography>
                        </Box>

                        <Box sx={{ mt: 1.5 }}>
                            <SidebarPreview creature={selectedCreature} />
                        </Box>

                        <Box sx={{ mt: 2, display: "grid", gap: 1.15 }}>
                            <Typography level="title-sm" sx={{ color: "#d5b877" }}>
                                Существо — фон расы не меняется
                            </Typography>
                            <ValueSlider
                                label="Масштаб"
                                value={tuning.artScale}
                                min={LEFT_SIDEBAR_ART_SCALE_MIN}
                                max={LEFT_SIDEBAR_ART_SCALE_MAX}
                                step={0.01}
                                onChange={(artScale) => updateTuning({ artScale })}
                            />
                            <ValueSlider
                                label="X существа"
                                value={tuning.artOffsetX}
                                min={LEFT_SIDEBAR_ART_OFFSET_MIN}
                                max={LEFT_SIDEBAR_ART_OFFSET_MAX}
                                step={1}
                                suffix="%"
                                onChange={(artOffsetX) => updateTuning({ artOffsetX })}
                            />
                            <ValueSlider
                                label="Y существа"
                                value={tuning.artOffsetY}
                                min={LEFT_SIDEBAR_ART_OFFSET_MIN}
                                max={LEFT_SIDEBAR_ART_OFFSET_MAX}
                                step={1}
                                suffix="%"
                                onChange={(artOffsetY) => updateTuning({ artOffsetY })}
                            />

                            <Typography level="title-sm" sx={{ mt: 1, color: "#d5b877" }}>
                                Блок «портрет + статы»
                            </Typography>
                            <ValueSlider
                                label="Ширина блока"
                                value={tuning.containerWidth}
                                min={LEFT_SIDEBAR_CONTAINER_WIDTH_MIN}
                                max={LEFT_SIDEBAR_CONTAINER_WIDTH_MAX}
                                step={0.5}
                                suffix="%"
                                onChange={(containerWidth) => updateTuning({ containerWidth })}
                            />
                            <ValueSlider
                                label="X блока"
                                value={tuning.containerOffsetX}
                                min={LEFT_SIDEBAR_CONTAINER_OFFSET_MIN}
                                max={LEFT_SIDEBAR_CONTAINER_OFFSET_MAX}
                                step={0.5}
                                suffix="%"
                                onChange={(containerOffsetX) => updateTuning({ containerOffsetX })}
                            />
                        </Box>

                        <Box
                            sx={{
                                mt: 2,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 1,
                            }}
                        >
                            <Typography level="body-xs" sx={{ color: hocColors.muted }}>
                                {status}
                            </Typography>
                            <Button
                                variant="outlined"
                                color="neutral"
                                onClick={resetCurrent}
                                disabled={!overrides[selectedCreature.id]}
                            >
                                Reset current
                            </Button>
                        </Box>
                    </Sheet>
                </Box>
            </Box>
        </Box>
    );
};
