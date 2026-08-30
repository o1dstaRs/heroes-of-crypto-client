import { type TeamType } from "@heroesofcrypto/common";
import Box from "@mui/joy/Box";
import Typography from "@mui/joy/Typography";
import React, { useEffect, useMemo, useState } from "react";

import { fetchPickObserveSnapshot } from "../api/ranked_play_client";
import { fetchPublicPlayerStats, type PublicPlayerStats } from "../api/social_client";
import { battleSidebarWidth } from "../pixi/boardFit";
import { readPlayerArmyColorId } from "../settings/playerArmyColor";
import { hocDisplayFontFamily } from "./hocTheme";
import { MATCHUP_LOWER_TEAM, MATCHUP_UPPER_TEAM, matchupTeamTone, type MatchupTeamTone } from "./matchupOverlayTone";
import { LeagueEmblem } from "./PlayerPortal/LeagueEmblem";

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
    /** Fight screens centre the strip only after the unit roster has cleared for live combat. */
    fightStarted?: boolean;
    /** The draft's current phase / the battle's current lap; intentionally one small contextual line. */
    status?: string;
    windowSize?: { width: number; height: number };
    /** The locally-controlled seat. Undefined for observers/replays, which retain canonical team colours. */
    viewerTeam?: TeamType;
}>;

type MatchupProfile = Readonly<{
    username: string;
    rank: string;
    record: string;
    winRate: string;
}>;

const fallbackProfile = (player: MatchupPlayer): MatchupProfile => ({
    username: player.label || (player.isAi ? "AI" : player.team === MATCHUP_LOWER_TEAM ? "Green" : "Red"),
    rank: player.isAi ? "AI" : "Ranked",
    record: "W— T— L—",
    winRate: "—%",
});

const wholeStat = (value: number | undefined): string =>
    typeof value === "number" && Number.isFinite(value) ? String(Math.max(0, Math.trunc(value))) : "—";

const MATCHUP_COLLAPSED_STORAGE_KEY = "hoc.matchupOverlay.collapsed";

const readMatchupCollapsed = (): boolean => {
    try {
        return globalThis.localStorage?.getItem(MATCHUP_COLLAPSED_STORAGE_KEY) === "1";
    } catch {
        return false;
    }
};

const writeMatchupCollapsed = (collapsed: boolean): void => {
    try {
        globalThis.localStorage?.setItem(MATCHUP_COLLAPSED_STORAGE_KEY, collapsed ? "1" : "0");
    } catch {
        // A cosmetic preference must never prevent the HUD from opening.
    }
};

