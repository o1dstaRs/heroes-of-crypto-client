import { type TeamType } from "@heroesofcrypto/common";
import Box from "@mui/joy/Box";
import Tooltip from "@mui/joy/Tooltip";
import Typography from "@mui/joy/Typography";
import React, { useEffect, useMemo, useState } from "react";

import { fetchPickObserveSnapshot } from "../api/ranked_play_client";
import { fetchPublicPlayerStats, type PublicPlayerStats } from "../api/social_client";
import { images } from "../generated/image_imports";
import { battleSidebarWidth } from "../pixi/boardFit";
import { readPlayerArmyColorId } from "../settings/playerArmyColor";
import { readBoardSidePreference, shouldMirrorBoard } from "../settings/playerBoardSide";
import { CreaturePortraitImage } from "./CreaturePortraitImage";
import { hocDisplayFontFamily } from "./hocTheme";
import { MATCHUP_LOWER_TEAM, MATCHUP_UPPER_TEAM, matchupTeamTone, type MatchupTeamTone } from "./matchupOverlayTone";
import type { OpponentConnectionLabel } from "./opponentConnection";
import { LeagueEmblem } from "./PlayerPortal/LeagueEmblem";
import { useFullscreenActive } from "./useFullscreenActive";
import { creatureName, timeAgo } from "./PlayerPortal/portalFormat";

export type MatchupPlayer = Readonly<{
    playerId?: string;
    team: TeamType;
    /** Used immediately, before the public profile request resolves, and for non-ranked seats such as an AI. */
    label?: string;
    isAi?: boolean;
    /** Stable data used only by backend-free preview routes. Live games always resolve the public profile. */
    previewProfile?: PublicPlayerStats;
    /** Replaces the record line with a live note (co-op: Ready / Not ready / Away). */
    note?: string;
    noteTone?: "good" | "muted" | "warn";
    /**
     * This seat's presence right now — disconnected, AI driving, just back — as a plaque under the name.
     * It outranks the note and the record: an absent opponent is the one thing worth reading mid-fight.
     */
    connection?: OpponentConnectionLabel;
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
    /**
     * The viewer sees the board mirrored (settings/playerBoardSide): their army stands on the other side from
     * the one the match seated them on, so the strip swaps its two sides to agree with the board under it.
     */
    mirrored?: boolean;
    /** A control docked at the strip's right edge (pointer events enabled): the co-op sandbox's Leave. */
    action?: React.ReactNode;
    /**
     * Drop the strip behind the draft board. The inspector readout shares the header band with it, and the
     * creature the player is reading beats a scoreboard they are not.
     */
    demoted?: boolean;
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

/**
 * Windowed browsers give the draft far less vertical room than fullscreen, and the strip is the one piece of
 * chrome that overlaps the board's top band there. Fullscreen keeps the authored size.
 */
export const MATCHUP_WINDOWED_SCALE = 0.85;

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

const Crest: React.FC<{ team: TeamType; tone: MatchupTeamTone; size?: number }> = ({ team, tone, size = 38 }) => {
    return (
        <Box
            aria-hidden="true"
            sx={{
                width: size,
                height: Math.round(size * 1.08),
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
                    fontSize: Math.round(size * 0.45),
                    fontWeight: 700,
                    lineHeight: 1,
                    textShadow: "0 1px 2px rgba(0,0,0,.92)",
                },
            }}
        />
    );
};

const AiAvatar: React.FC<{ label: string; size?: number }> = ({ label, size = 43 }) => (
    <Box
        component="img"
        src={images.combat_toolbar_ember_ai}
        alt={label}
        sx={{
            width: size,
            height: size,
            flex: "0 0 auto",
            objectFit: "contain",
            filter: "drop-shadow(0 2px 3px rgba(0,0,0,.72)) drop-shadow(0 0 3px rgba(211,173,92,.28))",
            userSelect: "none",
        }}
    />
);

