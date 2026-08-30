import { TeamVals, type TeamType } from "@heroesofcrypto/common";
import Box from "@mui/joy/Box";
import Typography from "@mui/joy/Typography";
import React, { useEffect, useMemo, useState } from "react";

import { fetchPickObserveSnapshot } from "../api/ranked_play_client";
import { fetchPublicPlayerStats, type PublicPlayerStats } from "../api/social_client";
import { battleSidebarWidth } from "../pixi/boardFit";
import { hocDisplayFontFamily } from "./hocTheme";
import { LeagueEmblem } from "./PlayerPortal/LeagueEmblem";

// The checked-out common package is currently migrating LEFT/RIGHT to LOWER/UPPER without changing the
// wire values (lower/left = 2, upper/right = 1). Keep this small HUD compatible with both names so its
// standalone previews remain useful while the shared client migration lands.
const teamValues = TeamVals as unknown as Record<string, number>;
const LOWER_TEAM = (teamValues.LEFT ?? teamValues.LOWER ?? 2) as TeamType;
const UPPER_TEAM = (teamValues.RIGHT ?? teamValues.UPPER ?? 1) as TeamType;

export type MatchupPlayer = Readonly<{
    playerId?: string;
    team: TeamType;
    /** Used immediately, before the public profile request resolves, and for non-ranked seats such as an AI. */
    label?: string;
    isAi?: boolean;
    /** Stable data used only by backend-free preview routes. Live games always resolve the public profile. */
    previewProfile?: PublicPlayerStats;
}>;

type MatchupOverlayProps = Readonly<{
    players: readonly MatchupPlayer[];
    placement: "pick" | "fight";
    /** The draft's current phase / the battle's current lap; intentionally one small contextual line. */
    status?: string;
    windowSize?: { width: number; height: number };
}>;

type MatchupProfile = Readonly<{
    username: string;
    rank: string;
    winRate: string;
}>;

const teamTone = (team: TeamType) =>
    team === LOWER_TEAM
        ? {
              bright: "#8fd69b",
              edge: "#356d52",
              face: "linear-gradient(135deg, rgba(44,112,80,.96), rgba(12,36,29,.98))",
          }
        : {
              bright: "#ee9a90",
              edge: "#813c41",
              face: "linear-gradient(135deg, rgba(122,48,53,.98), rgba(44,17,22,.99))",
          };

const fallbackProfile = (player: MatchupPlayer): MatchupProfile => ({
    username: player.label || (player.isAi ? "AI" : player.team === LOWER_TEAM ? "Green" : "Red"),
    rank: player.isAi ? "AI" : "Ranked",
    winRate: "— W",
});

const profileFor = (player: MatchupPlayer, publicProfile?: PublicPlayerStats): MatchupProfile => {
    if (!publicProfile) {
        return fallbackProfile(player);
    }

    const username = publicProfile.username || fallbackProfile(player).username;
    const rank =
        publicProfile.state === "placed"
            ? publicProfile.leagueName || publicProfile.standingTitle || publicProfile.wealthName || "Ranked"
            : "Calibrating";
    const winRate =
        typeof publicProfile.winRatePct === "number" && Number.isFinite(publicProfile.winRatePct)
            ? `${Math.round(publicProfile.winRatePct)}% W`
            : "— W";
    return { username, rank, winRate };
};

/**
 * The battle HUD may not live beneath the right sidebar: its right edge is the board-facing edge of that
 * bar, while its top edge stays pinned to the viewport like the draft version.
 */
export const fightMatchupOverlayPosition = (windowSize: { width: number; height: number }) => {
    const sideBar = battleSidebarWidth(windowSize.width, windowSize.height);
    // Sit inside the open top-band pocket instead of hugging the sidebar rail. The responsive inset keeps
    // the strip visually centred between the expanded unit roster and the sidebar across common aspect ratios.
    const matchupGapInset = Math.max(48, Math.min(80, Math.round(windowSize.width * 0.045)));
    return {
        top: 0,
        right: sideBar + matchupGapInset,
        maxWidth: Math.max(220, windowSize.width - sideBar * 2 - 28),
    };
};

const Crest: React.FC<{ team: TeamType }> = ({ team }) => {
    const tone = teamTone(team);
    return (
        <Box
            aria-hidden="true"
            sx={{
                width: 31,
                height: 35,
                flex: "0 0 auto",
                display: "grid",
                placeItems: "center",
                clipPath: "polygon(50% 0, 94% 16%, 87% 74%, 50% 100%, 13% 74%, 6% 16%)",
                bgcolor: tone.edge,
                boxShadow: `0 2px 7px ${tone.edge}`,
                "&::before": {
                    content: '\"\"',
                    gridArea: "1 / 1",
                    width: "calc(100% - 3px)",
                    height: "calc(100% - 3px)",
                    clipPath: "inherit",
                    background: tone.face,
                },
                "&::after": {
                    content: team === LOWER_TEAM ? '\"✦\"' : '\"☾\"',
                    gridArea: "1 / 1",
                    color: "#fff2cb",
                    fontFamily: "Georgia, serif",
                    fontSize: 17,
                    fontWeight: 700,
                    lineHeight: 1,
                    textShadow: "0 1px 2px rgba(0,0,0,.92)",
                },
            }}
        />
    );
};

