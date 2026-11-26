import {
    PROFILE_MATCH_HISTORY_ID,
    PROFILE_MATCH_PAGE_SIZE,
    profileWinRateTone,
    renderProfileForm,
    renderProfileStanding,
    renderProfileSummaryStats,
} from "./profilePresentation";
import { PlayerPlaystyle } from "../PlayerPlaystyle/PlayerPlaystyle";
import { Box, Sheet, Skeleton, Stack, Typography } from "@mui/joy";
import { Artifact } from "@heroesofcrypto/common";
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router";

import { displayedGold } from "../../api/goldDisplay";
import { tf, useTranslation } from "../../i18n/i18n";

import { images } from "../../generated/image_imports";
import { useAuthContext } from "../auth/context/auth_context";
import { setSession } from "../auth/context/auth_utils";
import { CurrencyIcon } from "../GoldCurrencyIcon";
import { hocColors, hocPanelSx } from "../hocTheme";
import { LeagueTransitionReveal } from "../LeagueTransitionReveal";
import { ExitNavIcon, RankedNavIcon, RefreshNavIcon, SettingsNavIcon } from "../svg/navigation";
import { PlayerSettingsPanel } from "../PlayerSettingsPanel";
import { useRankedSeason } from "../useRankedSeason";
import { MatchHistory } from "./MatchHistory";
import { matchReplayPath, matchResultPresentation, normalizeMatchSetup } from "./matchHistoryModel";
import { CreatureIcon, creatureName, timeAgo, winRatePct } from "./portalFormat";
import { CalibrationProgress, standingEmblem } from "./CalibrationProgress";
import { PortalAvatar } from "./PortalAvatar";
import { PlayerPortalContentSkeleton, PlayerPortalFrame, portalRevealSx, portalScrollSx } from "./PlayerPortalLoading";
import { usePlayerPortal } from "./usePlayerPortal";
import { useRankedStanding } from "./useRankedStanding";
import { ReputationCard } from "../Reputation/ReputationCard";

const nestedPortalScrollSx = {
    ...portalScrollSx,
    overflowX: "hidden",
    pr: 0.5,
    "&:focus-visible": {
        outline: `2px solid ${hocColors.gold}`,
        outlineOffset: "3px",
    },
} as const;

const Section: React.FC<{
    title: string;
    id?: string;
    featured?: boolean;
    children: React.ReactNode;
    headingAction?: React.ReactNode;
}> = ({ title, id, featured = false, children, headingAction }) => (
    <section
        className={featured ? "hoc-profile-section hoc-profile-section--featured" : "hoc-profile-section"}
        id={id}
        tabIndex={id ? -1 : undefined}
    >
        <header className="hoc-profile-section-heading">
            <h2 className="hoc-profile-section-title">{title}</h2>
            {headingAction}
        </header>
        {children}
    </section>
);

/** Tier-aware artifact lookup for the stats row: name + codex icon, straight from the shared catalog. */
export const playerPortalArtifactInfo = (tier: 1 | 2, artifactId: number): Artifact.ArtifactProperties | undefined =>
    tier === 1
        ? Artifact.TIER1_ARTIFACTS[artifactId as Artifact.Tier1Artifact]
        : Artifact.TIER2_ARTIFACTS[artifactId as Artifact.Tier2Artifact];

export const playerPortalCreatureLineupLabel = (creatureIds: readonly number[]): string =>
    [...new Set(creatureIds)].map(creatureName).join(" + ");

type PortalUsageStat = { games?: number | null; wins?: number | null };

export function playerPortalMostPlayedFirst<T extends PortalUsageStat>(stats: readonly T[]): T[] {
    return [...stats].sort(
        (a, b) =>
            (b.games ?? 0) - (a.games ?? 0) ||
            winRatePct(b.wins ?? 0, b.games ?? 0) - winRatePct(a.wins ?? 0, a.games ?? 0),
    );
}

const compactArtworkSx = {
    width: 36,
    height: 36,
    flex: "0 0 36px",
    border: "1px solid rgba(220,177,88,0.28)",
    borderRadius: "6px",
    bgcolor: "rgba(0,0,0,0.35)",
    objectFit: "cover",
} as const;

