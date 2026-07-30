import { TeamVals, UnitProperties, FactionType, FactionVals } from "@heroesofcrypto/common";
import DiceIcon from "@mui/icons-material/Casino";
import DashboardRoundedIcon from "@mui/icons-material/DashboardRounded";
import FactoryRoundedIcon from "@mui/icons-material/FactoryRounded";
import TerrainRoundedIcon from "@mui/icons-material/TerrainRounded";
import Box from "@mui/joy/Box";
import List from "@mui/joy/List";
import ListItem from "@mui/joy/ListItem";
import ListItemButton from "@mui/joy/ListItemButton";
import Sheet from "@mui/joy/Sheet";
import { useColorScheme } from "@mui/joy/styles";
import Typography from "@mui/joy/Typography";
import React, { useEffect, useState, useCallback, useMemo, useLayoutEffect } from "react";

import { MessageBox } from "./MessageBox";
import { usePixiManager } from "../../pixi/PixiGameManager";
// Near-black ground with a warm undertone, per the fight-sidebar handoff. No texture and no gold wash —
// the board art has to stay the brightest thing on screen.
export const SIDEBAR_BG = "#0b0806";
const sidebarOverlayImage = new URL("../../../images/sidebar_overlay.webp", import.meta.url).toString();
const greenOverlayImage = new URL("../../../images/overlay_green.webp", import.meta.url).toString();
const redOverlayImage = new URL("../../../images/overlay_red.webp", import.meta.url).toString();

// The team colour, swept diagonally off the bar's right edge — the placement this artwork was drawn for.
// Rotated about its top-left so the band runs corner to corner behind the panel's content, and wider than
// the bar so the rotation never exposes an edge. Fades rather than pops when the selection changes.
const teamOverlaySx = {
    position: "absolute",
    width: "350px",
    height: "100%",
    top: 0,
    right: -350,
    transform: "translateZ(0) rotate(65deg)",
    transformOrigin: "top left",
    zIndex: 0,
    pointerEvents: "none",
    transition: "opacity 220ms ease-out",
    willChange: "opacity",
} as const;

// The panel's carved-stone texture with the rebuild's subtle gradient layered ON TOP of it, rather than
// instead of it. The rebuild dropped the texture for the gradient alone, which left the left bar flat
// while the right bar (RightSideBar/index.tsx) still carried the same artwork -- the two stopped looking
// like the same panel.
export const SIDEBAR_BG_IMAGE = `linear-gradient(180deg, rgba(255,224,180,.02), rgba(0,0,0,.24)), url(${sidebarOverlayImage})`;
import { UnitStatsListItem } from "./UnitStatsListItem";
import { UpNext } from "./UpNext";
import { computeSidebarMetrics, SidebarMetricsContext } from "./sidebarMetrics";
import type { IVisibleImpact } from "../../scenes/VisibleState";
import { useFitScale } from "./useFitScale";
import { IWindowSize, IVisibleOverallImpact } from "../../scenes/VisibleState";

type SidebarSelectionState = {
    unit: UnitProperties;
    overallImpact: IVisibleOverallImpact;
    factionType: FactionType;
};

const emptyUnit = {} as UnitProperties;
const emptyImpact = {} as IVisibleOverallImpact;

// Floor for the unit card. Past this the sidebar as a whole starts scrolling rather than squeezing the
// card into nothing — the point where the screen is simply too short for the panel.
const MIN_CARD_HEIGHT = 140;