const PlayerAvatar: React.FC<{
    player: MatchupPlayer;
    profile?: PublicPlayerStats;
    size: number;
    text: MatchupProfile;
    tone: MatchupTeamTone;
}> = ({ player, profile, size, text, tone }) =>
    player.isAi ? (
        <AiAvatar label={`${text.username} — AI`} size={size} />
    ) : profile ? (
        <LeagueEmblem
            label={`${text.username} — ${text.rank}`}
            league={profile.league ?? 0}
            wealth={profile.wealth ?? 0}
            size={size}
            variant={size <= 48 ? "compact" : "default"}
        />
    ) : (
        <Crest team={player.team} tone={tone} size={size} />
    );

const DetailStat: React.FC<{ label: string; value: string | number; color?: string }> = ({ label, value, color }) => (
    <Box
        sx={{
            minWidth: 0,
            px: 0.7,
            py: 0.65,
            border: "1px solid rgba(234,204,133,.12)",
            borderRadius: "6px",
            bgcolor: "rgba(0,0,0,.24)",
            textAlign: "center",
        }}
    >
        <Typography
            sx={{
                color: color ?? "#f3e7ce",
                fontFamily: hocDisplayFontFamily,
                fontSize: "0.8rem",
                fontWeight: 900,
                fontVariantNumeric: "tabular-nums",
                lineHeight: 1,
            }}
        >
            {value}
        </Typography>
        <Typography
            sx={{
                mt: "4px",
                color: "#958873",
                fontFamily: hocDisplayFontFamily,
                fontSize: "0.48rem",
                fontWeight: 800,
                letterSpacing: "0.08em",
                lineHeight: 1,
                textTransform: "uppercase",
            }}
        >
            {label}
        </Typography>
    </Box>
);

const PickPortrait: React.FC<{ creatureId: number; size?: number }> = ({ creatureId, size = 26 }) => (
    <CreaturePortraitImage
        creatureId={creatureId}
        alt={creatureName(creatureId)}
        title={creatureName(creatureId)}
        highQualityArt
        sx={{
            width: size,
            height: size,
            flex: "0 0 auto",
            border: "1px solid rgba(222,180,91,.54)",
            borderRadius: "5px",
            boxShadow: "0 2px 5px rgba(0,0,0,.45)",
        }}
    />
);