const ProfileRecordRow: React.FC<{
    artwork: React.ReactNode;
    badge?: string;
    games: number;
    label: string;
    wins: number;
    wideArtwork?: boolean;
}> = ({ artwork, badge, games, label, wins, wideArtwork }) => {
    const pct = winRatePct(wins, games);
    const gamesLabel = games === 1 ? tf("{count} game", { count: games }) : tf("{count} games", { count: games });

    return (
        <article className="hoc-profile-record" data-wide-art={wideArtwork || undefined}>
            <div className="hoc-profile-record-art">{artwork}</div>
            <div className="hoc-profile-record-copy">
                <strong className="hoc-profile-record-name">{label}</strong>
                <span className="hoc-profile-record-sample">{badge ? `${badge} · ${gamesLabel}` : gamesLabel}</span>
            </div>
            <strong className="hoc-profile-record-rate" data-tone={profileWinRateTone(pct)}>
                {pct}%
            </strong>
        </article>
    );
};

const CreatureStrategyArtwork: React.FC<{ creatureIds: readonly number[] }> = ({ creatureIds }) => (
    <div className="hoc-profile-lineup">
        {creatureIds.map((id) => (
            <CreatureIcon key={id} creatureId={id} size="var(--hoc-profile-lineup-tile)" />
        ))}
    </div>
);

const StrategyGroup: React.FC<{ title: string; subtitle: string; children: React.ReactNode }> = ({
    title,
    subtitle,
    children,
}) => (
    <section>
        <h3 className="hoc-profile-group-title">{title}</h3>
        <p className="hoc-profile-group-description">{subtitle}</p>
        {children}
    </section>
);

const ArtifactStatRow: React.FC<{ tier: 1 | 2; artifactId: number; games: number; wins: number }> = ({
    tier,
    artifactId,
    games,
    wins,
}) => {
    const info = playerPortalArtifactInfo(tier, artifactId);
    const src = info ? (images as Record<string, string>)[info.imageKey] : undefined;
    // Artifact names come from the shared catalog and stay in English, like creature names do.
    const label = info?.name ?? tf("Artifact {id}", { id: artifactId });
    const artwork = src ? (
        <Box component="img" src={src} alt={label} sx={{ ...compactArtworkSx, objectFit: "contain" }} />
    ) : (
        <Box sx={{ ...compactArtworkSx, display: "grid", placeItems: "center", color: hocColors.gold }}>T{tier}</Box>
    );
    return <ProfileRecordRow artwork={artwork} badge={`T${tier}`} games={games} label={label} wins={wins} />;
};

const ComboRow: React.FC<{ creatureIds: number[]; games: number; wins: number }> = ({ creatureIds, games, wins }) => {
    const units = [...new Set(creatureIds)];
    return (
        <ProfileRecordRow
            artwork={<CreatureStrategyArtwork creatureIds={units} />}
            games={games}
            label={playerPortalCreatureLineupLabel(units)}
            wins={wins}
            wideArtwork={units.length > 3}
        />
    );
};

/**
 * Rows shown in each "Winning strategies" column.
 *
 * All three columns share one cap. They render as side-by-side lists of equal width, so letting the pairs
 * column run longer than the combo columns did not read as extra information — it left a tall empty
 * rectangle under the two shorter ones.
 */
const STRATEGY_LIST_LENGTH = 6;

/**
 * Leave the account from the portal. A successful call lets the auth service end the session, but a
 * network or server failure must not strand the player inside an account they asked to leave: drop this
 * browser's credentials too, and land on the login screen either way. A missing auth context (mock
 * portal mode) counts as a failed sign-out rather than a completed one.
 */
export const playerPortalExitAccount = async ({
    logout,
    clearSession,
    redirect,
}: {
    logout: (() => Promise<void>) | undefined;
    clearSession: (accessToken: string | null) => void;
    redirect: () => void;
}): Promise<void> => {
    try {
        if (typeof logout !== "function") {
            throw new Error("auth context is unavailable");
        }
        await logout();
    } catch {
        clearSession(null);
    } finally {
        redirect();
    }
};

