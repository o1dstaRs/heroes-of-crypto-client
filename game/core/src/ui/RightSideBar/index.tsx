import { IDamageStatistic } from "@heroesofcrypto/common";
import { TRIM_WIDTH_PX as BOARD_EDGE_TRIM_WIDTH_PX } from "../boardEdgeTrim";
import { setVolumeSlot } from "../audio/volumeSlot";
import { FightLog } from "./FightLog";
import DraggableToolbar, { TOOLBAR_TOP_LIFT_PX, TRIM_OVERHANG_PX, toolbarColumnHeightPx } from "../DraggableToolbar";
import { SIDEBAR_BG, SIDEBAR_BG_IMAGE, SIDEBAR_BG_REPEAT, SIDEBAR_BG_SIZE } from "../LeftSideBar";
import Divider from "@mui/joy/Divider";
import Box from "@mui/joy/Box";
import LinearProgress from "@mui/joy/LinearProgress";
import List from "@mui/joy/List";
import ListItem from "@mui/joy/ListItem";
import ListItemButton from "@mui/joy/ListItemButton";
import ListItemContent from "@mui/joy/ListItemContent";
import Sheet from "@mui/joy/Sheet";
import Typography from "@mui/joy/Typography";
import React, { useEffect, useState, useCallback, useLayoutEffect, useRef } from "react";
import Button from "@mui/joy/Button";
import { useNavigate } from "react-router";
import { usePixiManager } from "../../pixi/PixiGameManager";
import { images } from "../../generated/image_imports";
import Toggler from "../Toggler";
import FightControlToggler from "./FightControlToggler";
import { FullscreenToggle } from "./FullscreenToggle";
import { WalletLinker } from "../WalletLinker";
import { IWindowSize } from "../../scenes/VisibleState";

// Everything below the button row runs the full width of that row: from the button column's left rim —
// which reaches back past the sidebar's padding to meet the board trim — to the damage table's right edge.
// Left on the padding they came out a rim's width narrower than the panels above and read as a separate,
// indented column.
const fullBleedSx = {
    ml: `-${TRIM_OVERHANG_PX}px`,
    width: `calc(100% + ${TRIM_OVERHANG_PX}px)`,
} as const;

// Floor for the fight log. Below this the bar as a whole scrolls rather than squeezing the log to nothing.
const LOG_MIN_HEIGHT_PX = 168;

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

interface IDamageStatsTogglerProps {
    unitStatsElements: React.ReactNode;
}

const damageIcon = new URL("../../../images/damage_icon.webp", import.meta.url).toString(); // [NEW]

