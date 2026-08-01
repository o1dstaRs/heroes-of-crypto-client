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
// The sandbox mounts the SAME expanded-card picker as ranked (SideToggleContainer): the owner asked
// for the pre-redesign sidebar back, and that component is it — cards stack one per row in the narrow
// panel via its container query.
import SideToggleContainer from "./SideToggleContainer";
import { SynergySlots } from "./SynergySlots";
import UnitSplitter from "./UnitSplitter";

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
        <ListItem style={{ "--List-nestedInsetStart": "0px" }} nested>
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
                                py: 2, // 50% bigger Y-wise
                                backgroundColor: open
                                    ? "rgba(255, 143, 0, 0.1)" // Gold tint
                                    : "inherit",
                                transition: "background-color 0.3s",
                                "&:hover": {
                                    backgroundColor: open ? "rgba(255, 143, 0, 0.15)" : "rgba(255, 255, 255, 0.05)",
                                },
                            }}
                        >
                            <Box
                                component="img"
                                src={images.army_icon}
                                sx={{
                                    width: "36px",
                                    height: "36px",
                                    filter: open ? "none" : "grayscale(100%)", // Optional: grayscale when closed
                                    opacity: open ? 1 : 0.7,
                                }}
                            />
                            <ListItemContent>
                                <Typography
                                    level="title-sm"
                                    sx={{
                                        color: open ? "#FF8F00" : "inherit",
                                        fontWeight: open ? "xl" : "md",
                                    }}
                                >
                                    Army
                                </Typography>
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
                                        : "none", // Gold filter approximation or just let it be
                                }}
                            />
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
                                py: 2, // 50% bigger Y-wise
                                backgroundColor: open
                                    ? "rgba(255, 143, 0, 0.1)" // Gold tint
                                    : "inherit",
                                transition: "background-color 0.3s",
                                "&:hover": {
                                    backgroundColor: open ? "rgba(255, 143, 0, 0.15)" : "rgba(255, 255, 255, 0.05)",
                                },
                            }}
                        >
                            <Box
                                component="img"
                                src={images.board_icon}
                                sx={{
                                    width: "36px",
                                    height: "36px",
                                    filter: open ? "none" : "grayscale(100%)",
                                    opacity: open ? 1 : 0.7,
                                }}
                            />
                            <ListItemContent>
                                <Typography
                                    level="title-sm"
                                    sx={{
                                        color: open ? "#FF8F00" : "inherit",
                                        fontWeight: open ? "xl" : "md",
                                    }}
                                >
                                    Board
                                </Typography>
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
                    );
                }}
            >
                <List>
                    <MapSettingsRadioButtons />
                </List>
            </Toggler>

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
                                py: 2,
                                backgroundColor: open ? "rgba(255, 143, 0, 0.1)" : "inherit",
                                transition: "background-color 0.3s",
                                "&:hover": {
                                    backgroundColor: open ? "rgba(255, 143, 0, 0.15)" : "rgba(255, 255, 255, 0.05)",
                                },
                            }}
                        >
                            <Box
                                component="img"
                                src={images.flag_red_icon}
                                sx={{
                                    width: "36px",
                                    height: "36px",
                                    // The flag IS the team colour — it is what tells Reds from Greens at a
                                    // glance. Graying it while the section is closed (which the Army and
                                    // Board icons do, where colour carries nothing) left both sections
                                    // reading as the same slate flag. Only the dimming is kept.
                                    opacity: open ? 1 : 0.85,
                                }}
                            />
                            <ListItemContent>
                                <Typography
                                    level="title-sm"
                                    sx={{
                                        color: open ? "#FF8F00" : "inherit",
                                        fontWeight: open ? "xl" : "md",
                                    }}
                                >
                                    Reds
                                </Typography>
                            </ListItemContent>
                            {/* The four racial synergies, right of the flag: visible whether the section is open
                                or shut, because they are army state rather than a setting inside it. */}
                            <SynergySlots teamType={TeamVals.UPPER} />
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
                    );
                }}
            >
                <List>
                    <SideToggleContainer side="red" teamType={TeamVals.UPPER} unitFaction={unitProperties.faction} />
                </List>
            </Toggler>

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
                                py: 2,
                                backgroundColor: open ? "rgba(255, 143, 0, 0.1)" : "inherit",
                                transition: "background-color 0.3s",
                                "&:hover": {
                                    backgroundColor: open ? "rgba(255, 143, 0, 0.15)" : "rgba(255, 255, 255, 0.05)",
                                },
                            }}
                        >
                            <Box
                                component="img"
                                src={images.flag_green_icon}
                                sx={{
                                    width: "36px",
                                    height: "36px",
                                    // The flag IS the team colour — it is what tells Reds from Greens at a
                                    // glance. Graying it while the section is closed (which the Army and
                                    // Board icons do, where colour carries nothing) left both sections
                                    // reading as the same slate flag. Only the dimming is kept.
                                    opacity: open ? 1 : 0.85,
                                }}
                            />
                            <ListItemContent>
                                <Typography
                                    level="title-sm"
                                    sx={{
                                        color: open ? "#FF8F00" : "inherit",
                                        fontWeight: open ? "xl" : "md",
                                    }}
                                >
                                    Greens
                                </Typography>
                            </ListItemContent>
                            {/* The four racial synergies, right of the flag: visible whether the section is open
                                or shut, because they are army state rather than a setting inside it. */}
                            <SynergySlots teamType={TeamVals.LOWER} />
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
                    );
                }}
            >
                <List>
                    <SideToggleContainer side="green" teamType={TeamVals.LOWER} unitFaction={unitProperties.faction} />
                </List>
            </Toggler>
        </ListItem>
    );
};

export default FightControlToggler;
