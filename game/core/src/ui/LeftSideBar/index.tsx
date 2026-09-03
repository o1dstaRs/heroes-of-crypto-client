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

import { MessageBox } from "./MessageBox";
import { images } from "../../generated/image_imports";
import { battleSidebarWidth } from "../../pixi/boardFit";
import { usePixiManager } from "../../pixi/PixiGameManager";
import { upNextSmokyChainsBackgroundLayer } from "../upNextBackground";
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
/** Nine-slice-style sidebar backgrounds. The outside ornament is split into aspect-preserving top and
 * bottom pieces. A quiet center texture grows between them as the viewport gets taller, while separate
 * outside and board-facing rails keep the frame continuous without stretching either ornament. */
const SIDEBAR_BG_TINT = "linear-gradient(rgba(0,0,0,.04), rgba(0,0,0,.1))";
export const LEFT_SIDEBAR_BG_IMAGE = `${SIDEBAR_BG_TINT}, url(${images.ui_sidebar_bg_left_smoked_bronze_outer_top_v12}), url(${images.ui_sidebar_bg_left_smoked_bronze_outer_bottom_v12}), url(${images.ui_sidebar_bg_left_smoked_bronze_outer_rail_v12}), url(${images.ui_sidebar_bg_left_smoked_bronze_inner_v11}), url(${images.ui_sidebar_bg_left_smoked_bronze_center_v11})`;
export const RIGHT_SIDEBAR_BG_IMAGE = `${SIDEBAR_BG_TINT}, url(${images.ui_sidebar_bg_right_smoked_bronze_outer_top_v12}), url(${images.ui_sidebar_bg_right_smoked_bronze_outer_bottom_v12}), url(${images.ui_sidebar_bg_right_smoked_bronze_outer_rail_v12}), url(${images.ui_sidebar_bg_right_smoked_bronze_inner_v11}), url(${images.ui_sidebar_bg_right_smoked_bronze_center_v11})`;
export const LEFT_SIDEBAR_BG_POSITION = "center, left top, left bottom, left center, right center, center";
export const RIGHT_SIDEBAR_BG_POSITION = "center, right top, right bottom, right center, left center, center";
export const SIDEBAR_BG_REPEAT = "no-repeat, no-repeat, no-repeat, no-repeat, no-repeat, no-repeat";

// Slim both full-height rails by 30%. The space is returned to the content column instead of shrinking
// the complete left sidebar.
export const sidebarVerticalRailWidth = (barSize: number): number =>
    Math.max(4, Math.min(13, Math.round(barSize * 0.03 * 0.7)));

/** The ornament used to occupy 41.9% of the bar after the 103% overscan. 27.2% is 35% narrower.
 * Cap it so ultrawide layouts add quiet stone instead of enlarging the ornament again. */
export const sidebarBackgroundSize = (barSize: number): string => {
    const ornamentWidth = Math.max(40, Math.min(150, Math.round(barSize * 0.272)));
    const outerRailWidth = sidebarVerticalRailWidth(barSize);
    const innerRailWidth = sidebarVerticalRailWidth(barSize);
    return `100% 100%, ${ornamentWidth}px auto, ${ornamentWidth}px auto, ${outerRailWidth}px 103%, ${innerRailWidth}px 103%, 100% 103%`;
};

import { DeferredUnitStatsListItem } from "./DeferredUnitStatsListItem";
import {
    computeBattleSidebarMetrics,
    SIDEBAR_FRAME_RIGHT_INSET_PX,
    SidebarMetricsContext,
    sidebarFrameBottomInsetPx,
    sidebarFrameSideInsetPx,
    sidebarFrameTopInsetPx,
} from "./sidebarMetrics";
import type { IVisibleImpact } from "../../scenes/VisibleState";
import { useFitScale } from "./useFitScale";
import { IWindowSize, IVisibleOverallImpact } from "../../scenes/VisibleState";

const UpNext = React.lazy(() => import("./UpNext").then(({ UpNext }) => ({ default: UpNext })));

type SidebarSelectionState = {
    unit: UnitProperties;
    overallImpact: IVisibleOverallImpact;
    factionType: FactionType;
};

