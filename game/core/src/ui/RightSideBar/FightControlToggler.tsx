// game/core/src/ui/FightControlToggler.tsx
import { UnitProperties, TeamVals } from "@heroesofcrypto/common";
import React, { useEffect, useState, useRef } from "react";
import List from "@mui/joy/List";
import ListItem from "@mui/joy/ListItem";
import ListItemButton from "@mui/joy/ListItemButton";
import ListItemContent from "@mui/joy/ListItemContent";
import Typography from "@mui/joy/Typography";
import Box from "@mui/joy/Box";
import { usePixiManager } from "../../pixi/PixiGameManager";
import { images } from "../../generated/image_imports";
import UnitInputAndActions from "./UnitInputAndActions";
import UnitSplitter from "./UnitSplitter";
import Toggler from "../Toggler";
import MapSettingsRadioButtons from "./MapSettingsRadioButtons";
// Sandbox has its own picker. SideToggleContainer is the ranked draft's layout: every augment card is
// expanded at once, which in this narrow panel stacks three tall radio groups and pushes the artifacts and
// the other team's section off the bottom. Sandbox wants the pre-redesign shape instead — one row of augment
// icons, and only the CHOSEN augment's options underneath — so it mounts SandboxToggleContainer, where that
// augment and artifact blocks are independently collapsible, with both shown when the available height can
// hold them.
import SandboxToggleContainer from "./SandboxToggleContainer";
import { SynergySlots } from "./SynergySlots";
import { FIGHT_LOG_SCROLLBAR_LANE_WIDTH_PX, ImageScrollbar } from "./FightLog";
import {
    hocColors,
    hocDisplayFontFamily,
    hocFontFamily,
    hocSidebarSectionHeaderSx,
    hocSidebarSectionSx,
} from "../hocTheme";

const sectionTitleSx = {
    fontFamily: hocDisplayFontFamily,
    fontSynthesis: "weight",
    fontWeight: 900,
    fontSize: "1.05rem",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: hocColors.sidebarTitle,
    WebkitTextStroke: "0.012em currentColor",
    paintOrder: "stroke fill",
    textShadow: "0 2px 2px #000",
} as const;

const sectionIconSx = {
    width: "46.4px",
    height: "46.4px",
    objectFit: "contain",
    filter: "sepia(.18) saturate(.88) drop-shadow(0 2px 2px rgba(0,0,0,.8))",
} as const;

const teamFlagSx = {
    width: "41.4px",
    height: "48.3px",
    flex: "0 0 41.4px",
    objectFit: "contain",
    filter: "none",
    opacity: 0.9,
} as const;

const teamTitleSlotSx = {
    flex: "1 1 auto",
    minWidth: 0,
} as const;

const expandedTeamSynergyRowSx = {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    px: 1.25,
    pt: 0.75,
    pb: 0.9,
    borderBottom: "1px solid rgba(112, 75, 42, .42)",
} as const;

const chevronSx = (open: boolean) => ({
    width: "12px",
    transform: open ? "none" : "rotate(180deg)",
    transition: "transform 0.2s",
    filter: "sepia(1) saturate(.55) brightness(1.18)",
});

const SANDBOX_SCROLLBAR_FRAME_GAP_PX = 4;
// Preserve the exact card width from the previous native-scrollbar layout. The picture-backed overlay
// no longer consumes this gutter, but the cards must not grow into the released six pixels.
const SANDBOX_LEGACY_SCROLLBAR_GUTTER_PX = 6;