export const PlayerPortalPage: React.FC = () => {
    const navigate = useNavigate();
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [exiting, setExiting] = useState(false);
    const { logout, user } = useAuthContext();
    const { data, loading, error, reload, reloadKey } = usePlayerPortal();
    const standing = useRankedStanding(`${reloadKey}:${data?.total_games_played ?? 0}`);
    const { t, language } = useTranslation();
    const { currency, seasons } = useRankedSeason();
    // Reload this route rather than navigating in place: a full load re-runs the auth bootstrap, so no
    // session state survives in memory. "/portal" (not "/", which is the sandbox board) renders the login
    // screen while signed out and returns the player to their profile once they sign back in.
    const exitAccount = async () => {
        setExiting(true);
        await playerPortalExitAccount({
            logout,
            clearSession: setSession,
            redirect: () => window.location.assign("/portal"),
        });
    };

    const combos = useMemo(() => data?.combos ?? [], [data?.combos]);
    const displayedCombos = useMemo(() => {
        const trios = combos.filter((combo) => new Set(combo.creature_ids ?? []).size === 3);
        return trios.length > 0 ? trios : combos.filter((combo) => new Set(combo.creature_ids ?? []).size > 3);
    }, [combos]);
    const bestCombos = useMemo(
        () =>
            [...displayedCombos]
                .filter((c) => (c.games ?? 0) >= 2)
                .sort((a, b) => winRatePct(b.wins ?? 0, b.games ?? 0) - winRatePct(a.wins ?? 0, a.games ?? 0))
                .slice(0, STRATEGY_LIST_LENGTH),
        [displayedCombos],
    );
    const mostPlayedCombos = useMemo(() => [...displayedCombos].slice(0, STRATEGY_LIST_LENGTH), [displayedCombos]);
    // Dense usage lists are ordered by sample size; win rate only breaks equal-game ties.
    const creatureStats = useMemo(() => playerPortalMostPlayedFirst(data?.creature_stats ?? []), [data]);
    const matches = useMemo(() => data?.recent_matches ?? [], [data?.recent_matches]);
    // Shown as the total, available plus gold in play (see goldDisplay); the portal payload carries only available.
    const totalGold =
        displayedGold({ gold: Math.max(0, Number(data?.gold ?? 0)), totalGold: standing?.totalGold }) ?? 0;
    // New payloads carry independently aggregated pairs. Keep deriving them from legacy full-lineup payloads
    // as a rollout fallback so the client and auth server can deploy in either order.
    const strongestPairs = useMemo(() => {
        const directPairs = combos
            .filter((combo) => new Set(combo.creature_ids ?? []).size === 2)
            .map((combo) => {
                const [a, b] = [...new Set(combo.creature_ids ?? [])].sort((x, y) => x - y);
                return { a, b, games: combo.games ?? 0, wins: combo.wins ?? 0 };
            });
        if (directPairs.length > 0) {
            return directPairs
                .filter((pair) => pair.games >= 3)
                .sort((x, y) => winRatePct(y.wins, y.games) - winRatePct(x.wins, x.games) || y.games - x.games)
                .slice(0, STRATEGY_LIST_LENGTH);
        }
        const byPair = new Map<string, { a: number; b: number; games: number; wins: number }>();
        for (const combo of combos) {
            const games = combo.games ?? 0;
            if (!games) {
                continue;
            }
            const wins = combo.wins ?? 0;
            const ids = [...new Set(combo.creature_ids ?? [])].sort((x, y) => x - y);
            for (let i = 0; i < ids.length; i += 1) {
                for (let j = i + 1; j < ids.length; j += 1) {
                    const key = `${ids[i]}:${ids[j]}`;
                    const entry = byPair.get(key) ?? { a: ids[i], b: ids[j], games: 0, wins: 0 };
                    entry.games += games;
                    entry.wins += wins;
                    byPair.set(key, entry);
                }
            }
        }
        return [...byPair.values()]
            .filter((pair) => pair.games >= 3)
            .sort((x, y) => winRatePct(y.wins, y.games) - winRatePct(x.wins, x.games) || y.games - x.games)
            .slice(0, STRATEGY_LIST_LENGTH);
    }, [combos]);
    // Artifact win rates across the recent-matches window (draws excluded, empty slots skipped).
    const artifactStats = useMemo(() => {
        const byArtifact = new Map<string, { tier: 1 | 2; artifactId: number; games: number; wins: number }>();
        for (const match of matches) {
            if (match.draw) {
                continue;
            }
            const setup = normalizeMatchSetup(match.player_setup);
            for (const [tier, artifactId] of [
                [1, setup.artifactTier1],
                [2, setup.artifactTier2],
            ] as const) {
                if (!artifactId) {
                    continue;
                }
                const key = `${tier}:${artifactId}`;
                const entry = byArtifact.get(key) ?? { tier, artifactId, games: 0, wins: 0 };
                entry.games += 1;
                entry.wins += match.won ? 1 : 0;
                byArtifact.set(key, entry);
            }
        }
        return playerPortalMostPlayedFirst([...byArtifact.values()]);
    }, [matches]);
    const games = data?.total_games_played ?? 0;
    const wins = data?.wins ?? 0;
    const overallPct = winRatePct(wins, games);
    const numbers = new Intl.NumberFormat(language);
    const form = renderProfileForm(
        matches.map((match) => {
            const result = matchResultPresentation(match);
            return result.label === "Unscored" || result.label === "Voided" ? "none" : result.tone;
        }),
        {
            title: t("Last 10 matches"),
            win: t("Victory"),
            loss: t("Defeat"),
            draw: t("Draw"),
            empty: t("No result"),
        },
    );

    return (
        <PlayerPortalFrame busy={loading && !data}>
            {import.meta.env.DEV && (
                <LeagueTransitionReveal active={false} enabled={false} gameId="portal-league-reveal-preview" />
            )}
            <header className="hoc-profile-header">
                <div className="hoc-profile-identity">
                    <div className="hoc-profile-emblem">
                        <PortalAvatar standing={standing} size="100%" />
                    </div>
                    <div>
                        <div className="hoc-profile-heading">
                            <h1 className="hoc-profile-name">
                                {data?.username || user?.username || t("Player Profile")}
                            </h1>
                            {data ? (
                                <span className="hoc-profile-balance" title={t(currency.name)}>
                                    <CurrencyIcon iconSvg={currency.iconSvg} size={16} />
                                    {numbers.format(totalGold)} {currency.symbol}
                                </span>
                            ) : (
                                <Skeleton variant="rectangular" width={72} height={18} animation={false} />
                            )}
                        </div>
                        {standing?.state === "placed" ? (
                            <p
                                className="hoc-profile-standing"
                                dangerouslySetInnerHTML={{
                                    __html: renderProfileStanding(standingEmblem(standing).label, [
                                        `${numbers.format(standing.mmr)} ${t("MMR")}`,
                                        standing.leaderboardRank > 0
                                            ? `#${numbers.format(standing.leaderboardRank)}`
                                            : "",
                                    ]),
                                }}
                            />
                        ) : standing ? (
                            <CalibrationProgress standing={standing} dense />
                        ) : (
                            <Skeleton
                                variant="rectangular"
                                width={156}
                                height={16}
                                animation={false}
                                sx={{ mt: 0.5 }}
                            />
                        )}
                        {!!data?.last_login && (
                            <p className="hoc-profile-meta">
                                {tf("last seen {when}", { when: timeAgo(data.last_login) })}
                            </p>
                        )}
                    </div>
                </div>
                <div className="hoc-profile-actions" data-account-actions>
                    <button
                        type="button"
                        className="hoc-profile-action hoc-profile-action--primary"
                        onClick={() => navigate("/play")}
                    >
                        <RankedNavIcon sx={{ fontSize: 16, color: "inherit" }} />
                        {t("Ranked arena")}
                    </button>
                    <button type="button" className="hoc-profile-action" onClick={reload} disabled={loading}>
                        <RefreshNavIcon sx={{ fontSize: 16 }} />
                        {t("Refresh")}
                    </button>
                    <button
                        type="button"
                        className="hoc-profile-action"
                        aria-haspopup="dialog"
                        aria-expanded={settingsOpen}
                        onClick={() => setSettingsOpen(true)}
                    >
                        <SettingsNavIcon sx={{ fontSize: 16 }} />
                        {t("Settings")}
                    </button>
                    <button type="button" className="hoc-profile-action" onClick={exitAccount} disabled={exiting}>
                        <ExitNavIcon sx={{ fontSize: 16 }} />
                        {exiting ? t("Signing out…") : t("Exit account")}
                    </button>
                </div>
                {data && (
                    <div className="hoc-profile-summary">
                        <dl
                            className="hoc-profile-stats"
                            dangerouslySetInnerHTML={{
                                __html: renderProfileSummaryStats(
                                    { games, wins, losses: data.losses ?? 0, winRate: overallPct },
                                    { games: t("Games"), wins: t("Wins"), losses: t("Losses"), winRate: t("Win rate") },
                                    language,
                                ),
                            }}
                        />
                        {form && <div dangerouslySetInnerHTML={{ __html: form }} />}
                    </div>
                )}
            </header>

            <PlayerSettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />

            {loading && !data && <PlayerPortalContentSkeleton />}
            {!loading && error && (
                <Sheet variant="outlined" sx={{ p: 2, mb: 2, ...hocPanelSx }}>
                    <Typography textColor={hocColors.danger}>{error}</Typography>
                </Sheet>
            )}

            {data && (
                <Box className="hoc-profile-body" sx={portalRevealSx}>
                    <PlayerPlaystyle
                        playerId={standing?.playerId}
                        reloadKey={reloadKey}
                        language={language}
                        wrap={(body) => (
                            <Section
                                featured
                                title={language === "ru" ? "Стиль игры" : "Playstyle"}
                                headingAction={
                                    <a className="hoc-profile-section-link" href={`#${PROFILE_MATCH_HISTORY_ID}`}>
                                        {t("Match history")}
                                    </a>
                                }
                            >
                                {body}
                            </Section>
                        )}
                    />

                    <Section title={t("Match history")} id={PROFILE_MATCH_HISTORY_ID}>
                        <MatchHistory
                            filterable
                            matches={matches}
                            pageSize={PROFILE_MATCH_PAGE_SIZE}
                            onReplay={(match) => navigate(matchReplayPath(match))}
                            seasons={seasons}
                        />
                    </Section>

                    <Section title={t("Winning strategies")}>
                        <div className="hoc-profile-columns">
                            <StrategyGroup
                                title={t("Favourite combos")}
                                subtitle={t("Your most-played creature line-ups")}
                            >
                                {mostPlayedCombos.length === 0 && (
                                    <Typography level="body-sm" textColor={hocColors.muted}>
                                        {t("Play a few matches to build up combo stats.")}
                                    </Typography>
                                )}
                                {mostPlayedCombos.map((c, i) => (
                                    <ComboRow
                                        key={`mp_${i}`}
                                        creatureIds={c.creature_ids ?? []}
                                        games={c.games ?? 0}
                                        wins={c.wins ?? 0}
                                    />
                                ))}
                            </StrategyGroup>

                            <StrategyGroup
                                title={t("Best winning strategies")}
                                subtitle={t("Highest win rate (2+ games)")}
                            >
                                {bestCombos.length === 0 && (
                                    <Typography level="body-sm" textColor={hocColors.muted}>
                                        {t("Not enough repeated line-ups yet.")}
                                    </Typography>
                                )}
                                {bestCombos.map((c, i) => (
                                    <ComboRow
                                        key={`bc_${i}`}
                                        creatureIds={c.creature_ids ?? []}
                                        games={c.games ?? 0}
                                        wins={c.wins ?? 0}
                                    />
                                ))}
                            </StrategyGroup>

                            <StrategyGroup
                                title={t("Strongest pairs")}
                                subtitle={t("Creature duos that win together (3+ games)")}
                            >
                                {strongestPairs.length === 0 && (
                                    <Typography level="body-sm" textColor={hocColors.muted}>
                                        {t("Field the same duo a few times to reveal your best pairings.")}
                                    </Typography>
                                )}
                                {strongestPairs.map((pair) => (
                                    <ComboRow
                                        key={`pair_${pair.a}_${pair.b}`}
                                        creatureIds={[pair.a, pair.b]}
                                        games={pair.games}
                                        wins={pair.wins}
                                    />
                                ))}
                            </StrategyGroup>
                        </div>
                    </Section>

                    <div className="hoc-profile-columns">
                        <Section title={t("Artifacts")}>
                            <Stack
                                spacing={0.5}
                                role="region"
                                aria-label={t("Artifact statistics")}
                                tabIndex={0}
                                sx={{ maxHeight: 420, overflowY: "auto", ...nestedPortalScrollSx }}
                            >
                                {artifactStats.length === 0 && (
                                    <Typography level="body-sm" textColor={hocColors.muted}>
                                        {t("Pick artifacts in ranked drafts to build up artifact stats.")}
                                    </Typography>
                                )}
                                {artifactStats.map((stat) => (
                                    <ArtifactStatRow
                                        key={`art_${stat.tier}_${stat.artifactId}`}
                                        tier={stat.tier}
                                        artifactId={stat.artifactId}
                                        games={stat.games}
                                        wins={stat.wins}
                                    />
                                ))}
                            </Stack>
                        </Section>

                        <Section title={t("Creatures")}>
                            <Stack
                                spacing={0.5}
                                role="region"
                                aria-label={t("Creature statistics")}
                                tabIndex={0}
                                sx={{ maxHeight: 420, overflowY: "auto", ...nestedPortalScrollSx }}
                            >
                                {creatureStats.length === 0 && (
                                    <Typography level="body-sm" textColor={hocColors.muted}>
                                        {t("No creature stats yet.")}
                                    </Typography>
                                )}
                                {creatureStats.map((stat) => {
                                    const creatureId = stat.creature_id ?? 0;
                                    return (
                                        <ProfileRecordRow
                                            key={creatureId}
                                            artwork={<CreatureIcon creatureId={creatureId} size={36} />}
                                            games={stat.games ?? 0}
                                            label={creatureName(creatureId)}
                                            wins={stat.wins ?? 0}
                                        />
                                    );
                                })}
                            </Stack>
                        </Section>
                    </div>

                    <ReputationCard reloadKey={reloadKey} />
                </Box>
            )}
        </PlayerPortalFrame>
    );
};
