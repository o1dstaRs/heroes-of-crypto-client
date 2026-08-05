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
import Toggler from "../Toggler";
import MapSettingsRadioButtons from "./MapSettingsRadioButtons";
// Sandbox has its own picker. SideToggleContainer is the ranked draft's layout: every augment card is
// expanded at once, which in this narrow panel stacks three tall radio groups and pushes the artifacts and
// the other team's section off the bottom. Sandbox wants the pre-redesign shape instead — one row of augment
// icons, and only the CHOSEN augment's options underneath — so it mounts SandboxToggleContainer, where that
// panel and the two artifact tiers form a single accordion (opening one closes the others, all shut at rest).
import SandboxToggleContainer from "./SandboxToggleContainer";
import { SynergySlots } from "./SynergySlots";
import UnitSplitter from "./UnitSplitter";
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
    fontWeight: 800,
    fontSize: "1.05rem",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "#d8c29c",
    textShadow: "0 2px 2px #000",
} as const;

const sectionIconSx = {
    width: "41.4px",
    height: "41.4px",
    objectFit: "contain",
    filter: "sepia(.18) saturate(.88) drop-shadow(0 2px 2px rgba(0,0,0,.8))",
} as const;

// Compact team pennants leave one uninterrupted row for all eight synergy seals.
const teamFlagSx = {
    width: "41.4px",
    height: "48.3px",
    flex: "0 0 41.4px",
    objectFit: "contain",
    filter: "none",
    opacity: 0.9,
} as const;

const teamTitleSlotSx = {
    flex: "0 0 72px",
    width: "72px",
    minWidth: 0,
} as const;

const teamSynergySlotSx = {
    flex: "1 1 auto",
    minWidth: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
} as const;

const chevronSx = (open: boolean) => ({
    width: "12px",
    transform: open ? "none" : "rotate(180deg)",
    transition: "transform 0.2s",
    filter: "sepia(1) saturate(.55) brightness(1.18)",
});

const FightControlToggler: React.FC = () => {
    const [unitProperties, setUnitProperties] = useState({} as UnitProperties);
    const manager = usePixiManager();

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
        /* @ts-ignore: style params */
        <ListItem
            style={{ "--List-nestedInsetStart": "0px" }}
            nested
            sx={{
                display: "flex",
                flexDirection: "column",
                gap: 1.5,
                "@media (max-height: 800px)": {
                    gap: 0.5,
                },
                // Keep the image-backed button edges and the section frame fully inside the sidebar.
                width: "98%",
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
                                        sx={{ ...sectionTitleSx, color: open ? hocColors.gold : sectionTitleSx.color }}
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
                                        sx={{ ...sectionTitleSx, color: open ? hocColors.gold : sectionTitleSx.color }}
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
                                {/* The four racial synergies, right of the flag: visible whether the section is open
                                or shut, because they are army state rather than a setting inside it. */}
                                <Box sx={teamSynergySlotSx}>
                                    <SynergySlots teamType={TeamVals.UPPER} size="clamp(16px, 1.35vw, 28px)" />
                                </Box>
                                <Box component="img" src={images.tr_up} sx={chevronSx(open)} />
                            </ListItemButton>
                        );
                    }}
                >
                    <List>
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
                                {/* The four racial synergies, right of the flag: visible whether the section is open
                                or shut, because they are army state rather than a setting inside it. */}
                                <Box sx={teamSynergySlotSx}>
                                    <SynergySlots teamType={TeamVals.LOWER} size="clamp(16px, 1.35vw, 28px)" />
                                </Box>
                                <Box component="img" src={images.tr_up} sx={chevronSx(open)} />
                            </ListItemButton>
                        );
                    }}
                >
                    <List>
                        <SandboxToggleContainer side="green" teamType={TeamVals.LOWER} />
                    </List>
                </Toggler>
            </Box>
        </ListItem>
    );
};

export default FightControlToggler;
