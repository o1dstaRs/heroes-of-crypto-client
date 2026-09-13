import Box from "@mui/joy/Box";
import Stack from "@mui/joy/Stack";
import Typography from "@mui/joy/Typography";
import React, { useEffect, useState } from "react";

import { fetchPublicPlayerStats, type PublicPlayerStats } from "../../api/social_client";
import { CreaturePortraitImage } from "../CreaturePortraitImage";
import { UNIT_ID_TO_NAME } from "../unit_ui_constants";

type RecentGame = NonNullable<PublicPlayerStats["recentGames"]>[number];

const RECENT_GAMES_SHOWN = 3;

const RESULT_STYLE = {
    win: { label: "W", color: "#8de3a1" },
    loss: { label: "L", color: "#ee9a90" },
    draw: { label: "D", color: "#e6c774" },
} as const;

/**
 * A drafting player's last few settled ranked games, with the creatures they fielded. Public profile data —
 * the website shows the same — so it tells nobody in this draft anything new. Fetched once per player; an AI
 * seat has no ranked profile and shows nothing.
 */
export const ObserverRecentGames: React.FC<{ playerId: string; isBot: boolean }> = ({ playerId, isBot }) => {
    const [games, setGames] = useState<RecentGame[] | undefined>(undefined);

    useEffect(() => {
        if (isBot || !playerId) {
            setGames([]);
            return undefined;
        }
        let cancelled = false;
        setGames(undefined);
        fetchPublicPlayerStats(playerId)
            .then((stats) => {
                if (!cancelled) {
                    setGames((stats.recentGames ?? []).slice(0, RECENT_GAMES_SHOWN));
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setGames([]);
                }
            });
        return () => {
            cancelled = true;
        };
    }, [playerId, isBot]);

    if (isBot) {
        return null;
    }

    return (
        <Box sx={{ width: "100%", pt: 1.1, borderTop: "1px solid rgba(159,182,212,0.2)" }}>
            <Typography
                level="body-xs"
                sx={{ color: "#9fb6d4", textTransform: "uppercase", letterSpacing: 0.7, mb: 0.75 }}
            >
                Recent games
            </Typography>
            {games === undefined ? (
                <Typography level="body-xs" sx={{ color: "rgba(159,182,212,0.5)" }}>
                    Loading…
                </Typography>
            ) : games.length === 0 ? (
                <Typography level="body-xs" sx={{ color: "rgba(159,182,212,0.5)" }}>
                    No ranked games yet
                </Typography>
            ) : (
                <Stack spacing={0.6}>
                    {games.map((game) => {
                        const result = RESULT_STYLE[game.result] ?? RESULT_STYLE.draw;
                        return (
                            <Stack
                                key={game.gameId}
                                direction="row"
                                spacing={0.75}
                                alignItems="center"
                                sx={{ minWidth: 0 }}
                            >
                                <Box
                                    sx={{
                                        width: 20,
                                        height: 20,
                                        flex: "0 0 auto",
                                        display: "grid",
                                        placeItems: "center",
                                        borderRadius: "5px",
                                        border: `1px solid ${result.color}`,
                                        color: result.color,
                                        fontSize: 11,
                                        fontWeight: 800,
                                    }}
                                >
                                    {result.label}
                                </Box>
                                <Typography
                                    level="body-xs"
                                    noWrap
                                    sx={{ color: "#efe4cc", width: 84, flex: "0 0 auto" }}
                                >
                                    {game.opponent?.username ? `vs ${game.opponent.username}` : "Ranked game"}
                                </Typography>
                                <Stack direction="row" spacing={0.25} sx={{ minWidth: 0, overflow: "hidden" }}>
                                    {(game.creatureIds ?? []).slice(0, 6).map((creatureId, index) => (
                                        <CreaturePortraitImage
                                            key={`${game.gameId}-${index}`}
                                            creatureId={creatureId}
                                            alt={UNIT_ID_TO_NAME[creatureId] ?? `#${creatureId}`}
                                            sx={{
                                                width: 26,
                                                height: 26,
                                                flex: "0 0 auto",
                                                borderRadius: "50%",
                                                objectFit: "cover",
                                                border: "1px solid rgba(220,177,88,0.45)",
                                            }}
                                        />
                                    ))}
                                </Stack>
                            </Stack>
                        );
                    })}
                </Stack>
            )}
        </Box>
    );
};

export default ObserverRecentGames;
