import { Artifact } from "@heroesofcrypto/common";
import ExpandMoreRounded from "@mui/icons-material/ExpandMoreRounded";
import RestartAltRounded from "@mui/icons-material/RestartAltRounded";
import { Box, IconButton, Typography } from "@mui/joy";
import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { PremiumAdvice } from "../../api/premium_client";
import { images } from "../../generated/image_imports";
import { t, tf, useTranslation } from "../../i18n/i18n";
import { CreaturePortraitImage } from "../CreaturePortraitImage";
import { SYNERGY_KEY_TO_IMAGE } from "../LeftSideBar/SynergiesConstants";
import { synergyEffectAtLevel } from "../LeftSideBar/synergyLadder";
import { getMapDisplay } from "../PickAndBan/mapDisplay";
import { DoctrineIcon } from "../DoctrineIcon";
import { PremiumIcon } from "../PremiumIcon";
import { DraftBuildStrip } from "./DraftBuildStrip";
import { PremiumDraftRoutes } from "./PremiumDraftRoutes";
import { premiumDraftAssessment, type PremiumDraftState } from "./premiumDraftAssessment";
import {
    clampDraftPanel,
    projectPremiumDraft,
    type DraftPanelRect,
    type DraftProjectedStack,
} from "./premiumDraftProjection";

// v2: the board now fills the window's width, so a window sized for the old capped board starts over once.
const storageKey = "hoc-premium-draft-panel-v2";
// The board is square and fills the window's width. By default the window is made tall enough to show all of it
// with its title, build row, side labels and overlay toggle; on a short screen it narrows to keep that true.
// Chrome around the board, measured: header 41, padding 11, title 25, build row 34, side labels 21, then the
// overlay toggle 26, its legend 16 and padding 11 below it, plus a few px of slack.
const PLANNER_BOARD_CHROME = 192;
// Horizontal room the board does not get: 11px padding each side, a thin scrollbar and the window border.
const PLANNER_BOARD_GUTTER = 36;
const PLANNER_DEFAULT_WIDTH = 640;
const PLANNER_MIN_WIDTH = 300;
/** Default window size: the widest board up to 640px whose whole square fits the viewport's height. */
export const defaultDraftPlannerSize = (viewport: { width: number; height: number }) => {
    const height = Math.max(140, viewport.height - 24);
    const width = Math.max(
        PLANNER_MIN_WIDTH,
        Math.min(PLANNER_DEFAULT_WIDTH, viewport.width - 24, height - PLANNER_BOARD_CHROME + PLANNER_BOARD_GUTTER),
    );
    return { width, height: Math.min(height, width - PLANNER_BOARD_GUTTER + PLANNER_BOARD_CHROME) };
};
const muted = "#bfa78f",
    ink = "#f3dec4",
    accent = "#ffb477";
type Projection = ReturnType<typeof projectPremiumDraft>;

const zoneCell = (cell: { x: number; y: number }) => ({ x: cell.x * 10, y: (15 - cell.y) * 10 });