const MatchupPlayerCard: React.FC<{
    player: MatchupPlayer;
    profile?: PublicPlayerStats;
    tone: MatchupTeamTone;
}> = ({ player, profile, tone }) => {
    const text = profileFor(player, profile);
    const recent = (profile?.recentGames ?? []).slice(0, 3);
    const popularPicks = (profile?.playstyle?.topCreatures ?? []).slice(0, 6);
    const streak =
        (profile?.winStreak ?? 0) > 0
            ? `${profile?.winStreak}W`
            : (profile?.lossStreak ?? 0) > 0
              ? `${profile?.lossStreak}L`
              : "—";
    const streakColor =
        (profile?.winStreak ?? 0) > 0 ? "#8de3a1" : (profile?.lossStreak ?? 0) > 0 ? "#ee9a90" : undefined;
    const standing = [
        profile?.standingTitle || text.rank,
        (profile?.leaderboardRank ?? 0) > 0 ? `#${profile?.leaderboardRank}` : "",
    ]
        .filter(Boolean)
        .join(" · ");

    return (
        <Box
            sx={{
                width: 320,
                p: 1.25,
                overflow: "hidden",
                border: `1px solid ${tone.edge}`,
                borderRadius: "10px",
                background: `radial-gradient(circle at 18% 0%, ${tone.panel}, rgba(13,10,8,.985) 56%), linear-gradient(145deg, rgba(31,25,17,.98), rgba(8,7,6,.99))`,
                boxShadow: `0 16px 38px rgba(0,0,0,.78), 0 0 14px ${tone.edge}, inset 0 1px rgba(255,235,180,.13)`,
            }}
        >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.2 }}>
                <PlayerAvatar player={player} profile={profile} size={76} text={text} tone={tone} />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography
                        sx={{
                            overflow: "hidden",
                            color: "#f6ead4",
                            fontFamily: hocDisplayFontFamily,
                            fontSize: "1.05rem",
                            fontWeight: 900,
                            letterSpacing: "0.055em",
                            lineHeight: 1.08,
                            textOverflow: "ellipsis",
                            textTransform: "uppercase",
                            whiteSpace: "nowrap",
                        }}
                    >
                        {text.username}
                    </Typography>
                    <Typography
                        sx={{
                            mt: 0.55,
                            color: tone.bright,
                            fontFamily: hocDisplayFontFamily,
                            fontSize: "0.68rem",
                            fontWeight: 800,
                            letterSpacing: "0.035em",
                            lineHeight: 1.2,
                        }}
                    >
                        {player.isAi ? "AI opponent" : standing || "Rank unavailable"}
                    </Typography>
                    {!player.isAi && (
                        <Typography
                            sx={{
                                mt: 0.65,
                                color: "#d9ccb3",
                                fontFamily: hocDisplayFontFamily,
                                fontSize: "0.64rem",
                                fontWeight: 800,
                                fontVariantNumeric: "tabular-nums",
                                letterSpacing: "0.015em",
                            }}
                        >
                            {text.record} ·{" "}
                            <Box component="span" sx={{ color: "#fff0c9" }}>
                                {text.winRate}
                            </Box>
                        </Typography>
                    )}
                </Box>
            </Box>

            {player.isAi ? (
                <Typography sx={{ mt: 1, color: "#9d907a", fontSize: "0.65rem", lineHeight: 1.35 }}>
                    Computer-controlled rival. Ranked player statistics are not applicable.
                </Typography>
            ) : (
                <>
                    <Box
                        sx={{ mt: 1.15, display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 0.55 }}
                    >
                        <DetailStat label="MMR" value={(profile?.mmr ?? 0) > 0 ? Math.round(profile?.mmr ?? 0) : "—"} />
                        <DetailStat
                            label="Peak"
                            value={(profile?.peakMmr ?? 0) > 0 ? Math.round(profile?.peakMmr ?? 0) : "—"}
                        />
                        <DetailStat label="Games" value={profile?.totalGames ?? "—"} />
                        <DetailStat label="Streak" value={streak} color={streakColor} />
                    </Box>

                    <Typography
                        sx={{
                            mt: 1.15,
                            color: "#cfae69",
                            fontFamily: hocDisplayFontFamily,
                            fontSize: "0.56rem",
                            fontWeight: 900,
                            letterSpacing: "0.12em",
                            textTransform: "uppercase",
                        }}
                    >
                        Recent battles
                    </Typography>
                    <Box sx={{ mt: 0.5, display: "grid", gap: 0.45 }}>
                        {recent.length > 0 ? (
                            recent.map((match) => {
                                const result =
                                    match.result === "win"
                                        ? { label: "W", color: "#8de3a1", bg: "rgba(69,150,92,.2)" }
                                        : match.result === "loss"
                                          ? { label: "L", color: "#ee9a90", bg: "rgba(157,66,66,.2)" }
                                          : { label: "D", color: "#e6c774", bg: "rgba(169,137,62,.18)" };
                                return (
                                    <Box
                                        key={match.gameId}
                                        sx={{
                                            minWidth: 0,
                                            px: 0.65,
                                            py: 0.5,
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 0.6,
                                            border: "1px solid rgba(234,204,133,.09)",
                                            borderRadius: "6px",
                                            bgcolor: "rgba(0,0,0,.2)",
                                        }}
                                    >
                                        <Box
                                            sx={{
                                                width: 21,
                                                height: 21,
                                                flex: "0 0 auto",
                                                display: "grid",
                                                placeItems: "center",
                                                border: `1px solid ${result.color}`,
                                                borderRadius: "5px",
                                                bgcolor: result.bg,
                                                color: result.color,
                                                fontFamily: hocDisplayFontFamily,
                                                fontSize: "0.62rem",
                                                fontWeight: 900,
                                            }}
                                        >
                                            {result.label}
                                        </Box>
                                        <Box sx={{ minWidth: 0, flex: 1 }}>
                                            <Typography
                                                sx={{
                                                    overflow: "hidden",
                                                    color: "#dcd0b9",
                                                    fontSize: "0.61rem",
                                                    fontWeight: 750,
                                                    lineHeight: 1.1,
                                                    textOverflow: "ellipsis",
                                                    whiteSpace: "nowrap",
                                                }}
                                            >
                                                {match.opponent?.username
                                                    ? `vs ${match.opponent.username}`
                                                    : "Ranked battle"}
                                            </Typography>
                                            <Typography
                                                sx={{ mt: "2px", color: "#857a69", fontSize: "0.52rem", lineHeight: 1 }}
                                            >
                                                {timeAgo(match.finishedTime) || "Recently"}
                                            </Typography>
                                        </Box>
                                        {(match.creatureIds ?? []).slice(0, 6).map((creatureId, index) => (
                                            <PickPortrait
                                                key={`${match.gameId}:${creatureId}:${index}`}
                                                creatureId={creatureId}
                                                size={22}
                                            />
                                        ))}
                                    </Box>
                                );
                            })
                        ) : (
                            <Typography sx={{ color: "#857a69", fontSize: "0.6rem" }}>
                                No recent public matches.
                            </Typography>
                        )}
                    </Box>

                    {popularPicks.length > 0 && (
                        <Box sx={{ mt: 0.85, display: "flex", alignItems: "center", gap: 0.5 }}>
                            <Typography
                                sx={{
                                    mr: 0.25,
                                    color: "#958873",
                                    fontFamily: hocDisplayFontFamily,
                                    fontSize: "0.51rem",
                                    fontWeight: 850,
                                    letterSpacing: "0.08em",
                                    textTransform: "uppercase",
                                }}
                            >
                                Popular picks
                            </Typography>
                            {popularPicks.map((pick, index) => (
                                <PickPortrait key={`${pick.creatureId}:${index}`} creatureId={pick.creatureId} />
                            ))}
                        </Box>
                    )}
                </>
            )}
        </Box>
    );
};