const DamageStatsToggler: React.FC<IDamageStatsTogglerProps> = ({
    unitStatsElements,
}: {
    unitStatsElements: React.ReactNode;
}) => (
    /* @ts-ignore: style params */
    <ListItem style={{ "--List-nestedInsetStart": "0px" }} nested>
        <Toggler
            renderToggle={({ open, setOpen }) => (
                <ListItemButton
                    onClick={() => setOpen(!open)}
                    sx={{
                        py: 2, // Consistent styling
                        backgroundColor: open ? "rgba(255, 143, 0, 0.1)" : "inherit",
                        transition: "background-color 0.3s",
                        "&:hover": {
                            backgroundColor: open ? "rgba(255, 143, 0, 0.15)" : "rgba(255, 255, 255, 0.05)",
                        },
                    }}
                >
                    <Box
                        component="img"
                        src={damageIcon} // Use the new icon
                        sx={{
                            width: "36px",
                            height: "36px",
                            filter: open ? "none" : "grayscale(100%)",
                            opacity: open ? 1 : 0.7,
                            mr: 1.5, // Slight spacing
                        }}
                    />
                    <ListItemContent>
                        <Typography level="title-sm">Damage</Typography>
                    </ListItemContent>
                    <Box
                        component="img"
                        src={images.tr_up}
                        sx={{
                            width: "12px",
                            transform: open ? "none" : "rotate(180deg)",
                            transition: "transform 0.2s",
                            filter: open
                                ? "brightness(0) saturate(100%) invert(58%) sepia(91%) saturate(3089%) hue-rotate(2deg) brightness(103%) contrast(104%)"
                                : "none",
                        }}
                    />
                </ListItemButton>
            )}
        >
            <List sx={{ gap: 0, pt: 2 }}>{unitStatsElements}</List>
        </Toggler>
    </ListItem>
);

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
        unitStats.push({ unitName, damage: s.damage, team: s.team, lap: s.lap });
        maxDmg = Math.max(maxDmg, s.damage);
    }

    const unitStatsElements = unitStats.map((stat) => (
        <Box key={`${stat.unitName}-${stat.team}`}>
            <Typography
                color={stat.team === 1 ? "danger" : "success"}
                level="body-xs"
                fontWeight="xl"
                sx={{
                    display: "flex",
                    position: "absolute",
                }}
            >
                {stat.unitName}
            </Typography>
            <Typography
                color={stat.team === 1 ? "danger" : "success"}
                level="body-xs"
                fontWeight="xl"
                sx={{
                    justifyContent: "flex-end",
                    display: "flex",
                }}
            >
                {stat.damage}
            </Typography>
            <LinearProgress
                color={stat.team === 1 ? "danger" : "success"}
                variant="soft"
                determinate
                value={(stat.damage / maxDmg) * 100}
                sx={{ my: 1 }}
            />
        </Box>
    ));

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
                p: 2,
                // flexShrink: 0,
                display: "flex",
                flexDirection: "column",
                gap: 2,
                // Board-facing edge, mirrored from LeftSideBar: widened to the gold trim's width and the
                // background clipped to the padding box, so the leather ends where the trim begins.
                borderLeft: `${BOARD_EDGE_TRIM_WIDTH_PX}px solid #0a0705`,
                backgroundClip: "padding-box",
                boxShadow: "inset 1px 0 0 rgba(120,104,80,.22), -6px 0 18px rgba(0,0,0,.7)",
                overflowY: "auto", // Allow vertical scrolling
                overflowX: "hidden", // Prevent horizontal scrolling
                // Same ground as the left bar.
                backgroundColor: SIDEBAR_BG,
                backgroundImage: SIDEBAR_BG_IMAGE,
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
                                gap: 1,
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
                            }}
                        >
                            <DraggableToolbar flushToTrim />
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
                                    position: "relative",
                                    // Lifted by exactly as much as the button column is, so both start on
                                    // the same line. Its bottom is pinned by the stretch, so this only ever
                                    // adds height at the top.
                                    mt: `-${TOOLBAR_TOP_LIFT_PX}px`,
                                }}
                            >
                                <Box sx={{ position: "absolute", inset: 0, overflowY: "auto", ...hocBronzeScrollSx }}>
                                    <DamageStatsToggler unitStatsElements={unitStatsElements} />
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
                                ...fullBleedSx,
                                display: "flex",
                                flexDirection: "column",
                                minHeight: `${LOG_MIN_HEIGHT_PX}px`,
                                ...(frozenLogHeight === null
                                    ? { flex: "1 1 auto" }
                                    : { flex: "0 0 auto", height: `${frozenLogHeight}px` }),
                            }}
                        >
                            <FightLog text={attackText} />
                        </Box>
                    )}
                    {rankedPanel && gameStarted && <Box sx={{ ...fullBleedSx, mt: 1 }}>{rankedPanel}</Box>}
                    {/* Sandbox has no ranked sheet to carry the control, and no forfeit either — there is no
                        opponent to award the win to. It still needs a way out of a running fight, so it gets
                        the same bare button, wired to leave rather than to concede. */}
                    {!rankedPanel && gameStarted && (
                        <Box sx={{ ...fullBleedSx, mt: 1 }}>
                            <Button
                                variant="soft"
                                color="danger"
                                onClick={() => navigate("/play")}
                                sx={{ width: "100%" }}
                            >
                                EXIT FIGHT
                            </Button>
                        </Box>
                    )}
                    <Divider sx={fullBleedSx} />
                    {showWallet && <WalletLinker />}
                    {/* The strip under EXIT FIGHT, in flow: fullscreen hard left, the music control hard
                        right. Both used to be pinned to the window's bottom-right corner on their own
                        layer, which floated them OVER the exit button instead of under it. */}
                    <Box
                        sx={{
                            ...fullBleedSx,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            // Pushed to the very bottom of the bar: with the log hidden before the fight the
                            // strip used to float mid-panel, right under the ready button.
                            mt: "auto",
                            pt: 0.5,
                        }}
                    >
                        <FullscreenToggle />
                        <Box ref={volumeSlotRef} sx={{ display: "flex", alignItems: "center", flex: "0 0 auto" }} />
                    </Box>
                </List>
            </Box>
        </Sheet>
    );
}