const emptyUnit = {} as UnitProperties;
const emptyImpact = {} as IVisibleOverallImpact;

// Floor for the unit card. Below this the portrait may rise over the right sidebar content instead of
// collapsing into an unreadable strip.
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
        const nextBarSize = battleSidebarWidth(windowSize.width, windowSize.height);
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

    const metrics = useMemo(() => {
        return computeBattleSidebarMetrics(barSize, windowSize.width, windowSize.height, cardHeight, contentLoad);
    }, [barSize, cardHeight, contentLoad, windowSize.width, windowSize.height]);

    const unitProperties = selection.unit || ({} as UnitProperties);
    // Keep the usable width unchanged while centring the whole inner column between the two outer rails.
    // The left side includes a real border, so its CSS padding must be that border narrower than the right.
    const balancedOuterInset = Math.round((sidebarFrameSideInsetPx(barSize) + SIDEBAR_FRAME_RIGHT_INSET_PX) / 2);
    const balancedLeftPadding = balancedOuterInset;
    const selectedCardTopInset = Math.max(8, Math.round(sidebarFrameTopInsetPx(windowSize.height) * 0.45));
    const unitDetailsShellPadding = Math.max(2, Math.round(metrics.padPx * 0.16));
    const verticalRailWidth = sidebarVerticalRailWidth(barSize);
    // Move the complete combat footer as one piece: the timer's lower edge, the queue background/rule and
    // the creature cards keep their exact internal spacing. At the annotated browser zoom this is the
    // shared ~46px move from both current edges to the two blue guide lines.
    const combatFooterShiftPx = Math.round(metrics.gapPx * 2.6);

    // The card is the only elastic block: everything else is pinned, so it both reports its own height
    // (feeding the metrics above) and scales itself down if its content still cannot fit.
    const { setViewport, setContent, scale } = useFitScale();
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
                    // Equal visible margins on both sides; the texture itself now supplies the outer rail.
                    pl: `${balancedLeftPadding}px`,
                    pr: `${balancedOuterInset}px`,
                    pt: `${selectedCardTopInset}px`,
                    pb: `${sidebarFrameBottomInsetPx(windowSize.height)}px`,
                    // Expose the exact inset so the selected creature heading can meet the same top rail
                    // as the roster collapse control instead of estimating it from responsive metrics.
                    "--sidebar-card-top-inset": `${selectedCardTopInset}px`,
                    // Let the complete selected card reach the physical edges of the left viewport. These
                    // values include the card shell's own horizontal padding, not only the sidebar padding.
                    "--sidebar-card-left-bleed": `${balancedLeftPadding + unitDetailsShellPadding}px`,
                    "--sidebar-card-right-bleed": `${balancedOuterInset + unitDetailsShellPadding}px`,
                    // Cancel the last fractional layout gap above the name flow. The extra 2px deliberately
                    // overdraws past y=0, preventing a hairline seam at non-integer responsive scales.
                    "--sidebar-card-frame-top-gap": `${unitDetailsShellPadding + 2}px`,
                    // The selected art rises out of the content inset into the unused right sidebar area.
                    "--sidebar-card-top-extension": `${Math.max(
                        8,
                        Math.round(sidebarFrameTopInsetPx(windowSize.height) * 1.45),
                    )}px`,
                    display: "flex",
                    flexDirection: "column",
                    gap: `${metrics.gapPx}px`,
                    boxSizing: "border-box",
                    // The active texture now owns the complete outer frame. Do not add a second border,
                    // inset rail or frame overlay around the sidebar container.
                    // The selected portrait is deliberately allowed to extend into the free space above
                    // the card. Clipping either axis makes CSS turn the other `visible` axis into `auto`,
                    // which is what produced the unwanted full-card scrollbar.
                    overflow: "visible",
                    transition: "width 180ms ease-out",
                    willChange: "width",
                    backgroundColor: SIDEBAR_BG,
                    backgroundImage: LEFT_SIDEBAR_BG_IMAGE,
                    backgroundSize: sidebarBackgroundSize(barSize),
                    backgroundRepeat: SIDEBAR_BG_REPEAT,
                    backgroundPosition: LEFT_SIDEBAR_BG_POSITION,
                    // The same two authored rails already used in the sidebar background are repeated as
                    // the top HUD layer. They now stay continuous from bottom to top and paint over the
                    // selected portrait, stat plate, section tiles and turn controls instead of disappearing
                    // behind whichever child happens to create the next stacking context.
                    "&::before": {
                        content: '""',
                        position: "absolute",
                        top: 0,
                        bottom: 0,
                        left: 0,
                        width: `${verticalRailWidth}px`,
                        zIndex: 30,
                        pointerEvents: "none",
                        // Mirror the same straight profile used by the lower highlighted section. This
                        // covers the old decorative upper rail with one continuous quiet edge.
                        backgroundImage: `url(${images.ui_sidebar_bg_left_smoked_bronze_inner_v11})`,
                        backgroundRepeat: "no-repeat",
                        backgroundPosition: "center",
                        backgroundSize: "100% 103%",
                        transform: "scaleX(-1)",
                    },
                    "&::after": {
                        content: '""',
                        position: "absolute",
                        top: 0,
                        right: 0,
                        bottom: 0,
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
                {/* The team colour is no longer a cloth banner across the bar — it is a fire-like aura
                    behind the portrait (see UnitStatsListItem). */}
                <Box
                    ref={attachViewport}
                    sx={{
                        minHeight: `${MIN_CARD_HEIGHT}px`,
                        flex: "1 1 0",
                        position: "relative",
                        zIndex: 2,
                        // The portrait already grows upward using --sidebar-card-top-extension. Let that
                        // authored overhang paint above the viewport instead of converting it into scroll.
                        overflow: "visible",
                    }}
                >
                    <Box
                        ref={setContent}
                        className="SidebarCard"
                        sx={{
                            height: "100%",
                            width: "100%",
                            // The selected portrait card cancels only this horizontal part of the emergency
                            // fit scale, so it can still meet the sidebar rails while its vertical layout
                            // continues to shrink enough to fit the available height.
                            "--sidebar-card-fit-scale": `${scale}`,
                            "--sidebar-card-inverse-fit-scale": `${1 / scale}`,
                            transform: scale === 1 ? "none" : `scale(${scale})`,
                            transformOrigin: "top center",
                            transition: "transform 160ms ease-out",
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
                            <DeferredUnitStatsListItem
                                unitProperties={unitProperties}
                                overallImpact={selection.overallImpact}
                                factionType={selection.factionType}
                            />
                        </List>
                    </Box>
                </Box>

                {/* Before the fight, the Start panel keeps its normal place in the column. Once combat
                    begins, the timer and queue become one bottom overlay instead of taking height away
                    from the selected card. This deliberately exposes the exact overlap with the unchanged
                    pre-fight card at every viewport size. */}
                <Box
                    sx={
                        gameStarted
                            ? {
                                  position: "absolute",
                                  zIndex: 31,
                                  left: `${balancedLeftPadding}px`,
                                  right: `${balancedOuterInset}px`,
                                  bottom: 0,
                                  transform: `translateY(${combatFooterShiftPx}px)`,
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: `${metrics.gapPx}px`,
                                  boxSizing: "border-box",
                                  paddingBottom: `${sidebarFrameBottomInsetPx(windowSize.height)}px`,
                                  borderRadius: `${Math.max(4, Math.round(metrics.gapPx * 0.7))}px ${Math.max(
                                      4,
                                      Math.round(metrics.gapPx * 0.7),
                                  )}px 0 0`,
                                  // Do not darken the newly exposed band above the timer. Only the lower
                                  // queue edge keeps its inset shade; the top now blends into the unit area.
                                  boxShadow: "inset 0 -18px 28px rgba(0,0,0,.32)",
                                  ...upNextSmokyChainsBackgroundLayer,
                              }
                            : { flexShrink: 0, position: "relative", zIndex: 1 }
                    }
                >
                    <MessageBox gameStarted={gameStarted} windowSize={windowSize} />
                    {gameStarted && (
                        <React.Suspense fallback={null}>
                            <UpNext />
                        </React.Suspense>
                    )}
                </Box>
            </Sheet>
        </SidebarMetricsContext.Provider>
    );
}