const Side: React.FC<{ player: MatchupPlayer; profile?: PublicPlayerStats; reversed?: boolean }> = ({
    player,
    profile,
    reversed = false,
}) => {
    const tone = teamTone(player.team);
    const text = profileFor(player, profile);
    return (
        <Box
            sx={{
                minWidth: 0,
                display: "flex",
                alignItems: "center",
                gap: 0.75,
                flexDirection: reversed ? "row-reverse" : "row",
                textAlign: reversed ? "right" : "left",
            }}
        >
            {profile ? (
                <LeagueEmblem
                    label={`${text.username} — ${text.rank}`}
                    league={profile.league ?? 0}
                    wealth={profile.wealth ?? 0}
                    size={31}
                />
            ) : (
                <Crest team={player.team} />
            )}
            <Box sx={{ minWidth: 0, flex: "1 1 auto" }}>
                <Typography
                    level="body-sm"
                    sx={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        color: "#f2e7d0",
                        fontFamily: hocDisplayFontFamily,
                        fontSize: "0.71rem",
                        fontWeight: 800,
                        letterSpacing: "0.07em",
                        lineHeight: 1.1,
                        textTransform: "uppercase",
                    }}
                >
                    {text.username}
                </Typography>
                <Box
                    sx={{
                        mt: "3px",
                        display: "flex",
                        minWidth: 0,
                        alignItems: "center",
                        justifyContent: reversed ? "flex-end" : "flex-start",
                        gap: 0.5,
                        color: "#c4b8a0",
                        fontSize: "0.57rem",
                        fontWeight: 800,
                        letterSpacing: "0.055em",
                        lineHeight: 1,
                        textTransform: "uppercase",
                        whiteSpace: "nowrap",
                    }}
                >
                    <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", color: tone.bright }}>
                        ◆ {text.rank}
                    </Box>
                    <Box
                        component="span"
                        sx={{ width: 3, height: 3, flex: "0 0 auto", bgcolor: "#8b7960", transform: "rotate(45deg)" }}
                    />
                    <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                        {text.winRate}
                    </Box>
                </Box>
            </Box>
        </Box>
    );
};

/**
 * Compact, non-interactive matchup strip shared by ranked drafting and battle. Player identity is public
 * ranked data; until it arrives (or for an AI/unranked player) the panel remains stable with honest fallbacks.
 */
export const MatchupOverlay: React.FC<MatchupOverlayProps> = ({ players, placement, status, windowSize }) => {
    const [profiles, setProfiles] = useState<Record<string, PublicPlayerStats>>({});
    const playerKey = players
        .map((player) => `${player.team}:${player.playerId ?? ""}:${player.isAi ? "ai" : "human"}`)
        .sort()
        .join("|");

    useEffect(() => {
        let cancelled = false;
        const missing = players.filter((player) => player.playerId && !player.isAi && !profiles[player.playerId]);
        if (missing.length === 0) {
            return undefined;
        }
        void Promise.all(
            missing.map(async (player) => {
                try {
                    return [player.playerId!, await fetchPublicPlayerStats(player.playerId!)] as const;
                } catch {
                    return undefined;
                }
            }),
        ).then((results) => {
            if (cancelled) {
                return;
            }
            const resolved = results.filter((result): result is readonly [string, PublicPlayerStats] => !!result);
            if (resolved.length === 0) {
                return;
            }
            setProfiles((current) => ({ ...current, ...Object.fromEntries(resolved) }));
        });
        return () => {
            cancelled = true;
        };
        // `playerKey` intentionally captures the stable player identity rather than the freshly-created array.
    }, [playerKey]);

    const ordered = useMemo(
        () => [
            players.find((player) => player.team === LOWER_TEAM),
            players.find((player) => player.team === UPPER_TEAM),
        ],
        [players],
    );
    const left = ordered[0] ?? { team: LOWER_TEAM, label: "Green" };
    const right = ordered[1] ?? { team: UPPER_TEAM, label: "Red" };
    const fightPosition = placement === "fight" && windowSize ? fightMatchupOverlayPosition(windowSize) : undefined;

    return (
        <Box
            data-testid={`matchup-overlay-${placement}`}
            sx={{
                position: "fixed",
                zIndex: placement === "fight" ? 7000 : 65,
                pointerEvents: "none",
                top: placement === "fight" ? `${fightPosition?.top ?? 16}px` : 0,
                left: placement === "pick" ? "50%" : undefined,
                right: placement === "fight" ? `${fightPosition?.right ?? 16}px` : undefined,
                transform: placement === "pick" ? "translateX(-50%)" : undefined,
                width: "min(298px, calc(100vw - 24px))",
                maxWidth: placement === "fight" ? `${fightPosition?.maxWidth ?? 298}px` : undefined,
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) 38px minmax(0, 1fr)",
                alignItems: "center",
                gap: 0.5,
                minHeight: 54,
                px: 1,
                py: 0.75,
                overflow: "hidden",
                border: "1px solid rgba(211,173,92,.62)",
                borderBottom: "2px solid rgba(180,140,67,.92)",
                clipPath: "polygon(0 0, 5% 0, 7% 7%, 93% 7%, 95% 0, 100% 0, 100% 88%, 97% 100%, 3% 100%, 0 88%)",
                background:
                    "linear-gradient(90deg, rgba(20,80,61,.96), rgba(13,18,16,.97) 39%, rgba(30,19,18,.97) 61%, rgba(102,35,43,.96))",
                boxShadow: "0 9px 22px rgba(0,0,0,.62), inset 0 1px rgba(255,238,189,.16)",
                "&::before": {
                    content: '\"\"',
                    position: "absolute",
                    inset: "3px",
                    pointerEvents: "none",
                    border: "1px solid rgba(255,232,174,.09)",
                    clipPath: "inherit",
                },
            }}
        >
            <Side
                player={left}
                profile={(left.playerId ? profiles[left.playerId] : undefined) ?? left.previewProfile}
            />
            <Box
                sx={{
                    minWidth: 0,
                    height: 34,
                    display: "grid",
                    placeItems: "center",
                    borderLeft: "1px solid rgba(234,204,133,.17)",
                    borderRight: "1px solid rgba(234,204,133,.17)",
                    color: "#e9c976",
                    textAlign: "center",
                }}
            >
                <Box>
                    <Typography
                        sx={{
                            color: "inherit",
                            fontFamily: hocDisplayFontFamily,
                            fontSize: "0.72rem",
                            fontWeight: 800,
                            letterSpacing: "0.1em",
                            lineHeight: 1,
                        }}
                    >
                        VS
                    </Typography>
                    {status && (
                        <Typography
                            sx={{
                                mt: "3px",
                                color: "#a89b82",
                                fontFamily: hocDisplayFontFamily,
                                fontSize: "0.42rem",
                                fontWeight: 800,
                                letterSpacing: "0.09em",
                                lineHeight: 1,
                                textTransform: "uppercase",
                                whiteSpace: "nowrap",
                            }}
                        >
                            {status}
                        </Typography>
                    )}
                </Box>
            </Box>
            <Side
                player={right}
                profile={(right.playerId ? profiles[right.playerId] : undefined) ?? right.previewProfile}
                reversed
            />
        </Box>
    );
};

