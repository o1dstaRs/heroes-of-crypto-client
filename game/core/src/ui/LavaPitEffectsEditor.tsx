import { GridVals, TeamVals } from "@heroesofcrypto/common";
import { Box, Button, Sheet, Typography } from "@mui/joy";
import React, { useEffect, useMemo, useState } from "react";

import { PREVIEW_PLACEMENT_GAME_ID, startPreviewPlaySession } from "../api/previewPlaySession";
import type { IWindowSize } from "../scenes/VisibleState";
import {
    readStoredLavaAnimationTuning,
    setLavaAnimationEditorActive,
    writeStoredLavaAnimationTuning,
    type LavaAnimationTuning,
} from "../scenes/sandbox/lavaAnimationTuning";
import {
    readStoredLavaPitVisualMode,
    writeStoredLavaPitVisualMode,
    type LavaPitVisualMode,
} from "../scenes/sandbox/lavaPitVisualMode";
import { hocDisplayFontFamily } from "./hocTheme";
import { RankedGameView } from "./RankedGameView";

const activeButtonSx = {
    bgcolor: "#a84a16",
    borderColor: "#ff9a45",
    color: "#fff4df",
    "&:hover": { bgcolor: "#be591d" },
};

export const LavaPitEffectsEditor: React.FC<{ windowSize: IWindowSize }> = ({ windowSize }) => {
    const [visualMode, setVisualMode] = useState<LavaPitVisualMode>(() => readStoredLavaPitVisualMode());
    const [tuning, setTuning] = useState<LavaAnimationTuning>(() => readStoredLavaAnimationTuning());

    useMemo(
        () =>
            startPreviewPlaySession({
                userTeam: TeamVals.LEFT,
                gridType: GridVals.LAVA_CENTER,
                lowerArmy: [],
                upperArmy: [],
            }),
        [],
    );

    useEffect(() => {
        setLavaAnimationEditorActive(true, false);
        return () => setLavaAnimationEditorActive(false);
    }, []);

    const selectMode = (mode: LavaPitVisualMode) => {
        setVisualMode(writeStoredLavaPitVisualMode(mode));
    };

    const toggleEffect = (field: "fogEnabled" | "fireEnabled") => {
        const next = writeStoredLavaAnimationTuning({ ...tuning, [field]: !tuning[field] });
        setTuning(next);
    };

    const updateFog = (patch: Partial<Pick<LavaAnimationTuning, "fogColor" | "fogSpeed">>) => {
        setTuning(writeStoredLavaAnimationTuning({ ...tuning, ...patch }));
    };

    if (import.meta.env.PROD || import.meta.env.VITE_IS_PROD === "true") {
        return <Typography sx={{ p: 4 }}>Lava pit effects tool is available only in development builds.</Typography>;
    }

    return (
        <Box sx={{ position: "fixed", inset: 0, overflow: "hidden", bgcolor: "#000" }}>
            <RankedGameView gameId={PREVIEW_PLACEMENT_GAME_ID} userTeam={TeamVals.LEFT} windowSize={windowSize} />
            <Sheet
                sx={{
                    position: "fixed",
                    zIndex: 14000,
                    top: 14,
                    right: 14,
                    width: 330,
                    p: 1.5,
                    bgcolor: "rgba(14,7,3,.96)",
                    border: "1px solid rgba(255,112,28,.58)",
                    borderRadius: "12px",
                    boxShadow: "0 14px 42px rgba(0,0,0,.72)",
                }}
            >
                <Typography
                    level="title-md"
                    sx={{ mb: 1.25, color: "#ffd08a", fontFamily: hocDisplayFontFamily, textAlign: "center" }}
                >
                    СОСТОЯНИЕ ЯМЫ
                </Typography>
                <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, mb: 1 }}>
                    <Button
                        variant="outlined"
                        color="warning"
                        onClick={() => selectMode("extinguished")}
                        sx={visualMode === "extinguished" ? activeButtonSx : undefined}
                    >
                        Потухшая
                    </Button>
                    <Button
                        variant="outlined"
                        color="warning"
                        onClick={() => selectMode("burning")}
                        sx={visualMode === "burning" ? activeButtonSx : undefined}
                    >
                        Горящая
                    </Button>
                </Box>
                <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
                    <Button
                        variant="outlined"
                        color="neutral"
                        onClick={() => toggleEffect("fogEnabled")}
                        sx={tuning.fogEnabled ? activeButtonSx : undefined}
                    >
                        Туман: {tuning.fogEnabled ? "вкл" : "выкл"}
                    </Button>
                    <Button
                        variant="outlined"
                        color="neutral"
                        onClick={() => toggleEffect("fireEnabled")}
                        sx={tuning.fireEnabled ? activeButtonSx : undefined}
                    >
                        Огонь: {tuning.fireEnabled ? "вкл" : "выкл"}
                    </Button>
                </Box>
                <Box
                    sx={{ display: "grid", gridTemplateColumns: "92px 1fr 72px", alignItems: "center", gap: 1, mt: 1 }}
                >
                    <Typography level="body-sm" sx={{ color: "#d8c5aa" }}>
                        Цвет тумана
                    </Typography>
                    <Box
                        component="input"
                        type="color"
                        value={tuning.fogColor}
                        onInput={(event) => updateFog({ fogColor: (event.target as HTMLInputElement).value })}
                        sx={{ width: "100%", height: 34, p: 0, border: 0, bgcolor: "transparent", cursor: "pointer" }}
                    />
                    <Typography level="body-xs" sx={{ color: "#ad9b84", fontFamily: "monospace" }}>
                        {tuning.fogColor.toUpperCase()}
                    </Typography>
                </Box>
                <Box
                    sx={{ display: "grid", gridTemplateColumns: "92px 1fr 46px", alignItems: "center", gap: 1, mt: 1 }}
                >
                    <Typography level="body-sm" sx={{ color: "#d8c5aa" }}>
                        Скорость
                    </Typography>
                    <Box
                        component="input"
                        type="range"
                        min={0}
                        max={12}
                        step={0.05}
                        value={tuning.fogSpeed}
                        onInput={(event) => updateFog({ fogSpeed: Number((event.target as HTMLInputElement).value) })}
                        sx={{ width: "100%", accentColor: "#d66d25", cursor: "pointer" }}
                    />
                    <Typography level="body-xs" sx={{ color: "#ad9b84", textAlign: "right" }}>
                        {tuning.fogSpeed.toFixed(2)}×
                    </Typography>
                </Box>
            </Sheet>
        </Box>
    );
};
