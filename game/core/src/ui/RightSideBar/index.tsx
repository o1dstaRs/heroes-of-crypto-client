import { IDamageStatistic } from "@heroesofcrypto/common";
import { TextareaAutosize } from "@mui/base/TextareaAutosize";
import CalendarTodayRoundedIcon from "@mui/icons-material/CalendarTodayRounded";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import QueryStatsRoundedIcon from "@mui/icons-material/QueryStatsRounded";
import Box from "@mui/joy/Box";
import Divider from "@mui/joy/Divider";
import LinearProgress from "@mui/joy/LinearProgress";
import List from "@mui/joy/List";
import ListItem from "@mui/joy/ListItem";
import ListItemButton from "@mui/joy/ListItemButton";
import ListItemContent from "@mui/joy/ListItemContent";
import Sheet from "@mui/joy/Sheet";
import Typography from "@mui/joy/Typography";
import React, { useEffect, useState } from "react";
import { useManager } from "../../manager";
import Toggler from "../Toggler";
import { EDGES_SIZE } from "../../statics";
import FightControlToggler from "./FightControlToggler";

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
            manager.HomeCamera();
        };

        const handleZoom = () => {
            adjustBarSize();
            manager.HomeCamera();
        };

        const handleFullscreenChange = () => {
            adjustBarSize();
            manager.HomeCamera();
        };

        window.addEventListener("resize", handleResize);
        window.addEventListener("wheel", handleZoom);
        document.addEventListener("fullscreenchange", handleFullscreenChange);

        return () => {
            window.removeEventListener("resize", handleResize);
            window.removeEventListener("wheel", handleZoom);
            document.removeEventListener("fullscreenchange", handleFullscreenChange);
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
            </Box>
        </Sheet>
    );
}