const FightControlToggler: React.FC<{ scrollRailInsetPx: number }> = ({ scrollRailInsetPx }) => {
    const [unitProperties, setUnitProperties] = useState({} as UnitProperties);
    const manager = usePixiManager();
    const scrollViewportRef = useRef<HTMLDivElement>(null);
    // The parent reserves this inset for the ornamental right rail. Extend only the scrolling shell into
    // that empty strip; the section cards below retain their original width.
    const scrollRailExtensionPx = Math.max(
        FIGHT_LOG_SCROLLBAR_LANE_WIDTH_PX,
        scrollRailInsetPx - SANDBOX_SCROLLBAR_FRAME_GAP_PX,
    );

    // References to setOpen functions for each toggler
    const setOpenRefs = useRef<{
        army: ((open: boolean) => void) | null;
        map: ((open: boolean) => void) | null;
        red: ((open: boolean) => void) | null;
        green: ((open: boolean) => void) | null;
    }>({
        army: null,
        map: null,
        red: null,
        green: null,
    });

    useEffect(() => {
        // ✅ Subscribe to the new combined selection signal
        const connection = manager.onSelectionCombined.connect(({ unit }) => {
            // unit can be null → fall back to empty object
            setUnitProperties((unit ?? {}) as UnitProperties);
        });

        return () => {
            connection.disconnect();
        };
    }, [manager]);

    const handleSplit = (group1: number, group2: number) => {
        if (group1 > 0 && group2 > 0) {
            manager.Split(group1);
        }
    };

    const closeAllExcept = (exceptSection: string) => {
        Object.entries(setOpenRefs.current).forEach(([section, setOpen]) => {
            if (section !== exceptSection && setOpen) {
                setOpen(false);
            }
        });
    };

    return (
        <Box
            sx={{
                position: "relative",
                display: "flex",
                flex: "1 1 auto",
                minHeight: 0,
                width: "100%",
            }}
        >
            {/* @ts-ignore: style params */}
            <ListItem
                ref={scrollViewportRef}
                data-sandbox-scroll-region="true"
                style={{ "--List-nestedInsetStart": "0px" }}
                nested
                sx={{
                    display: "flex",
                    flexDirection: "column",
                    flex: "1 1 auto",
                    minHeight: 0,
                    overflowY: "auto",
                    overflowX: "hidden",
                    overscrollBehavior: "contain",
                    scrollbarWidth: "none",
                    "&::-webkit-scrollbar": { display: "none", width: 0, height: 0 },
                    // Let the active framed section keep its natural content height. Otherwise flexbox shrinks
                    // the frame itself, whose overflow:hidden then clips the bottom before this parent can
                    // expose a scrollbar or make the both-panels fit decision.
                    "& > *": {
                        flexShrink: 0,
                        width: `calc(100% - ${scrollRailExtensionPx - SANDBOX_LEGACY_SCROLLBAR_GUTTER_PX}px)`,
                    },
                    gap: 1.5,
                    "@media (max-height: 800px)": {
                        gap: 0.5,
                    },
                    width: `calc(98% + ${scrollRailExtensionPx}px)`,
                    ml: "2%",
                    mr: 0,
                    p: 0,
                    fontFamily: hocFontFamily,
                    fontWeight: 460,
                    fontSynthesis: "weight",
                    "& .MuiTypography-root, & input, & label": {
                        fontWeight: 460,
                        fontSynthesis: "weight",
                    },
                }}
            >
                <Box sx={hocSidebarSectionSx("army")}>
                    <Toggler
                        defaultExpanded={true}
                        renderToggle={({ open, setOpen }) => {
                            setOpenRefs.current.army = setOpen;
                            return (
                                <ListItemButton
                                    onClick={() => {
                                        if (!open) {
                                            closeAllExcept("army");
                                        }
                                        setOpen(!open);
                                    }}
                                    sx={{
                                        ...hocSidebarSectionHeaderSx,
                                        px: 1.25,
                                        backgroundColor: "transparent",
                                        transform: open ? "scale(1.012)" : "scale(1)",
                                    }}
                                >
                                    <Box
                                        component="img"
                                        src={images.army_icon}
                                        sx={{ ...sectionIconSx, ml: "-4px", mr: "4px", opacity: open ? 1 : 0.72 }}
                                    />
                                    <ListItemContent>
                                        <Typography
                                            level="title-sm"
                                            sx={{
                                                ...sectionTitleSx,
                                                color: open ? hocColors.gold : sectionTitleSx.color,
                                            }}
                                        >
                                            Army
                                        </Typography>
                                    </ListItemContent>
                                    <Box component="img" src={images.tr_up} sx={chevronSx(open)} />
                                </ListItemButton>
                            );
                        }}
                    >
                        <List>
                            <UnitInputAndActions
                                selectedUnitCount={unitProperties.amount_alive || 0}
                                selectedTeamType={unitProperties.team}
                            />
                            <UnitSplitter totalUnits={unitProperties.amount_alive || 0} onSplit={handleSplit} />
                        </List>
                    </Toggler>
                </Box>

                <Box sx={hocSidebarSectionSx("board")}>
                    <Toggler
                        defaultExpanded={false}
                        renderToggle={({ open, setOpen }) => {
                            setOpenRefs.current.map = setOpen;
                            return (
                                <ListItemButton
                                    onClick={() => {
                                        if (!open) {
                                            closeAllExcept("map");
                                        }
                                        setOpen(!open);
                                    }}
                                    sx={{
                                        ...hocSidebarSectionHeaderSx,
                                        px: 1.25,
                                        backgroundColor: "transparent",
                                        transform: open ? "scale(1.012)" : "scale(1)",
                                    }}
                                >
                                    <Box
                                        component="img"
                                        src={images.board_icon}
                                        sx={{ ...sectionIconSx, ml: "-4px", mr: "4px", opacity: open ? 1 : 0.72 }}
                                    />
                                    <ListItemContent>
                                        <Typography
                                            level="title-sm"
                                            sx={{
                                                ...sectionTitleSx,
                                                color: open ? hocColors.gold : sectionTitleSx.color,
                                            }}
                                        >
                                            Board
                                        </Typography>
                                    </ListItemContent>
                                    <Box component="img" src={images.tr_up} sx={chevronSx(open)} />
                                </ListItemButton>
                            );
                        }}
                    >
                        <List>
                            <MapSettingsRadioButtons />
                        </List>
                    </Toggler>
                </Box>

                <Box sx={hocSidebarSectionSx("team")}>
                    <Toggler
                        defaultExpanded={false}
                        renderToggle={({ open, setOpen }) => {
                            setOpenRefs.current.red = setOpen;
                            return (
                                <ListItemButton
                                    onClick={() => {
                                        if (!open) {
                                            closeAllExcept("red");
                                        }
                                        setOpen(!open);
                                    }}
                                    sx={{
                                        ...hocSidebarSectionHeaderSx,
                                        px: 1.25,
                                        columnGap: "6px",
                                        backgroundColor: "transparent",
                                        transform: open ? "scale(1.012)" : "scale(1)",
                                    }}
                                >
                                    <Box
                                        component="img"
                                        src={images.flag_red_icon}
                                        sx={{
                                            ...teamFlagSx,
                                            filter: "saturate(1.38) brightness(1.28) contrast(1.06)",
                                            // The flag IS the team colour — it is what tells Reds from Greens at a
                                            // glance. Graying it while the section is closed (which the Army and
                                            // Board icons do, where colour carries nothing) left both sections
                                            // reading as the same slate flag. Only the dimming is kept.
                                            opacity: open ? 1 : teamFlagSx.opacity,
                                        }}
                                    />
                                    <ListItemContent sx={teamTitleSlotSx}>
                                        <Typography
                                            level="title-sm"
                                            sx={{ ...sectionTitleSx, color: open ? "#dc9a78" : sectionTitleSx.color }}
                                        >
                                            Red
                                        </Typography>
                                    </ListItemContent>
                                    <Box component="img" src={images.tr_up} sx={chevronSx(open)} />
                                </ListItemButton>
                            );
                        }}
                    >
                        <List>
                            <Box sx={expandedTeamSynergyRowSx}>
                                <SynergySlots teamType={TeamVals.UPPER} size="clamp(22px, 1.75vw, 34px)" />
                            </Box>
                            <SandboxToggleContainer side="red" teamType={TeamVals.UPPER} />
                        </List>
                    </Toggler>
                </Box>

                <Box sx={hocSidebarSectionSx("team")}>
                    <Toggler
                        defaultExpanded={false}
                        renderToggle={({ open, setOpen }) => {
                            setOpenRefs.current.green = setOpen;
                            return (
                                <ListItemButton
                                    onClick={() => {
                                        if (!open) {
                                            closeAllExcept("green");
                                        }
                                        setOpen(!open);
                                    }}
                                    sx={{
                                        ...hocSidebarSectionHeaderSx,
                                        px: 1.25,
                                        columnGap: "6px",
                                        backgroundColor: "transparent",
                                        transform: open ? "scale(1.012)" : "scale(1)",
                                    }}
                                >
                                    <Box
                                        component="img"
                                        src={images.flag_green_icon}
                                        sx={{
                                            ...teamFlagSx,
                                            filter: "saturate(1.48) brightness(1.35) contrast(1.04)",
                                            // The flag IS the team colour — it is what tells Reds from Greens at a
                                            // glance. Graying it while the section is closed (which the Army and
                                            // Board icons do, where colour carries nothing) left both sections
                                            // reading as the same slate flag. Only the dimming is kept.
                                            opacity: open ? 1 : teamFlagSx.opacity,
                                        }}
                                    />
                                    <ListItemContent sx={teamTitleSlotSx}>
                                        <Typography
                                            level="title-sm"
                                            sx={{ ...sectionTitleSx, color: open ? "#9fc487" : sectionTitleSx.color }}
                                        >
                                            Green
                                        </Typography>
                                    </ListItemContent>
                                    <Box component="img" src={images.tr_up} sx={chevronSx(open)} />
                                </ListItemButton>
                            );
                        }}
                    >
                        <List>
                            <Box sx={expandedTeamSynergyRowSx}>
                                <SynergySlots teamType={TeamVals.LOWER} size="clamp(22px, 1.75vw, 34px)" />
                            </Box>
                            <SandboxToggleContainer side="green" teamType={TeamVals.LOWER} />
                        </List>
                    </Toggler>
                </Box>
            </ListItem>
            <ImageScrollbar
                viewportRef={scrollViewportRef}
                top="0px"
                right={`-${scrollRailExtensionPx}px`}
                bottom="0px"
                thumbCenterPercent={23}
                thumbWidthPx={7.74}
            />
        </Box>
    );
};

export default FightControlToggler;
