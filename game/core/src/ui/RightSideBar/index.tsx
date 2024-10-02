import { TextareaAutosize } from "@mui/base/TextareaAutosize";
import CalendarTodayRoundedIcon from "@mui/icons-material/CalendarTodayRounded";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import QueryStatsRoundedIcon from "@mui/icons-material/QueryStatsRounded";
import TerrainRoundedIcon from "@mui/icons-material/TerrainRounded";
import GroupAddRoundedIcon from "@mui/icons-material/GroupAddRounded";
import Radio from "@mui/joy/Radio";
import RadioGroup from "@mui/joy/RadioGroup";
import FormControl from "@mui/joy/FormControl";
import Box from "@mui/joy/Box";
import Button from "@mui/joy/Button";
import Divider from "@mui/joy/Divider";
import LinearProgress from "@mui/joy/LinearProgress";
import List from "@mui/joy/List";
import ListItem from "@mui/joy/ListItem";
import ListItemButton from "@mui/joy/ListItemButton";
import ListItemContent from "@mui/joy/ListItemContent";
import Sheet from "@mui/joy/Sheet";
import Stack from "@mui/joy/Stack";
import Typography from "@mui/joy/Typography";
import React, { useEffect, useState } from "react";
import Slider from "@mui/joy/Slider";
import { UnitProperties, GridType, ToGridType, TeamType } from "@heroesofcrypto/common";

import { useManager } from "../../manager";
import { IDamageStatistic } from "../../stats/damage_stats";
import Toggler from "../Toggler";
import { EDGES_SIZE } from "../../statics";
import SideToggleContainer from "./SideToggleContainer";
import { RedFlagIcon } from "../svg/flag_red";
import { GreenFlagIcon } from "../svg/flag_green";
import UnitInputAndActions from "./UnitInputActions";

interface IDamageStatsTogglerProps {
    unitStatsElements: React.ReactNode;
}

interface ICalendarInfoProps {
    day: number;
    week: number;
    daysUntilNextFight: number;
}

const DamageStatsToggler: React.FC<IDamageStatsTogglerProps> = ({
    unitStatsElements,
}: {
    unitStatsElements: React.ReactNode;
}) => (
    /* @ts-ignore: style params */
    <ListItem style={{ "--List-nestedInsetStart": "0px" }} nested>
        <Toggler
            renderToggle={({ open, setOpen }) => (
                <ListItemButton onClick={() => setOpen(!open)}>
                    <QueryStatsRoundedIcon />
                    <ListItemContent>
                        <Typography level="title-sm">Damage</Typography>
                    </ListItemContent>
                    <KeyboardArrowDownIcon sx={{ transform: open ? "rotate(180deg)" : "none" }} />
                </ListItemButton>
            )}
        >
            <List sx={{ gap: 0 }}>{unitStatsElements}</List>
        </Toggler>
    </ListItem>
);

const MapSettingsRadioButtons = () => {
    const [gridType, setGridType] = useState<GridType>(GridType.NORMAL);
    const manager = useManager();

    useEffect(() => {
        const connection = manager.onGridTypeChanged.connect((newGridType: GridType) => {
            setGridType(newGridType);
        });

        return () => {
            connection.disconnect();
        };
    }, [manager]);

    const handleMapSettingChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const newGridType = ToGridType[event.target.value.toString()];
        setGridType(newGridType);
        manager.SetGridType(newGridType);
    };

    const handleRandomButtonClick = () => {
        // Filter out NO_TYPE from the grid types
        const availableGridTypes = [
            GridType.NORMAL,
            GridType.BLOCK_CENTER,
            GridType.WATER_CENTER,
            GridType.LAVA_CENTER,
        ];

        // Randomly select a grid type from the filtered list
        const randomGridType = availableGridTypes[Math.floor(Math.random() * availableGridTypes.length)];

        setGridType(randomGridType);
        manager.SetGridType(randomGridType);
    };

    return (
        <Box sx={{ padding: 1, display: "flex" }}>
            {/* Left side: Radio buttons */}
            <Box sx={{ flex: 1 }}>
                <FormControl>
                    <RadioGroup
                        aria-label="map-settings"
                        name="map-settings"
                        value={gridType}
                        onChange={handleMapSettingChange}
                    >
                        <Radio value={GridType.NORMAL} label="Normal" />
                        <Radio value={GridType.BLOCK_CENTER} label="Mountain" />
                        <Radio value={GridType.WATER_CENTER} label="Water" />
                        <Radio value={GridType.LAVA_CENTER} label="Lava" />
                    </RadioGroup>
                </FormControl>
            </Box>

            {/* Right side: Random button */}
            <Box sx={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center" }}>
                <Button
                    variant="outlined"
                    color="primary"
                    onClick={handleRandomButtonClick}
                    sx={{ height: "100%", width: "100%" }}
                >
                    Random
                </Button>
            </Box>
        </Box>
    );
};

