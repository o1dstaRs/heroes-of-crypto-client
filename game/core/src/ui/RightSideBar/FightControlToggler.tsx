import { TeamType, UnitProperties } from "@heroesofcrypto/common";
import React, { useEffect, useState, useRef } from "react";
import { useTheme } from "@mui/joy/styles";
import List from "@mui/joy/List";
import ListItem from "@mui/joy/ListItem";
import ListItemButton from "@mui/joy/ListItemButton";
import ListItemContent from "@mui/joy/ListItemContent";
import Typography from "@mui/joy/Typography";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import TerrainRoundedIcon from "@mui/icons-material/TerrainRounded";
import GroupAddRoundedIcon from "@mui/icons-material/GroupAddRounded";
import { useManager } from "../../manager";
import { RedFlagIcon } from "../svg/flag_red";
import { GreenFlagIcon } from "../svg/flag_green";
import UnitInputAndActions from "./UnitInputAndActions";
import Toggler from "../Toggler";
import MapSettingsRadioButtons from "./MapSettingsRadioButtons";
import SideToggleContainer from "./SideToggleContainer";
import UnitSplitter from "./UnitSplitter";

const FightControlToggler: React.FC = () => {
    const [unitProperties, setUnitProperties] = useState({} as UnitProperties);
    const theme = useTheme();
    const manager = useManager();

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
        const connection = manager.onUnitSelected.connect(setUnitProperties);
        return () => {
            connection.disconnect();
        };
    });

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
                                backgroundColor: open
                                    ? theme.palette.mode === "dark"
                                        ? "rgba(255, 255, 255, 0.1)"
                                        : "rgba(0, 0, 0, 0.1)"
                                    : "inherit",
                                transition: "background-color 0.3s",
                            }}
                        >
                            <GroupAddRoundedIcon />
                            <ListItemContent>
                                <Typography level="title-sm">Army control</Typography>
                            </ListItemContent>
                            <KeyboardArrowDownIcon sx={{ transform: open ? "rotate(180deg)" : "none" }} />
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
                                backgroundColor: open
                                    ? theme.palette.mode === "dark"
                                        ? "rgba(255, 255, 255, 0.1)"
                                        : "rgba(0, 0, 0, 0.1)"
                                    : "inherit",
                                transition: "background-color 0.3s",
                            }}
                        >
                            <TerrainRoundedIcon />
                            <ListItemContent>
                                <Typography level="title-sm">Map settings</Typography>
                            </ListItemContent>
                            <KeyboardArrowDownIcon sx={{ transform: open ? "rotate(180deg)" : "none" }} />
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
                                backgroundColor: open
                                    ? theme.palette.mode === "dark"
                                        ? "rgba(255, 255, 255, 0.1)"
                                        : "rgba(0, 0, 0, 0.1)"
                                    : "inherit",
                                transition: "background-color 0.3s",
                            }}
                        >
                            <RedFlagIcon />
                            <ListItemContent>
                                <Typography level="title-sm">Red side</Typography>
                            </ListItemContent>
                            <KeyboardArrowDownIcon sx={{ transform: open ? "rotate(180deg)" : "none" }} />
                        </ListItemButton>
                    );
                }}
            >
                <List>
                    <SideToggleContainer side="red" teamType={TeamType.UPPER} unitFaction={unitProperties.faction} />
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
                                backgroundColor: open
                                    ? theme.palette.mode === "dark"
                                        ? "rgba(255, 255, 255, 0.1)"
                                        : "rgba(0, 0, 0, 0.1)"
                                    : "inherit",
                                transition: "background-color 0.3s",
                            }}
                        >
                            <GreenFlagIcon />
                            <ListItemContent>
                                <Typography level="title-sm">Green side</Typography>
                            </ListItemContent>
                            <KeyboardArrowDownIcon sx={{ transform: open ? "rotate(180deg)" : "none" }} />
                        </ListItemButton>
                    );
                }}
            >
                <List>
                    <SideToggleContainer side="green" teamType={TeamType.LOWER} unitFaction={unitProperties.faction} />
                </List>
            </Toggler>
        </ListItem>
    );
};

export default FightControlToggler;
