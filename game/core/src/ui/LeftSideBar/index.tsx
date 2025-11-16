import { UnitProperties, FactionType, FactionVals } from "@heroesofcrypto/common";
import DiceIcon from "@mui/icons-material/Casino";
import DashboardRoundedIcon from "@mui/icons-material/DashboardRounded";
import FactoryRoundedIcon from "@mui/icons-material/FactoryRounded";
import TerrainRoundedIcon from "@mui/icons-material/TerrainRounded";
import Box from "@mui/joy/Box";
import Divider from "@mui/joy/Divider";
import List from "@mui/joy/List";
import ListItem from "@mui/joy/ListItem";
import ListItemButton from "@mui/joy/ListItemButton";
import Sheet from "@mui/joy/Sheet";
import { useColorScheme } from "@mui/joy/styles";
import Typography from "@mui/joy/Typography";
import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";

import { MessageBox } from "./MessageBox";
import { usePixiManager } from "../../pixi/PixiGameManager";
import greenOverlayImage from "../../../images/overlay_green.webp";
import redOverlayImage from "../../../images/overlay_red.webp";
import { UnitStatsListItem } from "./UnitStatsListItem";
import { UpNext } from "./UpNext";
import SynergiesRow from "./SynergiesRow";
import { IWindowSize, IVisibleOverallImpact } from "../../state/visible_state";

type SidebarSelectionState = {
    unit: UnitProperties;
    overallImpact: IVisibleOverallImpact;
    factionType: FactionType;
};

const emptyUnit = {} as UnitProperties;
const emptyImpact = {} as IVisibleOverallImpact;

