import { TeamVals, type TeamType } from "@heroesofcrypto/common";
import { personalArmyCssColor } from "../scenes/personalArmyTint";
import Box from "@mui/joy/Box";
import React from "react";

type TeamAmountFlagProps = {
    amount: number | string;
    teamType: TeamType;
    top?: string;
    right?: string;
    scale?: number;
};

/** Bright team palette shared by amount flags and stack-power pips. */
/**
 * The flag/pip colour for a team.
 *
 * This is the one place the React chrome names a team's colour, so it is also where a player's PERSONAL
 * army colour has to be honoured — otherwise their units would be tinted on the board while their stack
 * pips and count flags in the left and top bars stayed green. The opponent is never tinted, so the two
 * sides stay tellable apart in the queue exactly as they do on the board.
 */
export const getTeamFlagBackground = (teamType: TeamType): string => {
    const personal = personalArmyCssColor(teamType);
    if (personal) return personal;
    if (teamType === TeamVals.LOWER) return "#00d200";
    if (teamType === TeamVals.UPPER) return "#ff0000";
    return "#8b94a6";
};

export const TeamAmountFlag = ({ amount, teamType, top = "0px", right = "-5px", scale = 1 }: TeamAmountFlagProps) => {
    const label = String(amount);
    const width = Math.max(26, label.length * 8 + 16);
    const height = 18;

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
                    fontSize: "0.76rem",
                    lineHeight: 1,
                    fontWeight: 800,
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
