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
import React, { useEffect, useState, useCallback, useMemo } from "react";

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

    // ✅ Subscribe to combined selection event
    useEffect(() => {
        const handleCombined = (payload: {
            unit: UnitProperties | null;
            impact: IVisibleOverallImpact | null;
            faction: FactionType;
        }) => {
            const unit = (payload.unit ?? ({} as UnitProperties)) as UnitProperties;
            const impact = (payload.impact ?? ({} as IVisibleOverallImpact)) as IVisibleOverallImpact;
            const factionType = (payload.faction ?? (FactionVals.NO_FACTION as FactionType)) as FactionType;

            // Always update – React will skip DOM work if nothing really changed
            setSelection({
                unit,
                overallImpact: impact,
                factionType,
            });
        };

        const conn = manager.onSelectionCombined.connect(handleCombined);
        return () => {
            conn.disconnect();
        };
    }, [manager]);

    useEffect(() => {
        setMode("dark");
    }, [setMode]);

    const shouldColumnize = useMemo(
        () => windowSize.width / windowSize.height >= 16 / 9,
        [windowSize.width, windowSize.height],
    );

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
                    // INCREASED HEIGHT: Prevents clipping of icon tops
                    height: "52px",
                    // MIN-HEIGHT: Reserves space even if empty (prevents UI drift)
                    minHeight: "52px",
                    display: "flex",
                    alignItems: "center",
                    // FLEX-SHRINK 0: Prevents flexbox from crushing this container if the list below grows
                    flexShrink: 0,
                    // OVERFLOW HIDDEN REMOVED: Allows glow effects/shadows to extend slightly outside
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
