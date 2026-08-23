import { CREATURES_JSON, CreatureVals, getCreaturesByLevel } from "@heroesofcrypto/common";
import { Box, Button, Input, Sheet, Typography } from "@mui/joy";
import React, { useEffect, useMemo, useState } from "react";

import { images } from "../generated/image_imports";
import {
    creaturePortraitBackgroundOpacity,
    creaturePortraitBackgroundShadeAlpha,
    resolveCreaturePortraitBackground,
} from "./creaturePortraitBackground";
import { hocColors, hocDisplayFontFamily } from "./hocTheme";
import {
    DEFAULT_PORTRAIT_FRAMING,
    PICK_PORTRAIT_FRAMING,
    PORTRAIT_FRAMING_CHECKPOINT_X,
    PORTRAIT_OFFSET_X_MAX,
    PORTRAIT_OFFSET_X_MIN,
    PORTRAIT_OFFSET_Y_MAX,
    PORTRAIT_OFFSET_Y_MIN,
    PORTRAIT_SCALE_MAX,
    PORTRAIT_SCALE_MIN,
    normalizePortraitFraming,
    portraitFramingEquals,
    readStoredPortraitFraming,
    type PortraitBackground,
    type PortraitFit,
    type PortraitFraming,
    type PortraitSource,
    writeStoredPortraitFraming,
} from "./portraitFraming";
import { fullBodyCreatureImage, UNIT_ID_TO_IMAGE, UNIT_ID_TO_NAME } from "./unit_ui_constants";

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
    portraitImage?: string;
    fullBodyImage?: string;
}

type EditorBackgroundMode = "faction" | "black";

const EDITOR_CREATURES: EditorCreature[] = [1, 2, 3, 4].flatMap((level) =>
    [...getCreaturesByLevel(level)]
        .map((id) => {
            const name = UNIT_ID_TO_NAME[id] ?? `Creature ${id}`;
            return {
                id,
                level,
                name,
                faction: creatureFactionByName.get(name) ?? "",
                portraitImage: UNIT_ID_TO_IMAGE[id],
                fullBodyImage: fullBodyCreatureImage(id),
            };
        })
        .filter((creature) => creature.faction !== "Death")
        .sort((left, right) => FACTION_ORDER.indexOf(left.faction) - FACTION_ORDER.indexOf(right.faction)),
);

const committedFraming = (creatureId: number): PortraitFraming =>
    normalizePortraitFraming(PICK_PORTRAIT_FRAMING[creatureId]);

const PortraitArtwork: React.FC<{
    creature: EditorCreature;
    framing: PortraitFraming;
    backgroundMode?: EditorBackgroundMode;
    compact?: boolean;
    selected?: boolean;
}> = ({ creature, framing, backgroundMode = "faction", compact = false, selected = false }) => {
    const image =
        framing.source === "full" ? (creature.fullBodyImage ?? creature.portraitImage) : creature.portraitImage;
    const factionBackground = resolveCreaturePortraitBackground(creature.id);
    const factionBackgroundOpacity = creaturePortraitBackgroundOpacity(creature.id);
    const factionBackgroundShadeAlpha = creaturePortraitBackgroundShadeAlpha(creature.id);

    return (
        <Box
            sx={{
                position: "relative",
                width: "100%",
                aspectRatio: "190 / 256",
                overflow: "hidden",
                borderRadius: compact ? "8px" : "12px",
                border: selected ? "2px solid #54c778" : "2px solid rgba(255,255,255,.18)",
                bgcolor: "#090806",
                boxShadow: selected ? "0 0 16px rgba(84,199,120,.38)" : "0 4px 14px rgba(0,0,0,.5)",
            }}
        >
            {backgroundMode === "faction" && factionBackground && (
                <Box
                    component="img"
                    src={factionBackground}
                    aria-hidden
                    alt=""
                    sx={{
                        position: "absolute",
                        inset: 0,
                        zIndex: 0,
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        opacity: factionBackgroundOpacity,
                    }}
                />
            )}
            {backgroundMode === "faction" && factionBackground && (
                <Box
                    aria-hidden
                    data-editor-portrait-background-shade={creature.id}
                    sx={{
                        position: "absolute",
                        inset: 0,
                        zIndex: 1,
                        bgcolor: `rgba(0,0,0,${factionBackgroundShadeAlpha})`,
                        pointerEvents: "none",
                    }}
                />
            )}
            {backgroundMode === "faction" && image && framing.background === "soft" && (
                <Box
                    component="img"
                    src={image}
                    aria-hidden
                    alt=""
                    sx={{
                        position: "absolute",
                        inset: 0,
                        zIndex: 2,
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        transform: "scale(1.2)",
                        filter: "blur(14px) brightness(.42) saturate(.78)",
                    }}
                />
            )}
            {image && (
                <Box
                    component="img"
                    src={image}
                    alt={creature.name}
                    sx={{
                        position: "relative",
                        zIndex: 3,
                        display: "block",
                        width: "100%",
                        height: "100%",
                        objectFit: framing.fit,
                        objectPosition: "center",
                        transform: `translate(${framing.offsetX}%, ${framing.offsetY}%) scale(${framing.scale})`,
                        transformOrigin: "center",
                    }}
                />
            )}
        </Box>
    );
};