const profileFor = (player: MatchupPlayer, publicProfile?: PublicPlayerStats): MatchupProfile => {
    if (!publicProfile) {
        return fallbackProfile(player);
    }

    const username = publicProfile.username || fallbackProfile(player).username;
    const rank =
        publicProfile.state === "placed"
            ? publicProfile.leagueName || publicProfile.standingTitle || publicProfile.wealthName || "Ranked"
            : "Calibrating";
    const record = `W${wholeStat(publicProfile.wins)} T${wholeStat(publicProfile.draws)} L${wholeStat(publicProfile.losses)}`;
    const winRate =
        typeof publicProfile.winRatePct === "number" && Number.isFinite(publicProfile.winRatePct)
            ? `${Math.round(publicProfile.winRatePct)}%`
            : "—%";
    return { username, rank, record, winRate };
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

const Crest: React.FC<{ team: TeamType; tone: MatchupTeamTone }> = ({ team, tone }) => {
    return (
        <Box
            aria-hidden="true"
            sx={{
                width: 35,
                height: 39,
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
                    content: team === MATCHUP_LOWER_TEAM ? '\"✦\"' : '\"☾\"',
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

const Side: React.FC<{
    player: MatchupPlayer;
    tone: MatchupTeamTone;
    profile?: PublicPlayerStats;
    reversed?: boolean;
}> = ({ player, tone, profile, reversed = false }) => {
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
                    size={35}
                    variant="compact"
                />
            ) : (
                <Crest team={player.team} tone={tone} />
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
                        gap: 0.35,
                        color: "#c4b8a0",
                        fontSize: "0.5rem",
                        fontWeight: 800,
                        letterSpacing: "0.02em",
                        lineHeight: 1,
                        textTransform: "uppercase",
                        whiteSpace: "nowrap",
                    }}
                >
                    <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", color: tone.bright }}>
                        {text.record}
                    </Box>
                    <Box component="span" sx={{ flex: "0 0 auto", color: "#8b7960" }}>
                        ·
                    </Box>
                    <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                        {text.winRate}
                    </Box>
                </Box>
            </Box>
        </Box>
    );
};

const MatchupToggle: React.FC<{ collapsed: boolean; onClick: () => void }> = ({ collapsed, onClick }) => (
    <Box
        component="button"
        type="button"
        aria-expanded={!collapsed}
        aria-label={collapsed ? "Show matchup" : "Hide matchup"}
        title={collapsed ? "Show matchup" : "Hide matchup"}
        onClick={onClick}
        sx={{
            position: "absolute",
            zIndex: 2,
            top: collapsed ? 0 : 16,
            right: collapsed ? 0 : -7,
            width: collapsed ? 36 : 16,
            height: collapsed ? 30 : 21,
            p: 0,
            pointerEvents: "auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "1px",
            border: "1px solid rgba(208,173,101,.4)",
            borderLeftColor: "rgba(255,226,158,.3)",
            borderRadius: collapsed ? "4px 2px 4px 2px" : "2px 4px 4px 2px",
            color: "rgba(241,213,138,.72)",
            background: "linear-gradient(180deg, rgba(53,41,25,.86), rgba(16,13,10,.9) 58%, rgba(37,27,18,.88))",
            boxShadow: "0 2px 6px rgba(0,0,0,.46), inset 0 1px rgba(255,235,183,.08)",
            fontFamily: hocDisplayFontFamily,
            fontSize: collapsed ? "0.52rem" : "0.78rem",
            fontWeight: 700,
            lineHeight: 1,
            letterSpacing: collapsed ? "0.04em" : 0,
            opacity: collapsed ? 0.82 : 0.62,
            cursor: "var(--hoc-cursor-interactive), pointer",
            transition: "filter 140ms ease, opacity 140ms ease, transform 140ms ease",
            "&:hover": {
                filter: "brightness(1.12)",
                opacity: 1,
                transform: "translateY(-1px)",
            },
            "&:active": { transform: "translateY(1px)" },
        }}
    >
        {collapsed ? "VS" : "›"}
        {collapsed && (
            <Box component="span" aria-hidden="true" sx={{ fontSize: "0.62rem", color: "rgba(185,154,88,.7)" }}>
                ‹
            </Box>
        )}
    </Box>
);

/**
 * Compact matchup strip shared by ranked drafting and battle. Player identity is public ranked data; until
 * it arrives (or for an AI/unranked player) the panel remains stable with honest fallbacks.
 */
export const MatchupOverlay: React.FC<MatchupOverlayProps> = ({
    players,
    placement,
    fightStarted = false,
    status,
    windowSize,
    viewerTeam,
}) => {
    const [profiles, setProfiles] = useState<Record<string, PublicPlayerStats>>({});
    const [collapsed, setCollapsed] = useState(readMatchupCollapsed);
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
            players.find((player) => player.team === MATCHUP_LOWER_TEAM),
            players.find((player) => player.team === MATCHUP_UPPER_TEAM),
        ],
        [players],
    );
    const left = ordered[0] ?? { team: MATCHUP_LOWER_TEAM, label: "Green" };
    const right = ordered[1] ?? { team: MATCHUP_UPPER_TEAM, label: "Red" };
    const presetId = readPlayerArmyColorId();
    const leftTone = matchupTeamTone(left.team, viewerTeam, presetId);
    const rightTone = matchupTeamTone(right.team, viewerTeam, presetId);
    const fightPosition = placement === "fight" && windowSize ? fightMatchupOverlayPosition(windowSize) : undefined;
    const centred = placement === "pick" || (placement === "fight" && fightStarted);
    const fightRightEdge = fightPosition?.right ?? 16;
    const toggleCollapsed = (): void => {
        setCollapsed((current) => {
            const next = !current;
            writeMatchupCollapsed(next);
            return next;
        });
    };

    return (
        <Box
            data-testid={`matchup-overlay-${placement}`}
            sx={{
                position: "fixed",
                zIndex: placement === "fight" ? 7000 : 65,
                pointerEvents: "none",
                top: placement === "fight" ? `${fightPosition?.top ?? 16}px` : 0,
                left: centred ? "50%" : `calc(100% - ${fightRightEdge}px)`,
                transform: centred ? "translateX(-50%)" : "translateX(-100%)",
                width: collapsed ? 36 : "min(298px, calc(100vw - 24px))",
                height: collapsed ? 30 : 54,
                maxWidth: placement === "fight" && !collapsed ? `${fightPosition?.maxWidth ?? 298}px` : undefined,
                transition: "left 260ms ease, transform 260ms ease, width 180ms ease, height 180ms ease",
            }}
        >
            {!collapsed && (
                <Box
                    sx={{
                        position: "relative",
                        width: "100%",
                        height: "100%",
                        px: 1,
                        py: 0.75,
                        overflow: "hidden",
                        display: "grid",
                        gridTemplateColumns: "minmax(0, 1fr) 38px minmax(0, 1fr)",
                        alignItems: "center",
                        gap: 0.5,
                        border: "1px solid rgba(211,173,92,.62)",
                        borderBottom: "2px solid rgba(180,140,67,.92)",
                        clipPath:
                            "polygon(0 0, 5% 0, 7% 7%, 93% 7%, 95% 0, 100% 0, 100% 88%, 97% 100%, 3% 100%, 0 88%)",
                        background: `linear-gradient(90deg, ${leftTone.panel}, rgba(13,18,16,.97) 39%, rgba(30,19,18,.97) 61%, ${rightTone.panel})`,
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
                        tone={leftTone}
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
                        tone={rightTone}
                        profile={(right.playerId ? profiles[right.playerId] : undefined) ?? right.previewProfile}
                        reversed
                    />
                </Box>
            )}
            <MatchupToggle collapsed={collapsed} onClick={toggleCollapsed} />
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
    const normalizedUserTeam = userTeam === MATCHUP_UPPER_TEAM ? MATCHUP_UPPER_TEAM : MATCHUP_LOWER_TEAM;
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
                          wins: 142,
                          draws: 6,
                          losses: 74,
                          winRatePct: 64,
                      }
                    : undefined,
            },
            {
                team: normalizedUserTeam === MATCHUP_LOWER_TEAM ? MATCHUP_UPPER_TEAM : MATCHUP_LOWER_TEAM,
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
                          wins: 98,
                          draws: 7,
                          losses: 64,
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
                        team: team.team === "lower" ? MATCHUP_LOWER_TEAM : MATCHUP_UPPER_TEAM,
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

    return <MatchupOverlay players={players} placement="pick" status={status} viewerTeam={normalizedUserTeam} />;
};
