import { TeamVals, type TeamType } from "@heroesofcrypto/common";
import { personalArmyPresetFor } from "../scenes/personalArmyTint";
import { TEAM_COLOR_RED, TEAM_FLAG_PALETTE_RED, teamFlagPalette } from "../scenes/teamColors";
import Box from "@mui/joy/Box";
import React from "react";

type TeamAmountFlagProps = {
    amount: number | string;
    teamType: TeamType;
    top?: string;
    right?: string;
    scale?: number;
};

/** Portrait flags and stack-power pips use the cloth edge shade of the team's battlefield banner. */
export const getTeamFlagBackground = (teamType: TeamType): string => {
    if (teamType !== TeamVals.LEFT && teamType !== TeamVals.RIGHT) return "#8b94a6";
    const preset = personalArmyPresetFor(teamType);
    const edge =
        preset?.color === TEAM_COLOR_RED
            ? TEAM_FLAG_PALETTE_RED.edge
            : (preset?.gradient[0] ?? teamFlagPalette(teamType).edge);
    return `#${edge.toString(16).padStart(6, "0")}`;
};

export const TeamAmountFlag = ({ amount, teamType, top = "0px", right = "-5px", scale = 1 }: TeamAmountFlagProps) => {
    const label = String(amount);
    const width = Math.max(26, label.length * 8 + 16);
    const height = 20;

    return (
        <Box
            sx={{
                position: "absolute",
                top,
                right,
                width: `${width}px`,
                height: `${height + 3}px`,
                transform: `scale(${scale})`,
                transformOrigin: "top right",
                pointerEvents: "none",
                zIndex: 12,
            }}
        >
            <Box
                sx={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    width: "2px",
                    height: `${height + 3}px`,
                    borderRadius: "2px",
                    backgroundColor: "#1b140f",
                    boxShadow: "0 1px 2px rgba(0, 0, 0, 0.6)",
                }}
            />
            <Box
                sx={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    width: `${width}px`,
                    height: `${height}px`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    pl: "5px",
                    pr: "7px",
                    boxSizing: "border-box",
                    clipPath: "polygon(0 0, 100% 0, calc(100% - 4px) 50%, 100% 100%, 0 100%)",
                    background: getTeamFlagBackground(teamType),
                    color: "#ffffff",
                    fontSize: "0.9rem",
                    lineHeight: 1,
                    fontWeight: 900,
                    WebkitTextStroke: "0.2px currentColor",
                    textShadow:
                        "0 1px 1px rgba(0, 0, 0, 0.95), 1px 0 1px rgba(0, 0, 0, 0.95), -1px 0 1px rgba(0, 0, 0, 0.95), 0 -1px 1px rgba(0, 0, 0, 0.95)",
                    filter: "drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6))",
                    "&::after": {
                        content: '""',
                        position: "absolute",
                        top: "2px",
                        left: "3px",
                        right: "5px",
                        height: "1px",
                        backgroundColor: "rgba(255, 255, 255, 0.32)",
                    },
                }}
            >
                {label}
            </Box>
        </Box>
    );
};
