import { TextareaAutosize } from "@mui/base/TextareaAutosize";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import QueryStatsRoundedIcon from "@mui/icons-material/QueryStatsRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import Box from "@mui/joy/Box";
import Button from "@mui/joy/Button";
import Divider from "@mui/joy/Divider";
import Input from "@mui/joy/Input";
import LinearProgress from "@mui/joy/LinearProgress";
import List from "@mui/joy/List";
import ListItem from "@mui/joy/ListItem";
import ListItemButton, { listItemButtonClasses } from "@mui/joy/ListItemButton";
import ListItemContent from "@mui/joy/ListItemContent";
import Sheet from "@mui/joy/Sheet";
import Stack from "@mui/joy/Stack";
import Typography from "@mui/joy/Typography";
import React, { useEffect, useRef, useState } from "react";
import { UnitProperties } from "@heroesofcrypto/common";

import { useManager } from "../../manager";
import { IDamageStatistic } from "../../stats/damage_stats";
import Toggler from "../Toggler";

const DEFAULT_NUMBER_OF_UNITS_TO_ACCEPT = 1;

interface IDamageStatsTogglerProps {
    unitStatsElements: React.ReactNode;
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

const UnitInputAndActions = ({ selectedUnitCount }: { selectedUnitCount: number }) => {
    const changedRef = useRef(false);
    const [unitCount, setUnitCount] = useState("");

    const changeUnitCount = (value: string) => {
        changedRef.current = !!selectedUnitCount;
        setUnitCount(value);
    };

    if (selectedUnitCount > 0) {
        if (!changedRef.current) {
            const selectedUnitCountString = selectedUnitCount.toString();
            if (selectedUnitCountString !== unitCount) {
                setUnitCount(selectedUnitCount.toString());
            }
        }
    } else if (unitCount !== "") {
        setUnitCount("");
    }

    const manager = useManager();

    const handleAccept = (count: number) => {
        if (!Number.isNaN(count) && count > 0) {
            manager.m_settings.m_amountOfSelectedUnits = count;
            manager.Accept();
            setUnitCount(count.toString());
            changedRef.current = false;
        }
    };

    return (
        <Box sx={{ width: "100%", maxWidth: 400, marginTop: 2 }}>
            <Stack spacing={1}>
                <Input
                    type="number"
                    value={unitCount}
                    onChange={(e) => changeUnitCount(e.target.value)}
                    placeholder="# of units"
                    slotProps={{
                        input: {
                            min: DEFAULT_NUMBER_OF_UNITS_TO_ACCEPT,
                        },
                    }}
                />
                <Stack direction="row" spacing={2}>
                    <Button
                        variant="solid"
                        color="primary"
                        onClick={() => {
                            handleAccept(parseInt(unitCount) || DEFAULT_NUMBER_OF_UNITS_TO_ACCEPT);
                        }}
                        sx={{ flexGrow: 1 }}
                    >
                        Accept
                    </Button>
                    <Button
                        variant="outlined"
                        color="neutral"
                        onClick={() => {
                            manager.Clone();
                        }}
                        sx={{ flexGrow: 1 }}
                    >
                        Clone
                    </Button>
                </Stack>
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

    return (
        /* @ts-ignore: style params */
        <ListItem style={{ "--List-nestedInsetStart": "0px" }} nested>
            <Toggler
                renderToggle={({ open, setOpen }) => (
                    <ListItemButton onClick={() => setOpen(!open)}>
                        <TuneRoundedIcon />
                        <ListItemContent>
                            <Typography level="title-sm">Fight control</Typography>
                        </ListItemContent>
                        <KeyboardArrowDownIcon sx={{ transform: open ? "rotate(180deg)" : "none" }} />
                    </ListItemButton>
                )}
            >
                <UnitInputAndActions selectedUnitCount={unitProperties.amount_alive || 0} />
            </Toggler>
        </ListItem>
    );
};

export default function RightSideBar({ gameStarted }: { gameStarted: boolean }) {
    const [unitDamageStatistics, setUnitDamageStatistics] = useState([] as IDamageStatistic[]);
    const manager = useManager();

    useEffect(() => {
        const handleResize = () => {
            const ratio = window.innerWidth / window.innerHeight;
            manager.SwitchRightSideControlGroup(ratio >= 1.75);
            manager.HomeCamera();
        };

        window.addEventListener("resize", handleResize);

        return () => {
            window.removeEventListener("resize", handleResize);
        };
    }, []);

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

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    return (
        <Sheet
            className="Sidebar"
            sx={{
                position: "fixed",
                zIndex: 1,
                height: "100dvh",
                width: "220px",
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
                    overflow: "hidden auto",
                    flexGrow: 1,
                    display: "flex",
                    flexDirection: "column",
                    [`& .${listItemButtonClasses.root}`]: {
                        gap: 1.5,
                    },
                }}
            >
                <List
                    size="sm"
                    sx={{
                        gap: 1,
                        "--List-nestedInsetStart": "30px",
                        "--ListItem-radius": (theme) => theme.vars.radius.sm,
                    }}
                >
                    {!gameStarted && <FightControlToggler />}
                    {gameStarted && <DamageStatsToggler unitStatsElements={unitStatsElements} />}
                </List>

                <TextareaAutosize
                    placeholder="Fight log"
                    value={attackText}
                    style={{ width: "100%", resize: "vertical", overflow: "auto", fontSize: "10px" }}
                />

                <List
                    size="sm"
                    sx={{
                        mt: "auto",
                        flexGrow: 0,
                        "--ListItem-radius": (theme) => theme.vars.radius.sm,
                        "--List-gap": "8px",
                        mb: 2,
                    }}
                />
            </Box>
            <Divider />
        </Sheet>
    );
}