export const DraftPlannerBoard: React.FC<{
    plan: Projection;
    showPlan: boolean;
    selected?: string;
    onSelect?: (key: string) => void;
}> = ({ plan, showPlan, selected, onSelect }) => {
    const { t } = useTranslation();
    const marker = useId().replaceAll(":", "");
    // Cells a Placement upgrade adds to the base zone: hatched while only planned, solid once chosen.
    const baseZone = new Set((plan.zones?.ownBase ?? []).map((cell) => `${cell.x}:${cell.y}`));
    const ownZone = plan.zones?.own ?? [];
    const addedZone = ownZone.filter((cell) => !baseZone.has(`${cell.x}:${cell.y}`));
    const plannedZone = plan.upgradeSource === "planned";
    const token = (unit: DraftProjectedStack, enemy: boolean) => {
        // A split creature has several stacks on the board, so the stack id (not the creature) is the key.
        const key = `${enemy ? "enemy" : "own"}:${unit.id}`;
        // A 1x2 body shows its square portrait once per square cell instead of one stretched frame.
        const side = Math.max(1, Math.min(unit.width, unit.height));
        const tiles = {
            columns: Math.max(1, Math.round(unit.width / side)),
            rows: Math.max(1, Math.round(unit.height / side)),
        };
        return (
            <Box
                component="button"
                type="button"
                key={key}
                onClick={() => onSelect?.(key)}
                aria-label={tf(
                    enemy
                        ? "Enemy {unit}, {role}, projected {count} creatures"
                        : "Your {unit}, {role}, projected {count} creatures",
                    { unit: t(unit.name), role: t(unit.role), count: unit.amount },
                )}
                aria-pressed={selected === key}
                title={`${t(unit.name)} · ${t(unit.role)} · ${tf("{count} creatures", { count: unit.amount })} (${
                    plan.setup ? t("selected setup") : t("before setup augments")
                })`}
                sx={{
                    position: "absolute",
                    left: `${(unit.position.x - unit.width + 1) * 6.25}%`,
                    top: `${(15 - unit.position.y) * 6.25}%`,
                    width: `${unit.width * 6.25}%`,
                    height: `${unit.height * 6.25}%`,
                    p: 0,
                    zIndex: 2,
                    cursor: "pointer",
                    bgcolor: "#201a12",
                    borderRadius: "3px",
                    border: `1px ${enemy ? "dashed" : "solid"} ${selected === key ? "#ffcf7d" : enemy ? "#a77768" : "#9dba89"}`,
                    boxShadow: selected === key ? "0 0 0 2px #ffcf7d88" : "0 1px 3px #0009",
                    "&:focus-visible": { outline: "2px solid #ffcf7d", outlineOffset: 2 },
                    "&:hover": { zIndex: 4, filter: "brightness(1.15)" },
                }}
            >
                <Box
                    data-portrait-tiles={tiles.columns * tiles.rows}
                    sx={{
                        isolation: "isolate",
                        display: "grid",
                        gridTemplateColumns: `repeat(${tiles.columns}, minmax(0, 1fr))`,
                        gridTemplateRows: `repeat(${tiles.rows}, minmax(0, 1fr))`,
                        gap: "1px",
                        width: "100%",
                        height: "100%",
                    }}
                >
                    {Array.from({ length: tiles.columns * tiles.rows }, (_, i) => (
                        <CreaturePortraitImage
                            key={i}
                            creatureId={unit.creature}
                            alt=""
                            sx={{ width: "100%", height: "100%", minWidth: 0, borderRadius: "2px", overflow: "hidden" }}
                        />
                    ))}
                </Box>
                <Box
                    component="b"
                    data-stack-count
                    aria-hidden="true"
                    sx={{
                        position: "absolute",
                        zIndex: 1,
                        bottom: 1,
                        right: 1,
                        minWidth: "1.3em",
                        px: "0.25em",
                        border: "1px solid #18110b",
                        borderRadius: "3px",
                        boxShadow: "0 1px 3px #000b",
                        color: "#21140c",
                        bgcolor: enemy ? "#f0b5a0" : "#f1d397",
                        fontFamily: "system-ui, sans-serif",
                        fontSize: 12,
                        fontWeight: 800,
                        fontVariantNumeric: "tabular-nums",
                        lineHeight: 1.15,
                        textAlign: "center",
                    }}
                >
                    {unit.amount}
                </Box>
            </Box>
        );
    };
    return (
        <Box sx={{ width: "100%" }}>
            <Box
                data-board-sides
                sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 1,
                    mb: 0.6,
                    px: 0.25,
                    fontSize: 11,
                    fontWeight: 600,
                }}
            >
                <Box component="span" data-board-side="own" sx={{ color: "#b3cf9f" }}>
                    <span aria-hidden="true">← </span>
                    {t("Your side")}
                    {plan.placementLevel > 0 && (
                        <Box
                            component="span"
                            data-board-zone-upgrade={plannedZone ? "planned" : "selected"}
                            sx={{ ml: 0.8, fontWeight: 500, color: plannedZone ? "#cfe3a6" : "#b3cf9f" }}
                        >
                            ·{" "}
                            {tf(plannedZone ? "planned Placement {level}" : "Placement {level}", {
                                level: plan.placementLevel,
                            })}
                        </Box>
                    )}
                </Box>
                <Box component="span" data-board-side="enemy" sx={{ color: "#e0a18f", textAlign: "right" }}>
                    {t("Enemy side")}
                    <span aria-hidden="true"> →</span>
                </Box>
            </Box>
            <Box
                role="group"
                aria-label={t("Live draft projected battlefield. Your side: left. Enemy side: right.")}
                sx={{
                    position: "relative",
                    aspectRatio: "1",
                    width: "100%",
                    bgcolor: "#1e2119",
                    border: "1px solid #63523a",
                    borderRadius: "4px",
                    isolation: "isolate",
                }}
            >
                <svg
                    viewBox="0 0 160 160"
                    width="100%"
                    height="100%"
                    aria-hidden="true"
                    style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
                >
                    <defs>
                        <marker
                            id={`${marker}-advance`}
                            viewBox="0 0 10 10"
                            refX="8"
                            refY="5"
                            markerWidth="4"
                            markerHeight="4"
                            orient="auto-start-reverse"
                        >
                            <path d="M 0 1 L 9 5 L 0 9" fill="none" stroke="#bcd47d" strokeWidth="2" />
                        </marker>
                        <pattern
                            id={`${marker}-planned-zone`}
                            width="2.4"
                            height="2.4"
                            patternUnits="userSpaceOnUse"
                            patternTransform="rotate(45)"
                        >
                            <rect width="2.4" height="2.4" fill="#9fd38a" opacity=".1" />
                            <line x1="0" y1="0" x2="0" y2="2.4" stroke="#b9e59f" strokeWidth=".7" opacity=".35" />
                        </pattern>
                        <marker
                            id={`${marker}-support`}
                            viewBox="0 0 10 10"
                            refX="8"
                            refY="5"
                            markerWidth="4"
                            markerHeight="4"
                            orient="auto-start-reverse"
                        >
                            <path d="M 0 1 L 9 5 L 0 9" fill="none" stroke="#88cbe0" strokeWidth="2" />
                        </marker>
                    </defs>
                    {(plan.zones?.ownBase ?? []).map((cell) => (
                        <rect
                            key={`own:${cell.x}:${cell.y}`}
                            {...zoneCell(cell)}
                            width="10"
                            height="10"
                            fill="#77a66c"
                            opacity=".14"
                        />
                    ))}
                    {addedZone.map((cell) => (
                        <rect
                            key={`added:${cell.x}:${cell.y}`}
                            data-zone-cell={plannedZone ? "planned" : "selected"}
                            {...zoneCell(cell)}
                            width="10"
                            height="10"
                            fill={plannedZone ? `url(#${marker}-planned-zone)` : "#77a66c"}
                            opacity={plannedZone ? 1 : 0.14}
                        />
                    ))}
                    {(plan.zones?.enemy ?? []).map((cell) => (
                        <rect
                            key={`enemy:${cell.x}:${cell.y}`}
                            {...zoneCell(cell)}
                            width="10"
                            height="10"
                            fill="#b66f5b"
                            opacity=".12"
                        />
                    ))}
                    {Array.from({ length: 17 }, (_, i) => (
                        <path
                            key={i}
                            d={`M ${i * 10} 0 V 160 M 0 ${i * 10} H 160`}
                            stroke="#aa9d7840"
                            strokeWidth=".3"
                        />
                    ))}
                    {plan.map === 3 && (
                        <rect x="60" y="60" width="40" height="40" fill="#e16c2766" stroke="#eea35466" />
                    )}
                    {plan.map === 4 &&
                        [5, 6, 9, 10].flatMap((x) =>
                            [7, 8].map((y) => (
                                <rect
                                    key={`${x}:${y}`}
                                    x={x * 10}
                                    y={(15 - y) * 10}
                                    width="10"
                                    height="10"
                                    fill="#918676aa"
                                />
                            )),
                        )}
                    {showPlan &&
                        plan.arrows.map((arrow) => (
                            <path
                                key={`${arrow.kind}:${arrow.creature}`}
                                d={`M ${arrow.from.x * 10} ${(16 - arrow.from.y) * 10} L ${arrow.to.x * 10} ${(16 - arrow.to.y) * 10}`}
                                fill="none"
                                stroke={arrow.kind === "support" ? "#88cbe0" : "#bcd47d"}
                                strokeWidth=".9"
                                strokeDasharray={arrow.kind === "support" ? "1.5 1.2" : "3 1.8"}
                                opacity=".85"
                                markerEnd={`url(#${marker}-${arrow.kind})`}
                            />
                        ))}
                    {Array.from({ length: 16 }, (_, i) => (
                        <React.Fragment key={i}>
                            <text x={i * 10 + 5} y="3.5" textAnchor="middle" fill="#b8b092" fontSize="2.7">
                                {String.fromCharCode(65 + i)}
                            </text>
                            <text x="1" y={i * 10 + 6} fill="#b8b092" fontSize="2.7">
                                {16 - i}
                            </text>
                        </React.Fragment>
                    ))}
                </svg>
                {plan.own.map((unit) => token(unit, false))}
                {plan.enemy.map((unit) => token(unit, true))}
                {!plan.own.length && (
                    <Box
                        sx={{ position: "absolute", inset: "35% 15%", textAlign: "center", color: muted, fontSize: 12 }}
                    >
                        {plan.formationUnavailable
                            ? "AI formation is unavailable for this army. Your picks are unchanged."
                            : "Your projected army appears as you pick."}
                    </Box>
                )}
            </Box>
        </Box>
    );
};

