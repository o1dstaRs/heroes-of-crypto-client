import { UnitProperties, FactionType, FactionVals } from "@heroesofcrypto/common";
import DiceIcon from "@mui/icons-material/Casino";
import DashboardRoundedIcon from "@mui/icons-material/DashboardRounded";
import FactoryRoundedIcon from "@mui/icons-material/FactoryRounded";
import TerrainRoundedIcon from "@mui/icons-material/TerrainRounded";
import Box from "@mui/joy/Box";
import Divider from "@mui/joy/Divider";
import List from "@mui/joy/List";
import ListItem from "@mui/joy/ListItem";
import ListItemButton from "@mui/joy/ListItemButton";
import Sheet from "@mui/joy/Sheet";
import { useColorScheme } from "@mui/joy/styles";
import Typography from "@mui/joy/Typography";
import React, { useEffect, useState, useCallback, useMemo, useLayoutEffect } from "react";

import { MessageBox } from "./MessageBox";
import { usePixiManager } from "../../pixi/PixiGameManager";
const greenOverlayImage = new URL("../../../images/overlay_green.webp", import.meta.url).toString();
const redOverlayImage = new URL("../../../images/overlay_red.webp", import.meta.url).toString();
const sidebarOverlayImage = new URL("../../../images/sidebar_overlay.webp", import.meta.url).toString(); // [NEW]
import { UnitStatsListItem } from "./UnitStatsListItem";
import { UpNext } from "./UpNext";
import SynergiesRow from "./SynergiesRow";
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
const sidebarImageUrls = [greenOverlayImage, redOverlayImage, sidebarOverlayImage];

// Floor for the unit card. Past this the sidebar as a whole starts scrolling rather than squeezing the
// card into nothing — the point where the screen is simply too short for the panel.
const MIN_CARD_HEIGHT = 140;

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

    useEffect(() => {
        if (typeof Image === "undefined") return;

        sidebarImageUrls.forEach((src) => {
            const img = new Image();
            img.decoding = "async";
            img.src = src;
        });
    }, []);

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
    const hasSelectedUnit = !!unitProperties.team;
    const synergies = ((unitProperties as UnitProperties).synergies as string[]) || [];

    const hasSynergies = Array.isArray(synergies) && synergies.length > 0;
    const showSynergies = hasSelectedUnit && hasSynergies;

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
                    py: `${metrics.padPx}px`,
                    display: "flex",
                    flexDirection: "column",
                    gap: `${metrics.gapPx}px`,
                    borderRight: "1px solid",
                    borderColor: "divider",
                    // Everything below sizes itself to the bar, and the card scales down when its content
                    // cannot fit, so a scrollbar only ever appears on a screen too short for the pinned
                    // turn panel and queue alone.
                    overflowY: "auto",
                    overflowX: "hidden",
                    transition: "width 180ms ease-out",
                    willChange: "width",
                    // Background Image Overlay
                    backgroundImage: `url(${sidebarOverlayImage})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    backgroundRepeat: "no-repeat",
                }}
            >
                <Box
                    component="img"
                    src={greenOverlayImage}
                    alt=""
                    aria-hidden
                    sx={{
                        ...teamOverlaySx,
                        opacity: hasSelectedUnit && unitProperties.team === 2 ? 1 : 0,
                    }}
                />
                <Box
                    component="img"
                    src={redOverlayImage}
                    alt=""
                    aria-hidden
                    sx={{
                        ...teamOverlaySx,
                        opacity: hasSelectedUnit && unitProperties.team !== 2 ? 1 : 0,
                    }}
                />

                {/* The strip collapses completely when there is nothing to show — reserving a fixed 52px
                    band cost the card a whole ability row on a 768px-tall screen. */}
                <Box
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        flexShrink: 0,
                        height: showSynergies ? "auto" : 0,
                        opacity: showSynergies ? 1 : 0,
                        overflow: "hidden",
                        transition: "opacity 160ms ease-out",
                    }}
                >
                    {showSynergies && <SynergiesRow synergies={synergies} />}
                </Box>

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

                            <Divider />

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