/** The rich player-hover surface shared by the VS bar and post-fight participant portraits. */
export const MatchupPlayerTooltip: React.FC<{
    player: MatchupPlayer;
    profile?: PublicPlayerStats;
    tone: MatchupTeamTone;
    placement?: "bottom" | "bottom-start" | "bottom-end";
    children: React.ReactElement;
}> = ({ player, profile, tone, placement = "bottom-start", children }) => (
    <Tooltip
        arrow
        enterDelay={160}
        leaveDelay={110}
        placement={placement}
        variant="plain"
        sx={{
            "--Tooltip-arrowSize": "8px",
            zIndex: 18000,
            maxWidth: "none",
            p: 0,
            bgcolor: "transparent",
            boxShadow: "none",
        }}
        title={<MatchupPlayerCard player={player} profile={profile} tone={tone} />}
    >
        {children}
    </Tooltip>
);

const PRESENCE_TONES = {
    good: { text: "#8de3a1", dot: "#77dd92", border: "rgba(120,214,142,.55)", glow: "rgba(101,212,133,.32)" },
    warn: { text: "#ffc59a", dot: "#ff9a5c", border: "rgba(226,140,74,.62)", glow: "rgba(236,138,66,.34)" },
} as const;

/**
 * The presence plaque that rides beside a player's name: a breathing dot, two words, and the clock that is
 * actually running. The full sentence stays on the element for screen readers.
 */