export default function LeftSideBar({ gameStarted, windowSize }: { gameStarted: boolean; windowSize: IWindowSize }) {
    const [barSize, setBarSize] = useState(280);
    // Height actually left for the unit card once the synergy strip, the turn panel and the up-next queue
    // have taken theirs. Measured rather than derived, because those blocks resize with the content.
    const [cardHeight, setCardHeight] = useState(0);

    const [buttonsVisible] = useState({
        prediction: false,
        terrain: false,
        factory: false,
        dashboard: false,
    });

    const [selection, setSelection] = useState<SidebarSelectionState>({
        unit: emptyUnit,
        overallImpact: emptyImpact,
        factionType: FactionVals.NO_FACTION as FactionType,
    });

    const { setMode } = useColorScheme();
    const manager = usePixiManager();

    const adjustBarSize = useCallback(() => {
        const additionalBoardPixels = 0;
        const widthRatio = windowSize.width / (2048 + additionalBoardPixels);
        const heightRatio = windowSize.height / 2048;
        const scaleRatio = Math.min(widthRatio, heightRatio);
        const scaledBoardSize = (2048 + additionalBoardPixels) * scaleRatio;
        const rightBarEndAtBoard = (windowSize.width - scaledBoardSize) / 2;
        const nextBarSize = Math.max(0, Math.round(rightBarEndAtBoard));
        setBarSize((currentBarSize) => (currentBarSize === nextBarSize ? currentBarSize : nextBarSize));
    }, [windowSize.width, windowSize.height]);

    useEffect(() => {
        adjustBarSize();
    }, [adjustBarSize]);

    // ✅ Subscribe to combined selection event
    useEffect(() => {
        const handleCombined = (payload: {
            unit: UnitProperties | null;
            impact: IVisibleOverallImpact | null;
            faction: FactionType;
        }) => {
            const unit = (payload.unit ?? emptyUnit) as UnitProperties;
            const impact = (payload.impact ?? emptyImpact) as IVisibleOverallImpact;
            const factionType = (payload.faction ?? (FactionVals.NO_FACTION as FactionType)) as FactionType;

            setSelection((previousSelection) => {
                if (
                    previousSelection.unit === unit &&
                    previousSelection.overallImpact === impact &&
                    previousSelection.factionType === factionType
                ) {
                    return previousSelection;
                }

                return {
                    unit,
                    overallImpact: impact,
                    factionType,
                };
            });
        };

        const conn = manager.onSelectionCombined.connect(handleCombined);
        return () => {
            conn.disconnect();
        };
    }, [manager]);

    useEffect(() => {
        setMode("dark");
    }, [setMode]);

    // Counted the same way the card renders them, so the layout decision matches what will be drawn.
    const contentLoad = useMemo(() => {
        const countLive = (impacts?: IVisibleImpact[]) => (impacts ?? []).filter((impact) => impact.laps > 0).length;
        return {
            abilities: countLive(selection.overallImpact.abilities),
            buffs: (selection.overallImpact.buffs ?? []).length,
            debuffs: (selection.overallImpact.debuffs ?? []).length,
        };
    }, [selection.overallImpact]);

    const metrics = useMemo(
        () => computeSidebarMetrics(barSize, cardHeight, contentLoad),
        [barSize, cardHeight, contentLoad],
    );

    const unitProperties = selection.unit || ({} as UnitProperties);

    // The card is the only elastic block: everything else is pinned, so it both reports its own height
    // (feeding the metrics above) and scales itself down if its content still cannot fit.
    const { setViewport, setContent, scale, scrollable, naturalHeight } = useFitScale();
    const [cardViewport, setCardViewport] = useState<HTMLElement | null>(null);
    const attachViewport = useCallback(
        (node: HTMLElement | null) => {
            setViewport(node);
            setCardViewport(node);
        },
        [setViewport],
    );

    useLayoutEffect(() => {
        if (!cardViewport) return;
        const report = () => setCardHeight(cardViewport.clientHeight);
        report();
        const observer = new ResizeObserver(report);
        observer.observe(cardViewport);
        return () => observer.disconnect();
    }, [cardViewport]);

    return (
        <SidebarMetricsContext.Provider value={metrics}>
            <Sheet
                className="Sidebar"
                sx={{
                    position: "fixed",
                    zIndex: 1,
                    height: "100dvh",
                    width: `${barSize}px`,
                    top: 0,
                    left: 0,
                    px: `${metrics.padPx}px`,
                    // Less dead air above the unit name; the height goes to the card.
                    pt: `${Math.round(metrics.padPx * 0.4)}px`,
                    pb: `${metrics.padPx}px`,
                    display: "flex",
                    flexDirection: "column",
                    gap: `${metrics.gapPx}px`,
                    // Board-facing edge from the handoff: a dark rule with a warm hairline, not a gold line.
                    borderRight: "3px solid #0a0705",
                    boxShadow: "inset -1px 0 0 rgba(120,104,80,.22), 6px 0 18px rgba(0,0,0,.7)",
                    // Everything below sizes itself to the bar, and the card scales down when its content
                    // cannot fit, so a scrollbar only ever appears on a screen too short for the pinned
                    // turn panel and queue alone.
                    overflowY: "auto",
                    overflowX: "hidden",
                    transition: "width 180ms ease-out",
                    willChange: "width",
                    backgroundColor: SIDEBAR_BG,
                    backgroundImage: SIDEBAR_BG_IMAGE,
                    backgroundSize: "auto, cover",
                    backgroundPosition: "center, center",
                    backgroundRepeat: "no-repeat, no-repeat",
                }}
            >
                {/* Neutral (teamless) creatures get NEITHER band: the old code gated red on `team !== 2`,
                    so a roster unit with no side was painted as an enemy. */}
                <Box
                    component="img"
                    src={greenOverlayImage}
                    alt=""
                    aria-hidden
                    sx={{ ...teamOverlaySx, opacity: unitProperties.team === TeamVals.LOWER ? 1 : 0 }}
                />
                <Box
                    component="img"
                    src={redOverlayImage}
                    alt=""
                    aria-hidden
                    sx={{ ...teamOverlaySx, opacity: unitProperties.team === TeamVals.UPPER ? 1 : 0 }}
                />
                {/* The team colour is no longer a cloth banner across the bar — it is a fire-like aura
                    behind the portrait (see UnitStatsListItem). Synergies likewise moved into the unit's
                    Buffs block, which already scopes them to the right side. */}
                <Box
                    ref={attachViewport}
                    sx={{
                        minHeight: `${MIN_CARD_HEIGHT}px`,
                        flex: "1 1 0",
                        position: "relative",
                        // Clipped rather than spilling: whatever the card cannot show must not paint over
                        // the turn panel pinned below it. On a screen too short even for the shrunk card
                        // this becomes the one scrollbar in the sidebar.
                        overflowY: scrollable ? "auto" : "hidden",
                        overflowX: "hidden",
                    }}
                >
                    <Box
                        ref={setContent}
                        className="SidebarCard"
                        sx={{
                            height: scrollable ? "auto" : "100%",
                            width: "100%",
                            transform: scale === 1 ? "none" : `scale(${scale})`,
                            transformOrigin: "top center",
                            transition: "transform 160ms ease-out",
                            // A CSS transform does not shrink the layout box, so a scrolling card would
                            // otherwise get scroll range for its full unscaled height and end in a long
                            // stretch of nothing. Pull the surplus back off the bottom.
                            marginBottom: scrollable ? `${-Math.round(naturalHeight * (1 - scale))}px` : 0,
                        }}
                    >
                        <List
                            size="sm"
                            sx={{
                                gap: `${metrics.gapPx}px`,
                                p: 0,
                                "--List-nestedInsetStart": "0px",
                                "--ListItem-radius": (t) => t.vars.radius.sm,
                                "--ListItem-paddingX": "0px",
                                "--ListItem-paddingY": "0px",
                            }}
                        >
                            {Object.values(buttonsVisible).some((visible) => visible) && (
                                <Box display="flex" width="100%">
                                    {buttonsVisible.prediction && (
                                        <ListItem sx={{ flexGrow: 1, flexBasis: 0, position: "relative" }}>
                                            <ListItemButton disabled>
                                                <DiceIcon />
                                            </ListItemButton>
                                        </ListItem>
                                    )}

                                    {buttonsVisible.terrain && (
                                        <ListItem sx={{ flexGrow: 1, flexBasis: 0 }}>
                                            <ListItemButton>
                                                <TerrainRoundedIcon />
                                            </ListItemButton>
                                        </ListItem>
                                    )}

                                    {buttonsVisible.factory && (
                                        <ListItem sx={{ flexGrow: 1, flexBasis: 0 }}>
                                            <ListItemButton>
                                                <FactoryRoundedIcon />
                                            </ListItemButton>
                                        </ListItem>
                                    )}

                                    {buttonsVisible.dashboard && (
                                        <ListItem sx={{ flexGrow: 1, flexBasis: 0 }}>
                                            <ListItemButton selected>
                                                <DashboardRoundedIcon />
                                                <Box sx={{ marginLeft: 2 }}>
                                                    <Typography level="title-sm">Fight</Typography>
                                                </Box>
                                            </ListItemButton>
                                        </ListItem>
                                    )}
                                </Box>
                            )}

                            {/* No rule above the unit name — the card is the first thing in the bar. */}
                            <UnitStatsListItem
                                unitProperties={unitProperties}
                                overallImpact={selection.overallImpact}
                                factionType={selection.factionType}
                            />
                        </List>
                    </Box>
                </Box>

                {/* Turn panel and queue are pinned to the bottom: they are the two blocks a player must be
                    able to read at any moment, so they never take part in the shrinking above. */}
                <Box sx={{ flexShrink: 0 }}>
                    <MessageBox gameStarted={gameStarted} />
                </Box>

                {gameStarted && (
                    <Box sx={{ flexShrink: 0 }}>
                        <UpNext />
                    </Box>
                )}
            </Sheet>
        </SidebarMetricsContext.Provider>
    );
}