export default function LeftSideBar({ gameStarted, windowSize }: { gameStarted: boolean; windowSize: IWindowSize }) {
    const [badgeVisible, setBadgeVisible] = useState(false);
    const [barSize, setBarSize] = useState(280);
    const [buttonsVisible] = useState({
        prediction: false,
        terrain: false,
        factory: false,
        dashboard: false,
    });

    const [selection, setSelection] = useState<SidebarSelectionState>({
        unit: emptyUnit,
        overallImpact: emptyImpact,
        factionType: FactionVals.NO_FACTION as FactionType,
    });

    const { setMode } = useColorScheme();
    const manager = usePixiManager();

    const adjustBarSize = useCallback(() => {
        const additionalBoardPixels = 0;
        const widthRatio = windowSize.width / (2048 + additionalBoardPixels);
        const heightRatio = windowSize.height / 2048;

        const scaleRatio = Math.min(widthRatio, heightRatio);
        const scaledBoardSize = (2048 + additionalBoardPixels) * scaleRatio;

        const rightBarEndAtBoard = (windowSize.width - scaledBoardSize) / 2;
        setBarSize(rightBarEndAtBoard > 0 ? rightBarEndAtBoard : 0);
    }, [windowSize.width, windowSize.height]);

    useEffect(() => {
        adjustBarSize();
    }, [adjustBarSize]);

    useEffect(() => {
        const interval = setInterval(() => {
            setBadgeVisible(true);
            const timeout = setTimeout(() => {
                setBadgeVisible(false);
            }, 5000);
            return () => clearTimeout(timeout);
        }, 10000);

        return () => clearInterval(interval);
    }, []);

    // --- Batch all manager events into a single state update ------------------
    const pendingRef = useRef(selection);
    const scheduledRef = useRef(false);
    const lastSelectionKeyRef = useRef<string | null>(null);

    const flush = useCallback(() => {
        scheduledRef.current = false;
        setSelection(pendingRef.current);
    }, []);

    const scheduleFlush = useCallback(() => {
        if (scheduledRef.current) return;
        scheduledRef.current = true;
        // Next animation frame is fine for UI
        requestAnimationFrame(flush);
    }, [flush]);

    useEffect(() => {
        const handleUnitSelected = (unit: UnitProperties | null) => {
            const safeUnit = unit ?? ({} as UnitProperties);
            const key = safeUnit
                ? `${safeUnit.name}-${safeUnit.team}-${safeUnit.amount_alive}-${safeUnit.large_texture_name ?? ""}`
                : "none";

            if (lastSelectionKeyRef.current === key) {
                return;
            }
            lastSelectionKeyRef.current = key;

            pendingRef.current = {
                ...pendingRef.current,
                unit: safeUnit,
            };
            scheduleFlush();
        };

        const handleImpact = (impact: IVisibleOverallImpact | null) => {
            pendingRef.current = {
                ...pendingRef.current,
                overallImpact: impact ?? ({} as IVisibleOverallImpact),
            };
            scheduleFlush();
        };

        const handleFaction = (f: FactionType) => {
            pendingRef.current = {
                ...pendingRef.current,
                factionType: f,
            };
            scheduleFlush();
        };

        const c1 = manager.onUnitSelected.connect(handleUnitSelected);
        const c2 = manager.onVisibleOverallImpactUpdated.connect(handleImpact);
        const c3 = manager.onFactionSelected.connect(handleFaction);

        return () => {
            c1.disconnect();
            c2.disconnect();
            c3.disconnect();
        };
    }, [manager, scheduleFlush]);

    useEffect(() => {
        setMode("dark");
    }, [setMode]);

    const shouldColumnize = useMemo(() => {
        return windowSize.width / windowSize.height >= 16 / 9;
    }, [windowSize.width, windowSize.height]);

    const unitProperties = selection.unit || ({} as UnitProperties);
    const hasSelectedUnit = !!unitProperties.team;
    const synergies = ((unitProperties as UnitProperties).synergies as string[]) || [];
    const hasSynergies = Array.isArray(synergies) && synergies.length > 0;

    return (
        <Sheet
            className="Sidebar"
            sx={{
                position: "fixed",
                zIndex: 1,
                height: "100dvh",
                width: `${barSize}px`,
                top: 0,
                left: 0,
                p: 2,
                display: "flex",
                flexDirection: "column",
                gap: 2,
                borderRight: "1px solid",
                borderColor: "divider",
                overflowY: "auto",
                overflowX: "hidden",
            }}
        >
            {hasSelectedUnit && (
                <Box
                    component="img"
                    src={unitProperties.team === 2 ? greenOverlayImage : redOverlayImage}
                    sx={{
                        position: "absolute",
                        width: "350px",
                        height: "100%",
                        top: 0,
                        right: -350,
                        transform: "rotate(65deg)",
                        transformOrigin: "top left",
                        opacity: 1,
                        zIndex: 0,
                    }}
                />
            )}

            <Box
                sx={{
                    height: "40px",
                    display: "flex",
                    alignItems: "center",
                    overflow: "hidden",
                }}
            >
                {hasSelectedUnit && hasSynergies && <SynergiesRow synergies={synergies} />}
            </Box>

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
                    {Object.values(buttonsVisible).some((visible) => visible) && (
                        <Box display="flex" width="100%">
                            {buttonsVisible.prediction && (
                                <ListItem sx={{ flexGrow: 1, flexBasis: 0, position: "relative" }}>
                                    <ListItemButton disabled>
                                        <DiceIcon />
                                    </ListItemButton>
                                    {badgeVisible && (
                                        <Box
                                            sx={{
                                                position: "absolute",
                                                top: -17,
                                                right: -32,
                                                backgroundColor: "#FFD700",
                                                color: "#000000",
                                                borderRadius: "10px",
                                                padding: "4px 8px",
                                                fontSize: "0.7rem",
                                                boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
                                                zIndex: 3,
                                                "&::after": {
                                                    content: '""',
                                                    position: "absolute",
                                                    bottom: -5,
                                                    left: 8,
                                                    width: 0,
                                                    height: 0,
                                                    borderLeft: "4px solid transparent",
                                                    borderRight: "4px solid transparent",
                                                    borderTop: "5px solid #FFD700",
                                                },
                                            }}
                                        >
                                            Prediction
                                        </Box>
                                    )}
                                </ListItem>
                            )}

                            {buttonsVisible.terrain && (
                                <ListItem sx={{ flexGrow: 1, flexBasis: 0 }}>
                                    <ListItemButton>
                                        <TerrainRoundedIcon />
                                    </ListItemButton>
                                </ListItem>
                            )}

                            {buttonsVisible.factory && (
                                <ListItem sx={{ flexGrow: 1, flexBasis: 0 }}>
                                    <ListItemButton>
                                        <FactoryRoundedIcon />
                                    </ListItemButton>
                                </ListItem>
                            )}

                            {buttonsVisible.dashboard && (
                                <ListItem sx={{ flexGrow: 1, flexBasis: 0 }}>
                                    <ListItemButton selected>
                                        <DashboardRoundedIcon />
                                        <Box sx={{ marginLeft: 2 }}>
                                            <Typography level="title-sm">Fight</Typography>
                                        </Box>
                                    </ListItemButton>
                                </ListItem>
                            )}
                        </Box>
                    )}

                    <Divider />

                    <UnitStatsListItem
                        barSize={barSize}
                        columnize={shouldColumnize}
                        unitProperties={unitProperties}
                        overallImpact={selection.overallImpact}
                        factionType={selection.factionType}
                    />

                    <Box sx={{ flexGrow: 1 }} />

                    <MessageBox gameStarted={gameStarted} />

                    <UpNext />
                </List>
            </Box>
        </Sheet>
    );
}