const SeatPresence: React.FC<{ connection: OpponentConnectionLabel; reversed: boolean }> = ({
    connection,
    reversed,
}) => {
    const tone = PRESENCE_TONES[connection.tone];
    return (
        <Box sx={{ mt: "4px", display: "flex", minWidth: 0, justifyContent: reversed ? "flex-end" : "flex-start" }}>
            <Box
                aria-label={connection.full}
                sx={{
                    "@keyframes hocSeatPresencePulse": {
                        "0%, 100%": { opacity: 1, transform: "scale(1)" },
                        "50%": { opacity: 0.4, transform: "scale(0.78)" },
                    },
                    minWidth: 0,
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    px: "4px",
                    py: "2px",
                    borderRadius: "2px 5px 2px 5px",
                    border: `1px solid ${tone.border}`,
                    background: "linear-gradient(180deg, rgba(38,26,16,.92), rgba(14,10,8,.94))",
                    boxShadow: `inset 0 1px rgba(255,236,196,.08), 0 0 10px ${tone.glow}`,
                }}
            >
                <Box
                    component="span"
                    aria-hidden="true"
                    sx={{
                        flex: "0 0 auto",
                        width: 5,
                        height: 5,
                        borderRadius: "50%",
                        bgcolor: tone.dot,
                        boxShadow: `0 0 6px ${tone.dot}`,
                        animation: "hocSeatPresencePulse 1.5s ease-in-out infinite",
                    }}
                />
                <Box
                    component="span"
                    sx={{
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        color: tone.text,
                        fontFamily: hocDisplayFontFamily,
                        fontSize: "0.58rem",
                        fontWeight: 900,
                        fontVariantNumeric: "lining-nums tabular-nums",
                        letterSpacing: "0.03em",
                        lineHeight: 1.15,
                        textTransform: "uppercase",
                        textShadow: "0 1px 2px #000",
                    }}
                >
                    {connection.short}
                </Box>
            </Box>
        </Box>
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
        <MatchupPlayerTooltip
            player={player}
            profile={profile}
            tone={tone}
            placement={reversed ? "bottom-end" : "bottom-start"}
        >
            <Box
                tabIndex={0}
                aria-label={`Show ${text.username} details`}
                sx={{
                    minWidth: 0,
                    display: "flex",
                    alignItems: "center",
                    gap: 0.9,
                    flexDirection: reversed ? "row-reverse" : "row",
                    textAlign: reversed ? "right" : "left",
                    pointerEvents: "auto",
                    cursor: "help",
                    outline: "none",
                    "&:focus-visible": {
                        borderRadius: "5px",
                        boxShadow: `0 0 0 1px ${tone.bright}`,
                    },
                }}
            >
                <PlayerAvatar player={player} profile={profile} size={player.isAi ? 43 : 42} text={text} tone={tone} />
                <Box sx={{ minWidth: 0, flex: "1 1 auto" }}>
                    <Typography
                        level="body-sm"
                        sx={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            color: "#f2e7d0",
                            fontFamily: hocDisplayFontFamily,
                            fontSize: "0.77rem",
                            fontWeight: 800,
                            letterSpacing: "0.055em",
                            lineHeight: 1.1,
                            textTransform: "uppercase",
                        }}
                    >
                        {text.username}
                    </Typography>
                    {player.connection ? (
                        <SeatPresence connection={player.connection} reversed={reversed} />
                    ) : player.isAi ? null : player.note ? (
                        <Typography
                            sx={{
                                mt: "4px",
                                color:
                                    player.noteTone === "good"
                                        ? "#8de3a1"
                                        : player.noteTone === "warn"
                                          ? "#ffb08a"
                                          : "#a89b82",
                                fontFamily: hocDisplayFontFamily,
                                fontSize: "0.62rem",
                                fontWeight: 900,
                                letterSpacing: "0.04em",
                                lineHeight: 1,
                                textTransform: "uppercase",
                                whiteSpace: "nowrap",
                                textShadow: "0 1px 2px #000",
                            }}
                        >
                            {player.note}
                        </Typography>
                    ) : (
                        <Box
                            sx={{
                                mt: "4px",
                                display: "flex",
                                minWidth: 0,
                                alignItems: "center",
                                justifyContent: reversed ? "flex-end" : "flex-start",
                                gap: 0.45,
                                color: "#eadfc8",
                                fontSize: "0.66rem",
                                fontWeight: 900,
                                fontVariantNumeric: "lining-nums tabular-nums",
                                letterSpacing: "0.01em",
                                lineHeight: 1,
                                textTransform: "uppercase",
                                whiteSpace: "nowrap",
                            }}
                        >
                            <Box
                                component="span"
                                sx={{
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    color: tone.bright,
                                    textShadow: "0 1px 2px #000",
                                }}
                            >
                                {text.record}
                            </Box>
                            <Box component="span" sx={{ flex: "0 0 auto", color: "#8b7960" }}>
                                ·
                            </Box>
                            <Box
                                component="span"
                                sx={{
                                    flex: "0 0 auto",
                                    color: "#fff0c9",
                                    fontSize: "0.69rem",
                                    fontWeight: 900,
                                    letterSpacing: 0,
                                    textShadow: "0 1px 2px #000",
                                }}
                            >
                                {text.winRate}
                            </Box>
                        </Box>
                    )}
                </Box>
            </Box>
        </MatchupPlayerTooltip>
    );
};

