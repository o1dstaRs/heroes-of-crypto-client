import { IDamageStatistic } from "@heroesofcrypto/common";
import Textarea from "@mui/joy/Textarea";
import Divider from "@mui/joy/Divider";
import Box from "@mui/joy/Box";
import LinearProgress from "@mui/joy/LinearProgress";
import List from "@mui/joy/List";
import ListItem from "@mui/joy/ListItem";
import ListItemButton from "@mui/joy/ListItemButton";
import ListItemContent from "@mui/joy/ListItemContent";
import Sheet from "@mui/joy/Sheet";
import Typography from "@mui/joy/Typography";
import React, { useEffect, useState, useCallback } from "react";
import { usePixiManager } from "../../pixi/PixiGameManager";
import { images } from "../../generated/image_imports";
const sidebarOverlayImage = new URL("../../../images/sidebar_overlay.webp", import.meta.url).toString(); // [NEW]
import Toggler from "../Toggler";
import FightControlToggler from "./FightControlToggler";
import { VersionDisplay } from "./VersionDisplay";
import { IWindowSize } from "../../scenes/VisibleState";

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

export default function RightSideBar({ gameStarted, windowSize }: { gameStarted: boolean; windowSize: IWindowSize }) {
    const [unitDamageStatistics, setUnitDamageStatistics] = useState([] as IDamageStatistic[]);
    const manager = usePixiManager();
    const [barSize, setBarSize] = useState(280);

    const adjustBarSize = useCallback(() => {
        const additionalBoardPixels = 0;
        const widthRatio = windowSize.width / (2048 + additionalBoardPixels);
        const heightRatio = windowSize.height / 2048;

        const scaleRatio = Math.min(widthRatio, heightRatio);
        const scaledBoardSize = (2048 + additionalBoardPixels) * scaleRatio;

        const rightBarEndAtBoard = (windowSize.width - scaledBoardSize) / 2;
        setBarSize(rightBarEndAtBoard > 0 ? rightBarEndAtBoard : 0);
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
                borderRight: "1px solid",
                borderColor: "divider",
                overflowY: "auto", // Allow vertical scrolling
                overflowX: "hidden", // Prevent horizontal scrolling
                // Background Image Overlay
                backgroundImage: `url(${sidebarOverlayImage})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
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
                        "--List-nestedInsetStart": "30px",
                        "--ListItem-radius": (t) => t.vars.radius.sm,
                    }}
                >
                    {!gameStarted && <FightControlToggler />}
                    {gameStarted && <DamageStatsToggler unitStatsElements={unitStatsElements} />}
                    <Box sx={{ flexGrow: 1 }} />
                    <Textarea
                        placeholder="Fight log"
                        value={attackText}
                        minRows={3}
                        maxRows={10}
                        variant="outlined"
                        sx={{
                            width: "100%",
                            fontSize: "10px",
                            resize: "vertical",
                            overflow: "auto",
                            color: "rgba(255, 143, 0, 0.8)", // Brighter default
                            borderColor: "rgba(255, 143, 0, 0.8)",
                            "--Textarea-focusedHighlight": "#FF8F00",
                            "--Textarea-focusedThickness": "2px",
                            "&:hover": {
                                borderColor: "#FF8F00",
                                color: "#FF8F00",
                            },
                            "&:focus-within": {
                                borderColor: "#FF8F00",
                                color: "#FF8F00",
                                "--Textarea-focusedHighlight": "#FF8F00",
                            },
                            "&::before": {
                                boxShadow: "none !important",
                                outline: "none !important",
                            },
                            "&.Mui-focused::before": {
                                boxShadow:
                                    "0 0 0 var(--Textarea-focusedThickness) var(--Textarea-focusedHighlight) !important",
                            },
                            "&.Mui-focused": {
                                borderColor: "#FF8F00",
                                color: "#FF8F00",
                                boxShadow: "none",
                                outline: "none",
                            },
                            "& ::placeholder": {
                                color: "rgba(255, 143, 0, 0.5)",
                                opacity: 0.6,
                            },
                            transition: "all 0.2s ease",
                        }}
                    />
                    <Divider />
                    <VersionDisplay />
                </List>
            </Box>
        </Sheet>
    );
}
