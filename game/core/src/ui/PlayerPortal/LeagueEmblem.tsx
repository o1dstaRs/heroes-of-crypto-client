import { Box } from "@mui/joy";
import React from "react";

import { images } from "../../generated/image_imports";

const LEAGUE_EMBLEM_KEYS = {
    0: "league_calibration_black_512",
    1: "league_aspirant_512",
    2: "league_vanguard_512",
    3: "league_marshal_512",
    4: "league_overlord_512",
    5: "league_demigod_512",
} as const;

export const leagueEmblemKey = (league: number): (typeof LEAGUE_EMBLEM_KEYS)[keyof typeof LEAGUE_EMBLEM_KEYS] => {
    const normalized = Math.trunc(Number(league));
    return LEAGUE_EMBLEM_KEYS[normalized as keyof typeof LEAGUE_EMBLEM_KEYS] ?? LEAGUE_EMBLEM_KEYS[0];
};

export const leagueEmblemSource = (league: number): string => images[leagueEmblemKey(league)];

export const leagueEmblemGlow = (league: number): string => {
    switch (Math.trunc(Number(league))) {
        case 1:
            return "rgba(115, 121, 128, 0.42)";
        case 2:
            return "rgba(191, 116, 57, 0.5)";
        case 3:
            return "rgba(211, 223, 236, 0.5)";
        case 4:
            return "rgba(255, 190, 67, 0.55)";
        case 5:
            return "rgba(117, 218, 255, 0.62)";
        default:
            return "rgba(220, 177, 88, 0.38)";
    }
};

export interface LeagueEmblemProps {
    label: string;
    league: number;
    size?: number;
}

/** The clean metal crest used anywhere a player's league is shown. League 0 is calibration. */
export const LeagueEmblem: React.FC<LeagueEmblemProps> = ({ label, league, size = 72 }) => (
    <Box
        component="img"
        src={leagueEmblemSource(league)}
        alt={label}
        title={label}
        draggable={false}
        sx={{
            display: "block",
            width: size,
            height: size,
            flex: `0 0 ${size}px`,
            objectFit: "contain",
            filter: `drop-shadow(0 8px 13px rgba(0,0,0,0.58)) drop-shadow(0 0 9px ${leagueEmblemGlow(league)})`,
            userSelect: "none",
        }}
    />
);