const MatchupToggle: React.FC<{
    collapsed: boolean;
    /** A presence notice the folded strip is hiding; the tab glows instead of overriding the player's choice. */
    alert?: Readonly<{ tone: "good" | "warn"; title: string }>;
    onClick: () => void;
}> = ({ collapsed, alert, onClick }) => {
    const tone = alert && collapsed ? PRESENCE_TONES[alert.tone] : undefined;
    return (
        <Box
            component="button"
            type="button"
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Show matchup" : "Hide matchup"}
            title={tone ? alert!.title : collapsed ? "Show matchup" : "Hide matchup"}
            onClick={onClick}
            sx={{
                "@keyframes hocMatchupAlertGlow": {
                    "0%, 100%": { boxShadow: `0 2px 6px rgba(0,0,0,.46), 0 0 0 ${tone?.glow ?? "transparent"}` },
                    "50%": { boxShadow: `0 2px 6px rgba(0,0,0,.46), 0 0 13px ${tone?.glow ?? "transparent"}` },
                },
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
                border: `1px solid ${tone?.border ?? "rgba(208,173,101,.4)"}`,
                borderLeftColor: tone?.border ?? "rgba(255,226,158,.3)",
                borderRadius: collapsed ? "4px 2px 4px 2px" : "2px 4px 4px 2px",
                color: tone?.text ?? "rgba(241,213,138,.72)",
                background: "linear-gradient(180deg, rgba(53,41,25,.86), rgba(16,13,10,.9) 58%, rgba(37,27,18,.88))",
                boxShadow: "0 2px 6px rgba(0,0,0,.46), inset 0 1px rgba(255,235,183,.08)",
                animation: tone ? "hocMatchupAlertGlow 1.6s ease-in-out infinite" : undefined,
                fontFamily: hocDisplayFontFamily,
                fontSize: collapsed ? "0.52rem" : "0.78rem",
                fontWeight: 700,
                lineHeight: 1,
                letterSpacing: collapsed ? "0.04em" : 0,
                opacity: tone ? 1 : collapsed ? 0.82 : 0.62,
                outline: "none",
                cursor: "var(--hoc-cursor-interactive), pointer",
                transition: "filter 140ms ease, opacity 140ms ease, transform 140ms ease",
                "&:focus-visible": {
                    outline: "1px solid rgba(218,182,106,.52)",
                    outlineOffset: "1px",
                },
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
                <Box
                    component="span"
                    aria-hidden="true"
                    sx={{ fontSize: "0.62rem", color: tone?.dot ?? "rgba(185,154,88,.7)" }}
                >
                    ‹
                </Box>
            )}
        </Box>
    );
};

/**
 * The two seats in the order they appear across the strip, left of the VS first: the LEFT seat on the left,
 * the way the board is dealt, unless this viewer sees the board mirrored.
 */
