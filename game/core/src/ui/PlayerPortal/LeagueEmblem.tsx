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

const WEALTH_EMBLEM_KEYS = {
    1: {
        1: "wealth_aspirant_ragged_512",
        2: "wealth_aspirant_stacked_512",
        3: "wealth_aspirant_whale_512",
    },
    2: {
        1: "wealth_vanguard_ragged_512",
        2: "wealth_vanguard_stacked_512",
        3: "wealth_vanguard_whale_512",
    },
    3: {
        1: "wealth_marshal_ragged_512",
        2: "wealth_marshal_stacked_512",
        3: "wealth_marshal_whale_512",
    },
    4: {
        1: "wealth_overlord_ragged_512",
        2: "wealth_overlord_stacked_512",
        3: "wealth_overlord_whale_512",
    },
    5: {
        1: "wealth_demigod_ragged_512",
        2: "wealth_demigod_stacked_512",
        3: "wealth_demigod_whale_512",
    },
} as const;

type League = keyof typeof WEALTH_EMBLEM_KEYS;
type Wealth = 1 | 2 | 3;
type WealthEmblemKey = {
    [LeagueKey in League]: (typeof WEALTH_EMBLEM_KEYS)[LeagueKey][Wealth];
}[League];
type LeagueEmblemKey = (typeof LEAGUE_EMBLEM_KEYS)[keyof typeof LEAGUE_EMBLEM_KEYS] | WealthEmblemKey;

export const leagueEmblemKey = (league: number, wealth = 0): LeagueEmblemKey => {
    const normalized = Math.trunc(Number(league));
    const base = LEAGUE_EMBLEM_KEYS[normalized as keyof typeof LEAGUE_EMBLEM_KEYS] ?? LEAGUE_EMBLEM_KEYS[0];
    if (base === LEAGUE_EMBLEM_KEYS[0]) {
        return base;
    }
    const normalizedWealth = Math.trunc(Number(wealth));
    return WEALTH_EMBLEM_KEYS[normalized as League]?.[normalizedWealth as Wealth] ?? base;
};

export const leagueEmblemSource = (league: number, wealth = 0): string => images[leagueEmblemKey(league, wealth)];

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
    wealth?: number;
}

/** A player's wealth portrait inside its league frame. League 0 is calibration. */
export const LeagueEmblem: React.FC<LeagueEmblemProps> = ({ label, league, size = 72, wealth = 0 }) => (
    <Box
        component="img"
        src={leagueEmblemSource(league, wealth)}
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
