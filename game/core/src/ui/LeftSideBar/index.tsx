import { UnitProperties, FactionType, FactionVals } from "@heroesofcrypto/common";
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

import { images } from "../../generated/image_imports";
import { TRIM_WIDTH_PX as BOARD_EDGE_TRIM_WIDTH_PX } from "../boardEdgeTrim";
import { MessageBox } from "./MessageBox";
import { usePixiManager } from "../../pixi/PixiGameManager";
// Black under everything. The hide is laid over it at partial opacity, so this is what mutes it — and what
// shows on its own for the moment before the texture arrives.
export const SIDEBAR_BG = "#000000";

/**
 * Tanned leather on both bars, taken down towards the stat plate's own darkness.
 *
 * CSS cannot fade one background layer on its own, so the veil is a flat black laid over the hide; against
 * Matching the stat plate exactly put the veil at 0.74 — the texture then averaged rgb(94, 47, 34) against
 * the plate's rgb(21, 14, 9) — and it has been tuned by eye since, to 0.767 over a hide brightened 15% in
 * the asset itself (it now averages rgb(109, 60, 45)). The bar lands at rgb(25, 14, 10): a shade above the
 * plate rather than level with it, so the plate reads as a recess in the hide and the grain stays visible
 * around it instead of being crushed to black.
 *
 * Why that dark at all — a mid-brown bar would have the cards, plates and button frames, all near-black,
 * reading as cut-outs punched out of it, and would cost the gold captions most of their contrast. At this
 * depth the hide is grain and creases under everything rather than a surface competing with them.
 *
 * `cover` rather than `repeat`: the hide has real creases and stamped devices on it, and tiling turns both
 * into a visible grid. One copy stretched over the bar keeps them as marks in a single piece of leather.
 */
/**
 * How much black sits over the hide, which averages rgb(108, 54, 39): the bars land at rgb(25, 13, 9).
 * Swap in a lighter texture and this stops meaning what it means — a parchment tried here at the same
 * value came out twice as light — so the number belongs with the file it was measured against.
 */
/**
 * Both bars are tinted to the MAP's palette, not to their own.
 *
 * The hide is warm — rgb(108, 54, 39) — and a black veil cannot fix that: it scales every channel by the
 * same factor, so the brown survives at any opacity, only darker. The board's plain stone reads
 * rgb(18, 18, 17) (sampled from background_stone_tiles, in the field away from its lit border), which is
 * all but neutral. So the wash is not black: it is a cool, near-black tint chosen so that
 *
 *     leather x LEATHER_SHARE + wash x (1 - LEATHER_SHARE) = the map's rgb(18, 18, 17)
 *
 * LEATHER_SHARE is what keeps any grain at all — a quantity in that derivation rather than a value the
 * wash below reads, which is why it lives here and is not declared. Its ceiling is 0.168: above that the
 * red channel would need a negative wash to cancel, since red is where the hide is warmest. 0.15 sits just
 * under it and leaves about +/-1.7 levels of texture, which is faint but not flat.
 */
const NEUTRALISING_WASH = "rgba(2, 12, 13, 0.85)";

/** One hide, both bars, tinted to the map. They differ only in which end of it they show — see the
 *  backgroundPosition on either Sheet — so the same crease never appears twice on screen. */
export const SIDEBAR_BG_IMAGE =
    `linear-gradient(${NEUTRALISING_WASH}, ${NEUTRALISING_WASH}),` + " url(" + images.sidebar_leather_plain + ")";
export const SIDEBAR_BG_SIZE = "auto, cover";
export const SIDEBAR_BG_REPEAT = "no-repeat, no-repeat";

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

type LeftSideBarProps = {
    gameStarted: boolean;
    windowSize: IWindowSize;
};

export default function LeftSideBar({ gameStarted, windowSize }: LeftSideBarProps) {
    const [barSize, setBarSize] = useState(280);
    // Height actually left for the unit card once the turn panel and the up-next queue have taken theirs.
    // Measured rather than derived, because those blocks resize with the content.
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
                    // The board-facing edge is left to the gold trim, which is painted over exactly this
                    // strip from a layer above (see boardEdgeTrim). The border is widened to the trim's own
                    // width and the background is clipped to the padding box, so the leather stops before
                    // the trim rather than running under it and on into the board's edge column of cells.
                    // Should the trim ever not be drawn, what shows here is a dark rule, not hide.
                    borderRight: `${BOARD_EDGE_TRIM_WIDTH_PX}px solid #0a0705`,
                    backgroundClip: "padding-box",
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
                    backgroundSize: SIDEBAR_BG_SIZE,
                    backgroundRepeat: SIDEBAR_BG_REPEAT,
                    // The two bars take opposite ends of the same hide, so they are never a mirrored pair.
                    backgroundPosition: "left center",
                }}
            >
                {/* The team colour is no longer a cloth banner across the bar — it is a fire-like aura
                    behind the portrait (see UnitStatsListItem). */}
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
