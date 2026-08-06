import { IDamageStatistic } from "@heroesofcrypto/common";
import { setVolumeSlot } from "../audio/volumeSlot";
import { FightLog } from "./FightLog";
import DraggableToolbar, { toolbarColumnHeightPx } from "../DraggableToolbar";
import { RIGHT_SIDEBAR_BG_IMAGE, SIDEBAR_BG, SIDEBAR_BG_REPEAT, SIDEBAR_BG_SIZE } from "../LeftSideBar";
import { SidebarFrame } from "../SidebarFrame";
import Divider from "@mui/joy/Divider";
import Box from "@mui/joy/Box";
import List from "@mui/joy/List";
import Sheet from "@mui/joy/Sheet";
import Typography from "@mui/joy/Typography";
import React, { useEffect, useState, useCallback, useLayoutEffect, useRef } from "react";
import Button from "@mui/joy/Button";
import { useNavigate } from "react-router";
import { usePixiManager } from "../../pixi/PixiGameManager";
import { images } from "../../generated/image_imports";
import { hocColors, hocDisplayFontFamily, hocSidebarImageButtonSx, hocSidebarSectionSx } from "../hocTheme";
import FightControlToggler from "./FightControlToggler";
import { FullscreenToggle } from "./FullscreenToggle";
import { WalletLinker } from "../WalletLinker";
import { IWindowSize } from "../../scenes/VisibleState";
import { sidebarPlainFrameSideInsetPx, sidebarPlainFrameVerticalInsetPx } from "../LeftSideBar/sidebarMetrics";

// Floor for the fight log. Below this the bar as a whole scrolls rather than squeezing the log to nothing.
const LOG_MIN_HEIGHT_PX = 168;
// One complete damage entry (name/value plus its framed meter). The viewport is rounded down to a whole
// number of these rows so the next creature never peeks out without its meter at the bottom edge.
const DAMAGE_ROW_HEIGHT_PX = 54;
const DAMAGE_LIST_VERTICAL_PADDING_PX = 20;

// Same slim bronze scrollbar the fight log and the left bar's wells use, so every scrollable block in the
// sidebar reads as the same kind of surface.
const hocBronzeScrollSx = {
    overscrollBehavior: "contain",
    scrollbarWidth: "thin",
    scrollbarColor: "rgba(255, 143, 0, 0.35) transparent",
    "&::-webkit-scrollbar": { width: "6px" },
    "&::-webkit-scrollbar-track": { background: "transparent" },
    "&::-webkit-scrollbar-thumb": { backgroundColor: "rgba(255, 143, 0, 0.32)", borderRadius: "3px" },
    "&::-webkit-scrollbar-thumb:hover": { backgroundColor: "rgba(255, 143, 0, 0.55)" },
} as const;

const damageIcon = images.damage_analytics_icon;