export const matchupScreenOrder = (
    players: readonly MatchupPlayer[],
    mirrored = false,
): readonly [MatchupPlayer, MatchupPlayer] => {
    const lower = players.find((player) => player.team === MATCHUP_LOWER_TEAM) ?? {
        team: MATCHUP_LOWER_TEAM,
        label: "Green",
    };
    const upper = players.find((player) => player.team === MATCHUP_UPPER_TEAM) ?? {
        team: MATCHUP_UPPER_TEAM,
        label: "Red",
    };
    return mirrored ? [upper, lower] : [lower, upper];
};

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
    mirrored = false,
    action,
    demoted = false,
}) => {
    const [profiles, setProfiles] = useState<Record<string, PublicPlayerStats>>({});
    const [collapsed, setCollapsed] = useState(readMatchupCollapsed);
    const isFullscreen = useFullscreenActive();
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

    const [left, right] = useMemo(() => matchupScreenOrder(players, mirrored), [players, mirrored]);
    const presetId = readPlayerArmyColorId();
    const leftTone = matchupTeamTone(left.team, viewerTeam, presetId);
    const rightTone = matchupTeamTone(right.team, viewerTeam, presetId);
    const fightPosition = placement === "fight" && windowSize ? fightMatchupOverlayPosition(windowSize) : undefined;
    const centred = placement === "pick" || (placement === "fight" && fightStarted);
    const fightRightEdge = fightPosition?.right ?? 16;
    const scale = !isFullscreen && placement === "pick" ? MATCHUP_WINDOWED_SCALE : 1;
    const placementTransform = centred ? "translateX(-50%)" : "translateX(-100%)";
    // A presence plaque needs more room beside the name than the record line it replaces.
    const connectionAlert = players.find((player) => player.connection)?.connection;
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
                zIndex: placement === "fight" ? 7000 : demoted ? 1 : 65,
                pointerEvents: "none",
                top: placement === "fight" ? `${fightPosition?.top ?? 16}px` : 0,
                left: centred ? "50%" : `calc(100% - ${fightRightEdge}px)`,
                transform: scale === 1 ? placementTransform : `${placementTransform} scale(${scale})`,
                // Scale about the anchored edge so the strip shrinks in place instead of drifting off it.
                transformOrigin: centred ? "top center" : "top right",
                width: collapsed
                    ? 36
                    : action
                      ? "min(400px, calc(100vw - 24px))"
                      : connectionAlert
                        ? "min(440px, calc(100vw - 24px))"
                        : "min(326px, calc(100vw - 24px))",
                height: collapsed ? 30 : 58,
                maxWidth:
                    placement === "fight" && !collapsed
                        ? `${(fightPosition?.maxWidth ?? 326) + (action ? 74 : 0)}px`
                        : undefined,
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
                        gridTemplateColumns: action
                            ? "minmax(0, 1fr) 40px minmax(0, 1fr) auto"
                            : "minmax(0, 1fr) 40px minmax(0, 1fr)",
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
                            height: 38,
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
                                    fontSize: "0.78rem",
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
                    {action && (
                        <Box sx={{ pointerEvents: "auto", pl: 0.5, display: "grid", alignItems: "center" }}>
                            {action}
                        </Box>
                    )}
                </Box>
            )}
            <MatchupToggle
                collapsed={collapsed}
                alert={connectionAlert ? { tone: connectionAlert.tone, title: connectionAlert.full } : undefined}
                onClick={toggleCollapsed}
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
    /** True while the header band is showing a creature/artifact readout. */
    demoted?: boolean;
}> = ({ gameId, userTeam, opponentLabel = "Opponent", status = "Draft", demoted = false }) => {
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

    // No board exists yet, but this is the same strip the fight shows. Seat the player on the side they chose to
    // see their army on, so the strip does not swap sides the moment the fight starts.
    const mirrored = shouldMirrorBoard({
        viewerTeam: normalizedUserTeam,
        preference: readBoardSidePreference(),
        live: true,
    });

    return (
        <MatchupOverlay
            players={players}
            placement="pick"
            status={status}
            viewerTeam={normalizedUserTeam}
            mirrored={mirrored}
            demoted={demoted}
        />
    );
};