export const PremiumDraftPlanner: React.FC<{
    advice: PremiumAdvice;
    draft: PremiumDraftState;
    impression?: React.Ref<HTMLDivElement>;
    children?: React.ReactNode;
    portalContainer?: HTMLElement | null;
}> = ({ advice, draft, impression, children, portalContainer }) => {
    // Pick timers rerender the shell every second. Re-plan only when the public draft changes.
    const sourceKey = JSON.stringify({ ...draft, scouting: advice.scouting ?? draft.scouting });
    const source = useMemo(() => JSON.parse(sourceKey) as PremiumDraftState, [sourceKey]);
    // Premium's upgrade plan for this army: the board is drawn as it would leave it until the player spends a point.
    const plannedKey = JSON.stringify(advice.augments ?? []);
    const plannedUpgrades = useMemo(
        () => JSON.parse(plannedKey) as NonNullable<PremiumAdvice["augments"]>,
        [plannedKey],
    );
    // While this player chooses a Tier-2 artifact, Premium's first choice is shown on the build row as projected.
    const projectedTier2 = advice.choices?.find((choice) => choice.kind === "artifact")?.value;
    const [showPlan, setShowPlan] = useState(true),
        [collapsed, setCollapsed] = useState(false);
    const [selected, setSelected] = useState<string>();
    const [rect, setRect] = useState<DraftPanelRect>();
    const panel = useRef<HTMLDivElement>(null);
    const gesture = useRef<
        { pointer: number; x: number; y: number; rect: DraftPanelRect; resize: boolean } | undefined
    >(undefined);
    const plan = useMemo(() => projectPremiumDraft(source, plannedUpgrades), [source, plannedUpgrades]);
    const assessment = useMemo(() => premiumDraftAssessment(source), [source]);
    // Picks out of six count creatures; a split adds a stack, never a pick.
    const ownCreatures = new Set(plan.own.map((unit) => unit.creature)).size;
    const selectedUnit = [
        ...plan.own.map((u) => ({ ...u, key: `own:${u.id}` })),
        ...plan.enemy.map((u) => ({ ...u, key: `enemy:${u.id}` })),
    ].find((unit) => unit.key === selected);
    const fit = (next: DraftPanelRect, compact = collapsed) => {
        const fitted = clampDraftPanel(next, { width: window.innerWidth, height: window.innerHeight });
        // A collapsed handle can sit at the bottom edge; expanding clamps the complete window again.
        return compact ? { ...fitted, y: Math.max(12, Math.min(next.y, window.innerHeight - 54)) } : fitted;
    };
    const remember = (next: DraftPanelRect) => {
        try {
            sessionStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
            /* Moving works when storage is disabled. */
        }
    };
    const geometry = (): DraftPanelRect => {
        const b = panel.current!.getBoundingClientRect();
        return { x: b.x, y: b.y, width: b.width, height: collapsed ? (rect?.height ?? defaultSize.height) : b.height };
    };
    useEffect(() => {
        try {
            const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? "null") as DraftPanelRect | null;
            if (saved && [saved.x, saved.y, saved.width, saved.height].every(Number.isFinite)) setRect(fit(saved));
        } catch {
            /* Use the left-centre default. */
        }
        // Geometry is restored once. Draft updates never reset a user's window position.
        // eslint-disable-next-line react-hooks/exhaustive-deps -- restore once on mount; fit is a render-scoped helper.
    }, []);
    useEffect(() => {
        const resize = () => {
            if (panel.current) setRect((current) => fit(current ?? geometry()));
        };
        window.addEventListener("resize", resize);
        return () => window.removeEventListener("resize", resize);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- fit/geometry read `collapsed`; rect only when still unset.
    }, [collapsed]);
    const start = (event: React.PointerEvent<HTMLElement>, resize = false) => {
        if (event.button !== 0 || (!resize && (event.target as HTMLElement).closest("button"))) return;
        event.preventDefault();
        event.stopPropagation();
        gesture.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, rect: geometry(), resize };
        event.currentTarget.setPointerCapture(event.pointerId);
    };
    const move = (event: React.PointerEvent) => {
        const g = gesture.current;
        if (!g || g.pointer !== event.pointerId) return;
        event.stopPropagation();
        const dx = event.clientX - g.x,
            dy = event.clientY - g.y;
        setRect(
            fit(
                g.resize
                    ? { ...g.rect, width: g.rect.width + dx, height: g.rect.height + dy }
                    : { ...g.rect, x: g.rect.x + dx, y: g.rect.y + dy },
            ),
        );
    };
    const stop = (event: React.PointerEvent) => {
        if (gesture.current?.pointer !== event.pointerId) return;
        gesture.current = undefined;
        if (panel.current) remember(fit(geometry()));
    };
    const moveByKey = (event: React.KeyboardEvent, resize = false) => {
        const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
        if (!delta) return;
        event.preventDefault();
        event.stopPropagation();
        const g = geometry(),
            dx = delta[0] * (event.shiftKey ? 40 : 10),
            dy = delta[1] * (event.shiftKey ? 40 : 10);
        const next = fit(
            resize ? { ...g, width: g.width + dx, height: g.height + dy } : { ...g, x: g.x + dx, y: g.y + dy },
        );
        setRect(next);
        remember(next);
    };
    const defaultSize = defaultDraftPlannerSize(
        typeof window === "undefined"
            ? { width: 1280, height: 900 }
            : { width: window.innerWidth, height: window.innerHeight },
    );
    const wide = (rect?.width ?? defaultSize.width) >= 560;
    const content = (
        <Box
            ref={panel}
            role="region"
            aria-label={t("Premium draft assessment")}
            data-premium-draft-planner
            onPointerMove={move}
            onPointerUp={stop}
            onPointerCancel={stop}
            onLostPointerCapture={stop}
            sx={{
                position: "fixed",
                zIndex: 1390,
                // Default: the left edge, centred vertically. A dragged or resized window keeps its own rect.
                left: rect ? rect.x : 18,
                top: rect ? rect.y : "50%",
                transform: rect ? undefined : "translateY(-50%)",
                width: rect?.width ?? defaultSize.width,
                height: collapsed ? 42 : (rect?.height ?? defaultSize.height),
                maxWidth: "calc(100vw - 24px)",
                maxHeight: "calc(100dvh - 24px)",
                boxSizing: "border-box",
                border: "1px solid #775135",
                borderRadius: "8px",
                bgcolor: "#1c160ff5",
                color: ink,
                boxShadow: "0 8px 28px #0008",
                display: "flex",
                flexDirection: "column",
                pointerEvents: "auto",
                overflow: "hidden",
                fontSize: 12,
                lineHeight: 1.45,
            }}
        >
            <Box
                onPointerDown={(e) => start(e)}
                onKeyDown={(e) => {
                    if (e.target === e.currentTarget) moveByKey(e);
                }}
                tabIndex={0}
                aria-label={t("Move draft planner with arrow keys or drag")}
                title={t("Drag to move · arrow keys also move the planner")}
                sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.7,
                    minHeight: 40,
                    px: 1,
                    cursor: "grab",
                    touchAction: "none",
                    userSelect: "none",
                    borderBottom: collapsed ? 0 : "1px solid #73503566",
                    "&:focus-visible": { outline: "2px solid #d2a371", outlineOffset: -2 },
                }}
            >
                <Box component="span" aria-hidden="true" sx={{ fontSize: 18, color: "#997b5a" }}>
                    ⠿
                </Box>
                <PremiumIcon size={16} />
                <Typography level="title-sm" sx={{ flex: 1, color: ink, fontSize: 13 }}>
                    {source.setup ? "Army planner" : "Draft planner"}{" "}
                    <Box component="span" sx={{ color: muted, fontSize: 11 }}>
                        · {ownCreatures}/6
                    </Box>
                </Typography>
                <IconButton
                    size="sm"
                    variant="plain"
                    aria-label={t("Reset draft planner position")}
                    title={t("Reset position")}
                    onClick={() => {
                        setRect(undefined);
                        try {
                            sessionStorage.removeItem(storageKey);
                        } catch {
                            /* optional */
                        }
                    }}
                    sx={{ color: muted, minHeight: 28, minWidth: 28 }}
                >
                    <RestartAltRounded sx={{ fontSize: 17 }} />
                </IconButton>
                <IconButton
                    size="sm"
                    variant="plain"
                    aria-label={collapsed ? "Expand draft planner" : "Collapse draft planner"}
                    aria-expanded={!collapsed}
                    onClick={() => {
                        setRect(fit(geometry(), !collapsed));
                        setCollapsed(!collapsed);
                    }}
                    sx={{ color: accent, minHeight: 28, minWidth: 28 }}
                >
                    {collapsed ? <ExpandMoreRounded sx={{ transform: "rotate(180deg)" }} /> : <ExpandMoreRounded />}
                </IconButton>
            </Box>
            <Box
                ref={impression}
                hidden={collapsed}
                sx={{
                    display: collapsed ? "none" : "block",
                    flex: 1,
                    minHeight: 0,
                    overflowY: "auto",
                    overscrollBehavior: "contain",
                    scrollbarWidth: "thin",
                    scrollbarColor: "#845c37 transparent",
                    p: 1.4,
                }}
            >
                <Box
                    sx={{
                        display: "grid",
                        // The board takes the full width; synergies and artifacts follow beneath it.
                        gridTemplateColumns: "minmax(0, 1fr)",
                        gap: 1.5,
                    }}
                >
                    <Box>
                        <Box
                            sx={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 1,
                                mb: 0.8,
                            }}
                        >
                            <Typography level="title-sm" sx={{ color: ink, fontSize: 12 }}>
                                {t("AI-recommended formation")}
                            </Typography>
                        </Box>
                        <DraftBuildStrip plan={plan} doctrine={source.doctrine} projectedTier2={projectedTier2} />
                        <DraftPlannerBoard plan={plan} showPlan={showPlan} selected={selected} onSelect={setSelected} />
                        <Box
                            sx={{
                                display: "flex",
                                justifyContent: "flex-end",
                                alignItems: "center",
                                color: muted,
                                fontSize: 10,
                                mt: 0.6,
                            }}
                        >
                            <Box
                                component="label"
                                sx={{ display: "flex", alignItems: "center", gap: 0.4, cursor: "pointer" }}
                            >
                                <input
                                    type="checkbox"
                                    checked={showPlan}
                                    onChange={(e) => setShowPlan(e.target.checked)}
                                />
                                {t("Strategy overlay")}
                            </Box>
                        </Box>
                        {showPlan && (
                            <Box sx={{ fontSize: 10, mt: 0.4 }}>
                                <span style={{ color: "#bcd47d" }}>{t("→ Advance / screen")}</span>
                                <span style={{ color: "#88cbe0", marginLeft: 12 }}>{t("⇢ Support")}</span>
                            </Box>
                        )}
                        <Box sx={{ fontSize: 10, color: muted, mt: 0.6 }}>
                            {plan.map !== undefined
                                ? tf("Map: {map}", { map: t(getMapDisplay(plan.map)?.name ?? "Normal") })
                                : t("Map not revealed")}{" "}
                            · {tf("{count}/6 enemy picks revealed", { count: plan.enemy.length })}
                        </Box>
                        <Box sx={{ fontSize: 10, color: "#9e907d", mt: 0.4 }}>
                            {t(
                                "AI placement updates with your army and revealed information. Final setup can change it. Enemy positions and arrows are illustrative.",
                            )}
                        </Box>
                        {selectedUnit && (
                            <Box
                                role="status"
                                sx={{ mt: 0.7, p: 0.7, borderLeft: "2px solid #bd8f52", bgcolor: "#c18d3410" }}
                            >
                                <strong>{t(selectedUnit.name)}</strong>
                                <div style={{ color: muted }}>
                                    {t(selectedUnit.role)} ·{" "}
                                    {tf("{count} projected creatures", { count: selectedUnit.amount })}
                                </div>
                            </Box>
                        )}
                    </Box>
                    <Box>
                        <Typography level="title-sm" sx={{ color: ink, fontSize: 12, mb: 0.6 }}>
                            {t("Match synergies")}
                        </Typography>
                        <Box sx={{ fontSize: 10, color: muted, mb: 0.8 }}>
                            {t("Shared match variants · enemy levels use revealed picks")}
                        </Box>
                        <Box
                            data-planner-synergies
                            sx={{
                                display: "grid",
                                gridTemplateColumns: wide ? "repeat(2, minmax(0, 1fr))" : "minmax(0, 1fr)",
                                columnGap: 2,
                            }}
                        >
                            {plan.synergies.map((item) => {
                                const effect =
                                    item.variant && item.level
                                        ? synergyEffectAtLevel(item.faction, item.variant, item.level, t)
                                        : t(item.effect);
                                const enemyEffect =
                                    item.variant && item.enemyLevel
                                        ? synergyEffectAtLevel(item.faction, item.variant, item.enemyLevel, t)
                                        : t(item.enemyEffect);
                                return (
                                    <Box
                                        key={item.faction}
                                        title={`${effect}. ${t("Enemy")}: ${enemyEffect}.`}
                                        sx={{
                                            display: "flex",
                                            gap: 0.7,
                                            alignItems: "center",
                                            py: 0.8,
                                            borderBottom: "1px solid #61482d55",
                                        }}
                                    >
                                        {item.variant && (
                                            <Box
                                                component="img"
                                                src={
                                                    (SYNERGY_KEY_TO_IMAGE as Record<string, string>)[
                                                        `${item.faction}:${item.variant}:1`
                                                    ]
                                                }
                                                alt=""
                                                sx={{ width: 30, height: 30, opacity: item.level ? 1 : 0.5 }}
                                            />
                                        )}
                                        <Box sx={{ flex: 1 }}>
                                            <Box sx={{ display: "flex", justifyContent: "space-between", gap: 0.5 }}>
                                                <strong>{t(item.faction)}</strong>
                                                <span style={{ fontSize: 10, color: muted }}>
                                                    {t("You")}: {item.level ? `L${item.level}` : "—"} · {t("Enemy")}:{" "}
                                                    {item.enemyLevel ? `≥L${item.enemyLevel}` : "—"}
                                                </span>
                                            </Box>
                                            <Box sx={{ color: item.level ? "#dec394" : muted, fontSize: 11 }}>
                                                {t(item.label)}
                                            </Box>
                                            {!!item.level && (
                                                <Box sx={{ color: muted, fontSize: 10, mt: 0.3 }}>{effect}</Box>
                                            )}
                                            <Box sx={{ display: "flex", gap: "3px", mt: 0.4 }}>
                                                {Array.from({ length: 6 }, (_, i) => (
                                                    <Box
                                                        key={i}
                                                        sx={{
                                                            height: 3,
                                                            flex: 1,
                                                            bgcolor: i < item.count ? "#bd995e" : "#4c3b2b",
                                                        }}
                                                    />
                                                ))}
                                            </Box>
                                            {item.next && item.count > 0 && ownCreatures < 6 && (
                                                <Box sx={{ color: accent, fontSize: 10, mt: 0.4 }}>
                                                    {tf("{count} more for L{level}", {
                                                        count: item.next.unitsAway,
                                                        level: item.next.level,
                                                    })}
                                                </Box>
                                            )}
                                        </Box>
                                    </Box>
                                );
                            })}
                        </Box>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.7, mt: 1.1, flexWrap: "wrap" }}>
                            {!!draft.doctrine && <DoctrineIcon doctrineId={draft.doctrine} size={30} />}
                            {plan.artifacts.map((item) => (
                                <Box
                                    key={item.tier}
                                    title={`${t(item.name)}: ${Artifact.formatArtifactDescription(item)}`}
                                    sx={{ display: "flex", gap: 0.5, alignItems: "center", flex: "1 1 100px" }}
                                >
                                    <Box
                                        component="img"
                                        src={(images as Record<string, string>)[item.imageKey]}
                                        alt=""
                                        sx={{ width: 28, height: 28 }}
                                    />
                                    <Box sx={{ fontSize: 11 }}>
                                        <span style={{ color: muted }}>T{item.tier} </span>
                                        {t(item.name)}
                                    </Box>
                                </Box>
                            ))}
                            {!plan.artifacts.length && (
                                <span style={{ color: muted, fontSize: 11 }}>{t("Artifacts appear when picked.")}</span>
                            )}
                        </Box>
                    </Box>
                </Box>
                <Box sx={{ mt: 1.4, pt: 1.1, borderTop: "1px solid #79543866" }}>
                    <Typography level="title-sm" sx={{ color: ink, fontSize: 13 }}>
                        {t("Battle plan")}{" "}
                        <Box component="span" sx={{ fontSize: 10, color: muted }}>
                            · {t("updates as you pick")}
                        </Box>
                    </Typography>
                    <Box sx={{ mt: 0.5, color: accent }}>{assessment.headline}</Box>
                    <Box sx={{ mt: 0.3, color: muted, fontSize: 11 }}>{assessment.focus}</Box>
                    {plan.steps.map((step) => (
                        <Box
                            component="button"
                            type="button"
                            key={step.title}
                            onClick={() => {
                                const unit =
                                    plan.own.find((u) => step.stackIds?.includes(u.id)) ??
                                    plan.own.find((u) => step.unitIds.includes(u.creature));
                                const enemy = plan.enemy.find((u) => step.unitIds.includes(u.creature));
                                setSelected(unit ? `own:${unit.id}` : enemy ? `enemy:${enemy.id}` : undefined);
                            }}
                            sx={{
                                display: "block",
                                width: "100%",
                                textAlign: "left",
                                border: 0,
                                borderLeft: "2px solid #88643f",
                                p: 0.7,
                                mt: 0.6,
                                bgcolor: "#50341b22",
                                color: ink,
                                fontSize: 11,
                                cursor: "pointer",
                                "&:hover": { bgcolor: "#76502833" },
                            }}
                        >
                            <strong>{step.title}</strong>
                            <div style={{ color: muted }}>{step.text}</div>
                        </Box>
                    ))}
                </Box>
                {children}
                <Box component="details" sx={{ mt: 1, fontSize: 11, color: muted }}>
                    <summary style={{ cursor: "pointer", color: accent }}>{t("Draft routes & details")}</summary>
                    <PremiumDraftRoutes
                        routes={assessment.routes}
                        remaining={assessment.remaining}
                        routeWarning={assessment.routeWarning}
                    />
                    {assessment.notes.map((note) => (
                        <Box key={note.label} sx={{ mt: 0.7 }}>
                            <strong>{note.label}:</strong> {note.text}
                        </Box>
                    ))}
                </Box>
            </Box>
            {!collapsed && (
                <Box
                    component="button"
                    type="button"
                    aria-label={t("Resize draft planner with arrow keys or drag")}
                    title={t("Drag to resize")}
                    onPointerDown={(e) => start(e, true)}
                    onKeyDown={(e) => moveByKey(e, true)}
                    sx={{
                        position: "absolute",
                        right: 1,
                        bottom: 1,
                        width: 16,
                        height: 16,
                        p: 0,
                        border: 0,
                        bgcolor: "transparent",
                        color: "#be9467",
                        cursor: "nwse-resize",
                        touchAction: "none",
                        fontSize: 14,
                        lineHeight: 1,
                    }}
                >
                    ◢
                </Box>
            )}
        </Box>
    );
    // Escape nested draft transforms; the movable window uses viewport coordinates throughout.
    return typeof document === "undefined" ? content : createPortal(content, portalContainer ?? document.body);
};