export default function RightSideBar({
    gameStarted,
    windowSize,
    rankedPanel,
    showWallet = false,
}: {
    gameStarted: boolean;
    windowSize: IWindowSize;
    rankedPanel?: React.ReactNode;
    showWallet?: boolean;
}) {
    const navigate = useNavigate();
    const [unitDamageStatistics, setUnitDamageStatistics] = useState([] as IDamageStatistic[]);

    // See the note at the log itself: its height is measured on the first layout and then held, so nothing
    // that happens later in the fight can re-deal it. The window size and leaving the fight are the only
    // things that release it — both change what "the spare height" even means.
    // The music control lives at the app root so the theme survives changing screens; this footer only
    // publishes WHERE it should appear, and ThemeMusic portals it in. See ui/audio/volumeSlot.
    const volumeSlotRef = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        setVolumeSlot(volumeSlotRef.current);
        return () => setVolumeSlot(null);
    }, []);

    const logBoxRef = useRef<HTMLDivElement>(null);
    const [frozenLogHeight, setFrozenLogHeight] = useState<number | null>(null);
    const damageListSpaceRef = useRef<HTMLDivElement>(null);
    const [damageListViewportHeight, setDamageListViewportHeight] = useState<number | null>(null);

    useLayoutEffect(() => {
        setFrozenLogHeight(null);
    }, [windowSize.width, windowSize.height, gameStarted]);

    useLayoutEffect(() => {
        if (frozenLogHeight !== null) {
            return;
        }
        const measured = logBoxRef.current?.offsetHeight ?? 0;
        if (measured > 0) {
            setFrozenLogHeight(Math.max(LOG_MIN_HEIGHT_PX, Math.round(measured)));
        }
    }, [frozenLogHeight]);

    useLayoutEffect(() => {
        const space = damageListSpaceRef.current;
        if (!space) {
            return;
        }

        const fitWholeRows = () => {
            const availableHeight = space.clientHeight;
            const contentHeight = Math.max(0, availableHeight - DAMAGE_LIST_VERTICAL_PADDING_PX);
            const wholeRowsHeight = Math.floor(contentHeight / DAMAGE_ROW_HEIGHT_PX) * DAMAGE_ROW_HEIGHT_PX;
            setDamageListViewportHeight(wholeRowsHeight + DAMAGE_LIST_VERTICAL_PADDING_PX);
        };

        fitWholeRows();
        const resizeObserver = new ResizeObserver(fitWholeRows);
        resizeObserver.observe(space);
        return () => resizeObserver.disconnect();
    }, [gameStarted]);

    useEffect(() => {
        if (!gameStarted) {
            setUnitDamageStatistics([]);
        }
    }, [gameStarted]);
    const manager = usePixiManager();
    const [barSize, setBarSize] = useState(280);

    const adjustBarSize = useCallback(() => {
        const additionalBoardPixels = 0;
        const widthRatio = windowSize.width / (2048 + additionalBoardPixels);
        const heightRatio = windowSize.height / 2048;

        const scaleRatio = Math.min(widthRatio, heightRatio);
        const scaledBoardSize = (2048 + additionalBoardPixels) * scaleRatio;

        const rightBarEndAtBoard = (windowSize.width - scaledBoardSize) / 2;
        // Rounded exactly as the left bar rounds it (LeftSideBar.adjustBarSize). Left with a fraction here,
        // the two bars could resolve to different widths and the board would sit a pixel off centre between
        // them even though it is centred in the window.
        setBarSize(Math.max(0, Math.round(rightBarEndAtBoard)));
    }, [windowSize]);

    useEffect(() => {
        adjustBarSize();
        manager.HomeCamera();
    }, [adjustBarSize, manager]);

    const [attackText, setAttackText] = useState("");

    useEffect(() => {
        const connection1 = manager.onAttackLanded.connect(setAttackText);
        return () => {
            connection1.disconnect();
        };
    }, [manager]);

    useEffect(() => {
        const connection2 = manager.onDamageStatisticsUpdated.connect(setUnitDamageStatistics);
        return () => {
            connection2.disconnect();
        };
    }, [manager]);

    const unitStats: IDamageStatistic[] = [];
    let maxDmg = Number.MIN_SAFE_INTEGER;
    for (const s of unitDamageStatistics) {
        let { unitName } = s;
        if (s.unitName.includes(" ")) {
            const stringParts = s.unitName.split(/\s/);
            unitName = `${stringParts[0][0]}. ${stringParts[1]}`;
        }
        unitStats.push({ unitName: unitName.toUpperCase(), damage: s.damage, team: s.team, lap: s.lap });
        maxDmg = Math.max(maxDmg, s.damage);
    }

    const unitStatsElements = unitStats.map((stat) => {
        const isEnemy = stat.team === 1;
        const teamColor = isEnemy ? hocColors.danger : hocColors.green;
        const value = maxDmg > 0 ? (stat.damage / maxDmg) * 100 : 0;
        const key = `${stat.unitName}-${stat.team}`;

        return (
            <Box
                key={key}
                sx={{
                    height: `${DAMAGE_ROW_HEIGHT_PX}px`,
                    boxSizing: "border-box",
                    pt: "2px",
                    scrollSnapAlign: "start",
                }}
            >
                <Box sx={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 1 }}>
                    <Typography
                        sx={{
                            minWidth: 0,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            fontFamily: hocDisplayFontFamily,
                            fontSize: "0.72rem",
                            fontWeight: 600,
                            letterSpacing: "0.045em",
                            color: teamColor,
                        }}
                    >
                        {stat.unitName}
                    </Typography>
                    <Typography
                        sx={{ flexShrink: 0, fontFamily: hocDisplayFontFamily, fontSize: "0.73rem", color: teamColor }}
                    >
                        {stat.damage}
                    </Typography>
                </Box>
                <Box
                    sx={{
                        position: "relative",
                        mt: "6px",
                        mx: "5px",
                        height: 10.35,
                        p: "1px",
                        border: "2px solid rgba(118,76,30,.94)",
                        bgcolor: "rgba(3,3,2,.72)",
                        boxShadow: "inset 0 1px 2px rgba(0,0,0,.9)",
                        "&::before, &::after": {
                            content: '""',
                            position: "absolute",
                            top: "50%",
                            width: 8.05,
                            height: 8.05,
                            border: "2px solid rgba(118,76,30,.94)",
                            bgcolor: "#100b06",
                            transform: "translateY(-50%) rotate(45deg)",
                            zIndex: 1,
                        },
                        "&::before": { left: -6 },
                        "&::after": { right: -6 },
                    }}
                >
                    <Box
                        sx={{
                            width: `${value}%`,
                            height: "100%",
                            bgcolor: teamColor,
                            boxShadow: `inset 0 1px 0 rgba(255,255,255,.18), 0 0 3px ${teamColor}`,
                        }}
                    />
                </Box>
            </Box>
        );
    });

    return (
        <Sheet
            className="Sidebar"
            sx={{
                position: "fixed",
                zIndex: 1, // Lower z-index to allow overlays on top
                height: "100dvh",
                width: `${barSize}px`,
                top: 0,
                right: 0,
                // All combat blocks share one left edge. The compensation preserves the existing visual
                // gap at the right rail and mirrors that gap on the board-facing side.
                pl: gameStarted ? `${Math.max(0, sidebarPlainFrameSideInsetPx(barSize) - 6)}px` : "6px",
                // Setup keeps its safer inset for wide accordion controls and scrollbars.
                pr: gameStarted ? 0 : `${sidebarPlainFrameSideInsetPx(barSize)}px`,
                pt: `${sidebarPlainFrameVerticalInsetPx(windowSize.height)}px`,
                pb: `${sidebarPlainFrameVerticalInsetPx(windowSize.height)}px`,
                // flexShrink: 0,
                display: "flex",
                flexDirection: "column",
                gap: 2,
                // Board-facing edge, mirrored from LeftSideBar: widened to the gold trim's width and the
                // background clipped to the padding box, so the leather ends where the trim begins.
                backgroundClip: "padding-box",
                boxShadow: "inset 1px 0 0 rgba(120,104,80,.22), -6px 0 18px rgba(0,0,0,.7)",
                // Setup must always fit as one fixed command deck. Combat/ranked screens can still scroll
                // when their logs or server-provided panels genuinely exceed the viewport.
                overflowY: !gameStarted && !rankedPanel ? "hidden" : "auto",
                overflowX: "hidden", // Prevent horizontal scrolling
                // Reserve the scrollbar lane even while the short/collapsed layout does not need it.
                // Otherwise opening an augment makes the scrollbar appear, steals width, and visibly
                // jerks every 9-slice container frame and its right rail to the left.
                scrollbarGutter: !gameStarted && !rankedPanel ? "auto" : "stable",
                // Same ground as the left bar.
                backgroundColor: SIDEBAR_BG,
                backgroundImage: RIGHT_SIDEBAR_BG_IMAGE,
                backgroundSize: SIDEBAR_BG_SIZE,
                backgroundRepeat: SIDEBAR_BG_REPEAT,
                backgroundPosition: "right center",
            }}
        >
            <Box
                sx={{
                    minHeight: 0,
                    flexGrow: 1,
                    display: "flex",
                    flexDirection: "column",
                }}
            >
                <List
                    size="sm"
                    sx={{
                        gap: 1,
                        px: 0,
                        "--ListItem-paddingX": "0px",
                        // Claim the bar's full height so the bottom control strip can sit on the very edge.
                        flexGrow: 1,
                        minHeight: 0,
                        "--List-nestedInsetStart": "30px",
                        "--ListItem-radius": (t) => t.vars.radius.sm,
                    }}
                >
                    {/* The ranked sheet is placement-only; during the fight the same slot ships just the
                        forfeit control, which is parked at the bottom of the bar instead (see below). */}
                    {rankedPanel && !gameStarted && <Box sx={{ mb: 1 }}>{rankedPanel}</Box>}
                    {!gameStarted && !rankedPanel && <FightControlToggler />}
                    {/* Turn actions live here rather than floating over the board — those cells have to stay
                        clickable to move and attack. The buttons keep their own narrow column and the damage
                        table takes the rest of the width beside them. */}
                    {gameStarted && (
                        <Box
                            sx={{
                                display: "flex",
                                // Both children keep their content height: neither the button column nor
                                // the damage table has anything to gain from the bar's spare height, and
                                // claiming it here is what pushed the log down the bar.
                                alignItems: "flex-start",
                                // No bottom margin of its own: the List already puts a gap between every
                                // child, and carrying a second one here opened a band of bare leather
                                // between the button column and the log. The log is measured on the first
                                // layout, so the 8px this gives back goes straight into its height — it
                                // starts higher and its bottom edge does not move.
                                // Fixed, and fixed to the button column rather than to anything's content:
                                // this row is the one place in the bar whose height would otherwise swing
                                // with the turn, and everything under it — the log especially — is pinned
                                // by where it ends.
                                height: `${toolbarColumnHeightPx()}px`,
                                flexShrink: 0,
                                gap: "6px",
                            }}
                        >
                            <DraggableToolbar />
                            {/* Shown from the first turn, not from the first hit: the table keeps its place
                                and simply lists nothing until damage is dealt, instead of appearing out of
                                nowhere mid-fight and pushing everything below it. */}
                            {/* The table is absolutely positioned inside a stretched wrapper so its rows
                                never feed back into the row's height: a long fight lists a dozen creatures,
                                and letting that drive the layout pushed the log off the bottom of the bar.
                                It fills the button column's height and scrolls past it. */}
                            <Box
                                sx={{
                                    flex: "1 1 auto",
                                    minWidth: 0,
                                    alignSelf: "stretch",
                                    ...hocSidebarSectionSx("board"),
                                    display: "flex",
                                    flexDirection: "column",
                                    p: 0,
                                }}
                            >
                                <Box
                                    sx={{
                                        flex: "0 0 48px",
                                        display: "flex",
                                        alignItems: "center",
                                        px: "10px",
                                        gap: "8px",
                                        borderBottom: "1px solid rgba(112,75,42,.48)",
                                    }}
                                >
                                    <Box component="img" src={damageIcon} sx={{ width: 43, height: 43 }} />
                                    <Typography
                                        sx={{
                                            flex: 1,
                                            textAlign: "center",
                                            fontFamily: hocDisplayFontFamily,
                                            fontSize: "1.139rem",
                                            // The display face has no intermediate 575 file. Ask the browser
                                            // to synthesize the next visible weight and reinforce it with a
                                            // hairline stroke so the requested heavier title survives scaling.
                                            fontWeight: 570,
                                            fontSynthesis: "weight",
                                            WebkitTextStroke: "0.0114em currentColor",
                                            paintOrder: "stroke fill",
                                            letterSpacing: "0.13em",
                                            color: hocColors.gold,
                                        }}
                                    >
                                        DAMAGE
                                    </Typography>
                                </Box>
                                <Box ref={damageListSpaceRef} sx={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
                                    <Box
                                        sx={{
                                            height:
                                                damageListViewportHeight === null
                                                    ? "100%"
                                                    : `${damageListViewportHeight}px`,
                                            maxHeight: "100%",
                                            overflowY: "auto",
                                            overflowX: "hidden",
                                            scrollSnapType: "y mandatory",
                                            p: "10px",
                                            ...hocBronzeScrollSx,
                                        }}
                                    >
                                        {unitStatsElements}
                                    </Box>
                                </Box>
                            </Box>
                        </Box>
                    )}
                    {/* Measured once, then frozen.
                        The log opens at whatever height the bar has spare and keeps it for the rest of the
                        fight — it never grows again, whatever lands in it or beside it. Elastic, it kept
                        being re-dealt as blocks around it came and went, and every one of those swings moved
                        the controls underneath. A plain fixed number could not do the job either: the spare
                        height depends on the window. So the flex height is taken on the first layout and
                        pinned, and only a resize (or leaving the fight) hands it back to be measured again.
                        Past that height the entries scroll inside the well. */}
                    {gameStarted && (
                        <Box
                            ref={logBoxRef}
                            sx={{
                                display: "flex",
                                flexDirection: "column",
                                minHeight: `${LOG_MIN_HEIGHT_PX}px`,
                                ...hocSidebarSectionSx("team"),
                                p: 0,
                                ...(frozenLogHeight === null
                                    ? { flex: "1 1 auto" }
                                    : { flex: "0 0 auto", height: `${frozenLogHeight}px` }),
                            }}
                        >
                            <Box
                                sx={{
                                    flex: "0 0 34px",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    px: "8px",
                                    borderBottom: "1px solid rgba(112,75,42,.48)",
                                }}
                            >
                                <Typography
                                    sx={{
                                        textAlign: "center",
                                        fontFamily: hocDisplayFontFamily,
                                        fontSize: "0.989rem",
                                        fontWeight: 500,
                                        letterSpacing: "0.13em",
                                        color: hocColors.gold,
                                    }}
                                >
                                    BATTLE LOG
                                </Typography>
                            </Box>
                            <Box sx={{ flex: 1, minHeight: 0, display: "flex" }}>
                                <FightLog text={attackText} />
                            </Box>
                        </Box>
                    )}
                    {rankedPanel && gameStarted && <Box sx={{ mt: 1 }}>{rankedPanel}</Box>}
                    <Divider />
                    {showWallet && <WalletLinker />}
                    {/* Compact footer: fullscreen and music stay on the edges, while sandbox's exit action
                        occupies the centre instead of consuming a separate row above. The fight log receives
                        all of the height released by removing that row. */}
                    <Box
                        sx={{
                            width: "100%",
                            pl: gameStarted ? 0 : `${Math.max(0, sidebarPlainFrameSideInsetPx(barSize) - 6)}px`,
                            display: "grid",
                            gridTemplateColumns: "32px minmax(0, 1fr) 32px",
                            alignItems: "center",
                            // Pushed to the very bottom of the bar: with the log hidden before the fight the
                            // strip used to float mid-panel, right under the ready button.
                            mt: "auto",
                            pt: 0.5,
                        }}
                    >
                        <FullscreenToggle />
                        {!rankedPanel && gameStarted ? (
                            <Button
                                variant="soft"
                                color="danger"
                                onClick={() => navigate("/play")}
                                sx={{
                                    ...hocSidebarImageButtonSx("danger"),
                                    justifySelf: "center",
                                    width: "min(100%, 209px)",
                                    height: "35.2px",
                                    minHeight: "35.2px",
                                    px: 1,
                                    backgroundSize: "100% 100%",
                                    fontSize: "0.924rem",
                                    fontWeight: 880,
                                }}
                            >
                                EXIT FIGHT
                            </Button>
                        ) : (
                            <Box />
                        )}
                        <Box
                            ref={volumeSlotRef}
                            sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end", minWidth: 0 }}
                        />
                    </Box>
                </List>
            </Box>
            <SidebarFrame side="right" width={barSize} height={windowSize.height} />
        </Sheet>
    );
}
