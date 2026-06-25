import { TeamVals, type TeamType } from "@heroesofcrypto/common";
import Box from "@mui/joy/Box";
import React from "react";

type TeamAmountFlagProps = {
    amount: number | string;
    teamType: TeamType;
    top?: string;
    right?: string;
};

const getTeamFlagColor = (teamType: TeamType): string => {
    if (teamType === TeamVals.LOWER) return "rgba(0, 255, 0, 1)";
    if (teamType === TeamVals.UPPER) return "rgba(255, 0, 0, 1)";
    return "rgba(139, 148, 166, 1)";
};

export const TeamAmountFlag = ({ amount, teamType, top = "-2px", right = "-5px" }: TeamAmountFlagProps) => {
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
                    backgroundColor: getTeamFlagColor(teamType),
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