const CalendarInfo: React.FC<ICalendarInfoProps> = ({ day, week, daysUntilNextFight }) => (
    <>
        <Divider />
        <Box sx={{ display: "flex", gap: 1, alignItems: "center", paddingTop: 2 }}>
            <CalendarTodayRoundedIcon />
            <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography level="title-sm" sx={{ fontSize: 13 }}>
                    Day {day}
                </Typography>
                <Typography level="body-xs">Week {week}</Typography>
            </Box>
            <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography level="title-sm" sx={{ fontSize: 13 }}>
                    Next fight in
                </Typography>
                <Typography level="body-xs">{daysUntilNextFight} days</Typography>
            </Box>
        </Box>
    </>
);

interface IUnitSplitterProps {
    totalUnits: number;
    onSplit: (split1: number, split2: number) => void;
}

const UnitSplitter: React.FC<IUnitSplitterProps> = ({ totalUnits, onSplit }) => {
    const [splitValue, setSplitValue] = useState(1); // Start with minimum value

    // Reset slider value whenever totalUnits changes
    useEffect(() => {
        setSplitValue(1); // Reset to minimum value when a new unit is selected
    }, [totalUnits]);

    const handleSliderChange = (event: Event, newValue: number | number[]) => {
        setSplitValue(newValue as number);
    };

    const handleAcceptSplit = () => {
        const group1 = splitValue;
        const group2 = totalUnits - splitValue;
        onSplit(group1, group2);
    };

    return (
        <Box sx={{ width: "100%", maxWidth: 400, marginTop: 3 }}>
            <Stack spacing={2} alignItems="center">
                <Box sx={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
                    <Typography level="body-sm">{splitValue}</Typography>
                    <Typography level="body-sm">{totalUnits - splitValue}</Typography>
                </Box>

                <Slider
                    sx={{
                        padding: "4px 0",
                        height: 10, // Increase the height of the track (thickness)
                        "& .MuiSlider-thumb": {
                            width: 20, // Increase thumb size
                            height: 20,
                        },
                        "& .MuiSlider-rail": {
                            height: 10, // Increase rail thickness
                        },
                        "& .MuiSlider-track": {
                            height: 10, // Increase track thickness
                        },
                    }}
                    value={splitValue}
                    onChange={handleSliderChange}
                    min={1}
                    max={totalUnits - 1}
                    step={1}
                    aria-label="Unit Split Slider"
                />
            </Stack>
            <Stack direction="row" spacing={2} sx={{ marginTop: 2, marginBottom: 2 }}>
                <Button variant="solid" color="primary" onClick={handleAcceptSplit} sx={{ flexGrow: 1 }}>
                    Split
                </Button>
            </Stack>
        </Box>
    );
};

const FightControlToggler: React.FC = () => {
    const [unitProperties, setUnitProperties] = useState({} as UnitProperties);

    const manager = useManager();

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

    return (
        /* @ts-ignore: style params */
        <ListItem style={{ "--List-nestedInsetStart": "0px" }} nested>
            <Toggler
                renderToggle={({ open, setOpen }) => (
                    <ListItemButton onClick={() => setOpen(!open)}>
                        <GroupAddRoundedIcon />
                        <ListItemContent>
                            <Typography level="title-sm">Army control</Typography>
                        </ListItemContent>
                        <KeyboardArrowDownIcon sx={{ transform: open ? "rotate(180deg)" : "none" }} />
                    </ListItemButton>
                )}
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
                renderToggle={({ open, setOpen }) => (
                    <ListItemButton onClick={() => setOpen(!open)}>
                        <TerrainRoundedIcon />
                        <ListItemContent>
                            <Typography level="title-sm">Map settings</Typography>
                        </ListItemContent>
                        <KeyboardArrowDownIcon sx={{ transform: open ? "rotate(180deg)" : "none" }} />
                    </ListItemButton>
                )}
            >
                <List>
                    <MapSettingsRadioButtons />
                </List>
            </Toggler>
            <Toggler
                renderToggle={({ open, setOpen }) => (
                    <ListItemButton onClick={() => setOpen(!open)}>
                        <RedFlagIcon />
                        <ListItemContent>
                            <Typography level="title-sm">Red side</Typography>
                        </ListItemContent>
                        <KeyboardArrowDownIcon sx={{ transform: open ? "rotate(180deg)" : "none" }} />
                    </ListItemButton>
                )}
                defaultExpanded={false} // Close by default
            >
                <List>
                    <SideToggleContainer side="red" teamType={TeamType.UPPER} />
                </List>
            </Toggler>
            <Toggler
                renderToggle={({ open, setOpen }) => (
                    <ListItemButton onClick={() => setOpen(!open)}>
                        <GreenFlagIcon />
                        <ListItemContent>
                            <Typography level="title-sm">Green side</Typography>
                        </ListItemContent>
                        <KeyboardArrowDownIcon sx={{ transform: open ? "rotate(180deg)" : "none" }} />
                    </ListItemButton>
                )}
                defaultExpanded={false} // Close by default
            >
                <List>
                    <SideToggleContainer side="green" teamType={TeamType.LOWER} />
                </List>
            </Toggler>
        </ListItem>
    );
};

export default function RightSideBar({ gameStarted }: { gameStarted: boolean }) {
    const [unitDamageStatistics, setUnitDamageStatistics] = useState([] as IDamageStatistic[]);
    const manager = useManager();
    const [barSize, setBarSize] = useState(280);

    const adjustBarSize = () => {
        const additionalBoardPixels = gameStarted ? 0 : 512;
        const edgesSize = gameStarted ? 0 : EDGES_SIZE;
        const widthRatio = window.innerWidth / (2048 + edgesSize + additionalBoardPixels);
        const heightRatio = window.innerHeight / (2048 + edgesSize);

        const scaleRatio = Math.min(widthRatio, heightRatio);
        const scaledBoardSize = (2048 + additionalBoardPixels) * scaleRatio;

        const edgeSizeWidth = gameStarted ? 0 : edgesSize / 2;
        const rightBarEndAtBoard = (window.innerWidth - scaledBoardSize) / 2;
        setBarSize(rightBarEndAtBoard > edgeSizeWidth ? rightBarEndAtBoard : edgeSizeWidth);
    };

    useEffect(() => {
        adjustBarSize();
        manager.HomeCamera();

        const handleResize = () => {
            adjustBarSize();
        };

        window.addEventListener("resize", handleResize);

        return () => {
            window.removeEventListener("resize", handleResize);
        };
    }, [gameStarted]);

    const [attackText, setAttackText] = useState("");

    useEffect(() => {
        const connection1 = manager.onAttackLanded.connect(setAttackText);
        return () => {
            connection1.disconnect();
        };
    });

    useEffect(() => {
        const connection2 = manager.onDamageStatisticsUpdated.connect(setUnitDamageStatistics);
        return () => {
            connection2.disconnect();
        };
    });

    const unitStats: IDamageStatistic[] = [];
    let maxDmg = Number.MIN_SAFE_INTEGER;
    for (const s of unitDamageStatistics) {
        let { unitName } = s;
        if (s.unitName.includes(" ")) {
            const stringParts = s.unitName.split(/\s/);
            unitName = `${stringParts[0][0]}. ${stringParts[1]}`;
        }
        unitStats.push({ unitName, damage: s.damage, team: s.team });
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
                zIndex: 1,
                height: "100dvh",
                width: `${barSize}px`,
                top: 0,
                right: 0,
                p: 2,
                // flexShrink: 0,
                display: "flex",
                flexDirection: "column",
                gap: 2,
                borderRight: "1px solid",
                borderColor: "divider",
                overflowY: "auto", // Allow vertical scrolling
                overflowX: "hidden", // Prevent horizontal scrolling
            }}
        >
            <Box
                sx={{
                    minHeight: 0,
                    // overflow: "hidden auto",
                    flexGrow: 1,
                    display: "flex",
                    flexDirection: "column",
                }}
            >
                <List
                    size="sm"
                    sx={{
                        gap: 1,
                        "--List-nestedInsetStart": "30px",
                        "--ListItem-radius": (t) => t.vars.radius.sm,
                    }}
                >
                    {!gameStarted && <FightControlToggler />}
                    {gameStarted && <DamageStatsToggler unitStatsElements={unitStatsElements} />}
                    <Box sx={{ flexGrow: 1 }} />
                    <TextareaAutosize
                        placeholder="Fight log"
                        value={attackText}
                        style={{
                            width: "100%",
                            resize: "vertical",
                            overflow: "auto",
                            fontSize: "10px",
                        }}
                    />
                    <CalendarInfo day={1} week={1} daysUntilNextFight={2} />
                </List>

                {/* <List
                    size="sm"
                    sx={{
                        mt: "auto",
                        flexGrow: 0,
                        "--ListItem-radius": (theme) => theme.vars.radius.sm,
                        "--List-gap": "8px",
                        mb: 2,
                    }}
                /> */}
            </Box>
        </Sheet>
    );
}