const ValueSlider: React.FC<{
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    suffix?: string;
    onChange: (value: number) => void;
}> = ({ label, value, min, max, step, suffix = "", onChange }) => (
    <Box sx={{ display: "grid", gridTemplateColumns: "76px 1fr 88px", gap: 1.25, alignItems: "center" }}>
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
            sx={{
                minWidth: 0,
                "& input": { px: 0.75, textAlign: "center" },
                bgcolor: "rgba(0,0,0,.34)",
                color: hocColors.parchment,
                borderColor: hocColors.orangeBorder,
            }}
            endDecorator={suffix || undefined}
        />
    </Box>
);

const formatTypeScriptConfig = (overrides: Record<number, PortraitFraming>): string => {
    const rows = Object.entries(overrides)
        .map(([creatureId, framing]) => [Number(creatureId), normalizePortraitFraming(framing)] as const)
        .sort(([left], [right]) => left - right)
        .map(([creatureId, framing]) => {
            const enumName = enumNames[creatureId] ?? String(creatureId);
            return `    [CreatureVals.${enumName}]: ${JSON.stringify(framing)},`;
        });
    return `export const PICK_PORTRAIT_FRAMING: Partial<Record<number, PortraitFraming>> = {\n${rows.join("\n")}\n};`;
};

export const PortraitFramingEditor: React.FC = () => {
    const [selectedCreatureId, setSelectedCreatureId] = useState(EDITOR_CREATURES[0]?.id ?? 0);
    const [overrides, setOverrides] = useState<Record<number, PortraitFraming>>(() => readStoredPortraitFraming());
    const [levelFilter, setLevelFilter] = useState<number | "all">("all");
    const [backgroundMode, setBackgroundMode] = useState<EditorBackgroundMode>("faction");
    const [search, setSearch] = useState("");
    const [status, setStatus] = useState("Настройки сохраняются автоматически");

    const selectedCreature = EDITOR_CREATURES.find((creature) => creature.id === selectedCreatureId);
    const baseline = selectedCreature ? committedFraming(selectedCreature.id) : DEFAULT_PORTRAIT_FRAMING;
    const framing = selectedCreature ? (overrides[selectedCreature.id] ?? baseline) : DEFAULT_PORTRAIT_FRAMING;

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
        return <Typography sx={{ p: 4 }}>Portrait framing editor is available only in development builds.</Typography>;
    }

    if (!selectedCreature) return null;

    const persist = (next: Record<number, PortraitFraming>, message = "Сохранено локально") => {
        setOverrides(next);
        writeStoredPortraitFraming(next);
        setStatus(message);
    };

    const updateFraming = (patch: Partial<PortraitFraming>) => {
        persist({
            ...overrides,
            [selectedCreature.id]: normalizePortraitFraming({ ...framing, ...patch }, baseline),
        });
    };

    const selectSource = (source: PortraitSource) => {
        if (source === "full") {
            updateFraming({ source, fit: "contain", scale: 1, offsetX: 0, offsetY: 0 });
            return;
        }
        updateFraming({ source });
    };

    const resetCurrent = () => {
        const next = { ...overrides };
        delete next[selectedCreature.id];
        persist(next, `${selectedCreature.name}: восстановлена базовая настройка`);
    };

    const resetAll = () => {
        if (!window.confirm("Сбросить все локальные настройки портретов?")) return;
        persist({}, "Все локальные настройки сброшены");
    };

    const restoreCheckpointX = () => {
        if (!window.confirm("Восстановить сохранённую точку X для всех портретов?")) return;
        const checkpoint = Object.fromEntries(
            Object.entries(PORTRAIT_FRAMING_CHECKPOINT_X).map(([creatureId, value]) => [
                Number(creatureId),
                normalizePortraitFraming(value),
            ]),
        );
        persist(checkpoint, "Точка X восстановлена для всех портретов");
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
                backgroundImage: `linear-gradient(rgba(4,3,2,.72), rgba(4,3,2,.88)), url(${images.pick_phase_ember_background_v2})`,
                backgroundSize: "cover",
                backgroundAttachment: "fixed",
            }}
        >
            <Box sx={{ maxWidth: 1600, mx: "auto" }}>
                <Box sx={{ mb: 2, display: "flex", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
                    <Box>
                        <Typography
                            level="h2"
                            sx={{ fontFamily: hocDisplayFontFamily, color: "#e0c999", letterSpacing: ".08em" }}
                        >
                            PORTRAIT FRAMING EDITOR
                        </Typography>
                        <Typography level="body-sm" sx={{ color: hocColors.muted }}>
                            190 × 256 · {EDITOR_CREATURES.length} существ · настроено {savedCount}
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
                        <Button variant="outlined" color="neutral" onClick={restoreCheckpointX}>
                            Restore X
                        </Button>
                        <Button variant="outlined" color="danger" onClick={resetAll} disabled={!savedCount}>
                            Reset all
                        </Button>
                    </Box>
                </Box>

                <Box
                    sx={{
                        display: "grid",
                        gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1fr) 440px" },
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
                            <Typography level="body-sm" sx={{ ml: 1, alignSelf: "center", color: hocColors.muted }}>
                                Фоны:
                            </Typography>
                            <Button
                                size="sm"
                                variant={backgroundMode === "faction" ? "solid" : "outlined"}
                                color={backgroundMode === "faction" ? "warning" : "neutral"}
                                onClick={() => setBackgroundMode("faction")}
                            >
                                Расовые
                            </Button>
                            <Button
                                size="sm"
                                variant={backgroundMode === "black" ? "solid" : "outlined"}
                                color={backgroundMode === "black" ? "warning" : "neutral"}
                                onClick={() => setBackgroundMode("black")}
                            >
                                Чёрные
                            </Button>
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
                                const creatureFraming = overrides[creature.id] ?? committedFraming(creature.id);
                                const customized = !portraitFramingEquals(
                                    creatureFraming,
                                    committedFraming(creature.id),
                                );
                                return (
                                    <Box
                                        component="button"
                                        type="button"
                                        key={creature.id}
                                        onClick={() => setSelectedCreatureId(creature.id)}
                                        sx={{
                                            position: "relative",
                                            minWidth: 0,
                                            p: 0,
                                            border: 0,
                                            bgcolor: "transparent",
                                            color: "inherit",
                                            cursor: "pointer",
                                        }}
                                    >
                                        <PortraitArtwork
                                            creature={creature}
                                            framing={creatureFraming}
                                            backgroundMode={backgroundMode}
                                            compact
                                            selected={selectedCreatureId === creature.id}
                                        />
                                        {customized && (
                                            <Box
                                                title="Есть локальная настройка"
                                                sx={{
                                                    position: "absolute",
                                                    top: 6,
                                                    right: 6,
                                                    width: 9,
                                                    height: 9,
                                                    borderRadius: "50%",
                                                    bgcolor: "#54c778",
                                                    boxShadow: "0 0 7px rgba(84,199,120,.8)",
                                                }}
                                            />
                                        )}
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
                            position: { lg: "sticky" },
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

                        <Box sx={{ mt: 1.5, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
                            <Box>
                                <Typography level="body-xs" sx={{ mb: 0.5, color: hocColors.muted }}>
                                    Базовый
                                </Typography>
                                <PortraitArtwork
                                    creature={selectedCreature}
                                    framing={baseline}
                                    backgroundMode={backgroundMode}
                                />
                            </Box>
                            <Box>
                                <Typography level="body-xs" sx={{ mb: 0.5, color: "#77d492" }}>
                                    Настроенный
                                </Typography>
                                <PortraitArtwork
                                    creature={selectedCreature}
                                    framing={framing}
                                    backgroundMode={backgroundMode}
                                    selected
                                />
                            </Box>
                        </Box>

                        <Box sx={{ mt: 2, display: "grid", gap: 1.5 }}>
                            <Box
                                sx={{
                                    display: "grid",
                                    gridTemplateColumns: "88px 1fr",
                                    gap: 1.25,
                                    alignItems: "center",
                                }}
                            >
                                <Typography level="body-sm" sx={{ color: hocColors.mutedStrong }}>
                                    Исходник
                                </Typography>
                                <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0.75 }}>
                                    {(["portrait", "full"] as PortraitSource[]).map((source) => (
                                        <Button
                                            key={source}
                                            size="sm"
                                            variant={framing.source === source ? "solid" : "outlined"}
                                            color={framing.source === source ? "warning" : "neutral"}
                                            disabled={source === "full" && !selectedCreature.fullBodyImage}
                                            onClick={() => selectSource(source)}
                                        >
                                            {source === "portrait" ? "Портрет" : "В полный рост"}
                                        </Button>
                                    ))}
                                </Box>
                            </Box>
                            <Typography level="body-xs" sx={{ mt: -0.75, ml: "100px", color: hocColors.muted }}>
                                «В полный рост» включает необрезанный исходник и сразу показывает его целиком.
                            </Typography>
                            <Box
                                sx={{
                                    display: "grid",
                                    gridTemplateColumns: "88px 1fr",
                                    gap: 1.25,
                                    alignItems: "center",
                                }}
                            >
                                <Typography level="body-sm" sx={{ color: hocColors.mutedStrong }}>
                                    Fit
                                </Typography>
                                <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0.75 }}>
                                    {(["cover", "contain"] as PortraitFit[]).map((fit) => (
                                        <Button
                                            key={fit}
                                            size="sm"
                                            variant={framing.fit === fit ? "solid" : "outlined"}
                                            color={framing.fit === fit ? "warning" : "neutral"}
                                            onClick={() => updateFraming({ fit })}
                                        >
                                            {fit}
                                        </Button>
                                    ))}
                                </Box>
                            </Box>
                            <Box
                                sx={{
                                    display: "grid",
                                    gridTemplateColumns: "88px 1fr",
                                    gap: 1.25,
                                    alignItems: "center",
                                }}
                            >
                                <Typography level="body-sm" sx={{ color: hocColors.mutedStrong }}>
                                    Фон
                                </Typography>
                                <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0.75 }}>
                                    {(["none", "soft"] as PortraitBackground[]).map((background) => (
                                        <Button
                                            key={background}
                                            size="sm"
                                            variant={framing.background === background ? "solid" : "outlined"}
                                            color={framing.background === background ? "warning" : "neutral"}
                                            onClick={() => updateFraming({ background })}
                                        >
                                            {background}
                                        </Button>
                                    ))}
                                </Box>
                            </Box>
                            <ValueSlider
                                label="Zoom"
                                value={framing.scale}
                                min={PORTRAIT_SCALE_MIN}
                                max={PORTRAIT_SCALE_MAX}
                                step={0.01}
                                onChange={(scale) => updateFraming({ scale })}
                            />
                            <ValueSlider
                                label="X"
                                value={framing.offsetX}
                                min={PORTRAIT_OFFSET_X_MIN}
                                max={PORTRAIT_OFFSET_X_MAX}
                                step={1}
                                suffix="%"
                                onChange={(offsetX) => updateFraming({ offsetX })}
                            />
                            <ValueSlider
                                label="Y"
                                value={framing.offsetY}
                                min={PORTRAIT_OFFSET_Y_MIN}
                                max={PORTRAIT_OFFSET_Y_MAX}
                                step={1}
                                suffix="%"
                                onChange={(offsetY) => updateFraming({ offsetY })}
                            />
                        </Box>

                        <Box
                            sx={{
                                mt: 2,
                                display: "flex",
                                gap: 1,
                                justifyContent: "space-between",
                                alignItems: "center",
                            }}
                        >
                            <Typography level="body-xs" sx={{ color: hocColors.muted }}>
                                {status}
                            </Typography>
                            <Button
                                size="sm"
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
