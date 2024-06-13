import { TextareaAutosize } from "@mui/base/TextareaAutosize";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import QueryStatsRoundedIcon from "@mui/icons-material/QueryStatsRounded";
import Box from "@mui/joy/Box";
import Divider from "@mui/joy/Divider";
import LinearProgress from "@mui/joy/LinearProgress";
import List from "@mui/joy/List";
import ListItem from "@mui/joy/ListItem";
import ListItemButton, { listItemButtonClasses } from "@mui/joy/ListItemButton";
import ListItemContent from "@mui/joy/ListItemContent";
import Sheet from "@mui/joy/Sheet";
import Typography from "@mui/joy/Typography";
import React, { useEffect, useState } from "react";

import { useManager } from "../../manager";
import { IDamageStatistic } from "../../stats/damage_stats";
import Toggler from "../Toggler";

export default function RightSideBar() {
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
                position: {
                    xs: "fixed",
                    // md: "sticky",
                },
                transform: {
                    xs: "translateX(calc(100% * (var(--SideNavigation-slideIn, 0) - 1)))",
                    md: "none",
                },
                transition: "transform 0.4s, width 0.4s",
                zIndex: 10000,
                height: "100dvh",
                width: "202px",
                top: 0,
                p: 2,
                flexShrink: 0,
                right: 0,
                display: "flex",
                flexDirection: "column",
                gap: 2,
                borderRight: "1px solid",
                borderColor: "divider",
            }}
        >
            <Box
                className="Sidebar-overlay"
                sx={{
                    position: "fixed",
                    zIndex: 9998,
                    top: 0,
                    left: 0,
                    width: "100vw",
                    height: "100vh",
                    opacity: "var(--SideNavigation-slideIn)",
                    backgroundColor: "var(--joy-palette-background-backdrop)",
                    transition: "opacity 0.4s",
                    transform: {
                        xs: "translateX(calc(100% * (var(--SideNavigation-slideIn, 0) - 1) + var(--SideNavigation-slideIn, 0) * var(--Sidebar-width, 0px)))",
                        lg: "translateX(-100%)",
                    },
                }}
                //        onClick={() => closeSidebar()}
                onClick={() => {}}
            />
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
                    {/* @ts-ignore: style params */}
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