/** The pick event stream deliberately contains no opponent identity, so resolve this public, spoiler-safe slice once. */
export const PickMatchupOverlay: React.FC<{
    gameId?: string;
    userTeam: TeamType;
    opponentLabel?: string;
    status?: string;
}> = ({ gameId, userTeam, opponentLabel = "Opponent", status = "Draft" }) => {
    const isBackendFreePreview = !!gameId && (/preview/i.test(gameId) || gameId === "local-playable-draft");
    // Older preview callers currently pass TeamVals.LEFT, which becomes undefined while their local common
    // checkout exposes only LOWER/UPPER. A participant draft can only be one of the two real seats; default
    // an unknown preview value to lower so the mock still shows one player on each side.
    const normalizedUserTeam = userTeam === UPPER_TEAM ? UPPER_TEAM : LOWER_TEAM;
    const fallbackPlayers = useMemo<readonly MatchupPlayer[]>(
        () => [
            {
                team: normalizedUserTeam,
                label: isBackendFreePreview ? "Valeria" : "You",
                previewProfile: isBackendFreePreview
                    ? {
                          playerId: "preview-valeria",
                          username: "Valeria",
                          state: "placed",
                          league: 2,
                          leagueName: "Vanguard",
                          wealth: 2,
                          winRatePct: 64,
                      }
                    : undefined,
            },
            {
                team: normalizedUserTeam === LOWER_TEAM ? UPPER_TEAM : LOWER_TEAM,
                label: isBackendFreePreview ? "Dreadwolf" : opponentLabel,
                isAi: !isBackendFreePreview && /^AI(?:\s|$)/i.test(opponentLabel),
                previewProfile: isBackendFreePreview
                    ? {
                          playerId: "preview-dreadwolf",
                          username: "Dreadwolf",
                          state: "placed",
                          league: 3,
                          leagueName: "Marshal",
                          wealth: 3,
                          winRatePct: 58,
                      }
                    : undefined,
            },
        ],
        [isBackendFreePreview, normalizedUserTeam, opponentLabel],
    );
    const [players, setPlayers] = useState<readonly MatchupPlayer[]>(fallbackPlayers);

    useEffect(() => {
        setPlayers(fallbackPlayers);
        if (!gameId) {
            return undefined;
        }
        let cancelled = false;
        void fetchPickObserveSnapshot(gameId)
            .then((snapshot) => {
                if (cancelled || !snapshot?.teams?.length) {
                    return;
                }
                setPlayers(
                    snapshot.teams.map((team) => ({
                        team: team.team === "lower" ? LOWER_TEAM : UPPER_TEAM,
                        playerId: team.playerId,
                        label: team.username || (team.isBot ? "AI" : undefined),
                        isAi: team.isBot,
                    })),
                );
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [fallbackPlayers, gameId]);

    return <MatchupOverlay players={players} placement="pick" status={status} />;
};
