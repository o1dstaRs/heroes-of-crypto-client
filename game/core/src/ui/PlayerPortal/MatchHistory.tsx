import { Artifact, Doctrine, SynergyKeysToPower, TeamVals } from "@heroesofcrypto/common";
import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import ExploreRoundedIcon from "@mui/icons-material/ExploreRounded";
import LoopRoundedIcon from "@mui/icons-material/LoopRounded";
import MilitaryTechRoundedIcon from "@mui/icons-material/MilitaryTechRounded";
import ReplayRoundedIcon from "@mui/icons-material/ReplayRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import { Alert, Box, Button, IconButton, Stack, Tooltip, Typography } from "@mui/joy";
import React, { useId, useState } from "react";

import type { MatchHistoryScope } from "../../api/player_portal_client";
import { rankedSeasonCurrencyAt, type RankedSeasonCatalog } from "../../api/ranked_season_client";
import { images } from "../../generated/image_imports";
import { t, tf, useTranslation } from "../../i18n/i18n";
import { CurrencyIcon } from "../GoldCurrencyIcon";
import { SYNERGY_KEY_TO_IMAGE, SYNERGY_NAME_TO_DESCRIPTION } from "../LeftSideBar/SynergiesConstants";
import { hocColors } from "../hocTheme";
import { getDoctrineIconImage } from "../doctrineCopy";
import { SynergyLevelDots } from "../SynergyLevelDots";
import {
    formatMatchDamage,
    formatMatchDuration,
    formatSignedMatchValue,
    matchKindPresentation,
    matchOpponentProfileHref,
    matchResultPresentation,
    normalizeMatchSetup,
    normalizePerformances,
    type MatchAugmentChoice,
    type MatchHistoryFilter,
    type MatchTeamSetup,
    type PortalMatchData,
    type PortalUnitPerformanceData,
} from "./matchHistoryModel";
import { profileRatingTone } from "./profilePresentation";
import { augmentEffectSummary } from "./augmentEffect";
import { CreatureIcon, creatureName, InfoCard, timeAgo } from "./portalFormat";
import { MatchHistorySearchControls } from "./MatchHistorySearchControls";
import { useMatchHistorySearch } from "./useMatchHistorySearch";
import "./profilePresentation.css";

// Which side the player fought as, coloured to match the board: team LEFT is green (always the bottom),
// team RIGHT is red (always the top). Team-fixed, never viewer-relative — see scenes/teamColors.ts.
const SIDE_PRESENTATION: Record<"green" | "red", { label: string; color: string }> = {
    green: { label: "Green", color: "#46d160" },
    red: { label: "Red", color: "#ff5a5a" },
};
const matchSide = (team: number | undefined): "green" | "red" | undefined => {
    if (team === TeamVals.LEFT) return "green";
    if (team === TeamVals.RIGHT) return "red";
    return undefined;
};

const AUGMENT_IMAGE_KEY: Record<MatchAugmentChoice["kind"], keyof typeof images> = {
    Placement: "board_augment_256",
    Armor: "armor_augment_256",
    Might: "might_augment_256",
    Empower: "empower_augment_256",
    Sniper: "sniper_augment_256",
    Movement: "movement_augment_256",
};

const SYNERGY_NAMES: Record<string, string> = {
    "Life:1": "Deep reserves",
    "Life:2": "High spirits",
    "Chaos:1": "Rapid advance",
    "Chaos:2": "Disrupting strikes",
    "Might:1": "Aura mastery",
    "Might:2": "Ability mastery",
    "Nature:1": "Expanded ranks",
    "Nature:2": "Winged armor",
};

const synergyName = (key: string): string => {
    const [faction, id] = key.split(":");
    const name = SYNERGY_NAMES[`${faction}:${id}`];
    return name ? t(name) : tf("{faction} synergy", { faction: faction ? t(faction) : t("Unknown") });
};

const synergyLevel = (key: string): number => {
    const level = Number(key.split(":")[2]);
    return Number.isFinite(level) ? Math.max(0, Math.floor(level)) : 0;
};

const synergyDescription = (key: string): string => {
    const template = SYNERGY_NAME_TO_DESCRIPTION[key as keyof typeof SYNERGY_NAME_TO_DESCRIPTION];
    if (!template) {
        return synergyName(key);
    }
    let powerIndex = 0;
    return template.replace(/\{\}/g, () => {
        const power = SynergyKeysToPower[key]?.[powerIndex];
        powerIndex += 1;
        return power?.toString() ?? "0";
    });
};

const artifactsForSetup = (setup: MatchTeamSetup): Artifact.ArtifactProperties[] =>
    [
        setup.artifactTier1 > 0 ? Artifact.TIER1_ARTIFACTS[setup.artifactTier1 as Artifact.Tier1Artifact] : undefined,
        setup.artifactTier2 > 0 ? Artifact.TIER2_ARTIFACTS[setup.artifactTier2 as Artifact.Tier2Artifact] : undefined,
    ].filter((artifact): artifact is Artifact.ArtifactProperties => !!artifact);

interface MatchHistoryProps {
    compact?: boolean;
    filterable?: boolean;
    pageSize?: number;
    matches: readonly PortalMatchData[];
    onReplay: (match: PortalMatchData) => void;
    seasons: RankedSeasonCatalog;
}

interface RosterStripProps {
    compact: boolean;
    creatureIds: readonly number[];
    label: string;
    muted?: boolean;
}

const RosterStrip: React.FC<RosterStripProps> = ({ compact, creatureIds, label, muted = false }) => (
    <Box sx={{ minWidth: 0, opacity: muted ? 0.72 : 1 }}>
        <Typography
            level="body-xs"
            sx={{ color: hocColors.muted, fontSize: compact ? "0.63rem" : "0.68rem", mb: 0.35 }}
        >
            {label}
        </Typography>
        <Stack direction="row" spacing={0.4} sx={{ flexWrap: "wrap", minHeight: compact ? 20 : 38 }}>
            {creatureIds.slice(0, 8).map((creatureId, index) => (
                <CreatureIcon
                    key={`${label}_${creatureId}_${index}`}
                    creatureId={creatureId}
                    size={compact ? 20 : 38}
                />
            ))}
            {creatureIds.length === 0 && (
                <Typography level="body-xs" textColor={hocColors.muted}>
                    {t("Unknown roster")}
                </Typography>
            )}
        </Stack>
    </Box>
);

const MetadataItem: React.FC<{ icon: React.ReactNode; label: string }> = ({ icon, label }) => (
    <Stack direction="row" spacing={0.4} alignItems="center">
        <Box sx={{ color: hocColors.muted, display: "flex", "& svg": { fontSize: 14 } }}>{icon}</Box>
        <Typography level="body-xs" textColor={hocColors.muted} sx={{ whiteSpace: "nowrap" }}>
            {label}
        </Typography>
    </Stack>
);

const RewardBadge: React.FC<{
    icon?: React.ReactNode;
    label: string;
    tone: "gold" | ReturnType<typeof profileRatingTone>;
}> = ({ icon, label, tone }) => (
    <span className="hoc-profile-match-reward" data-tone={tone}>
        {icon}
        {label}
    </span>
);

const Metric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <div className="hoc-profile-stat">
        <dt>{label}</dt>
        <dd>{value}</dd>
    </div>
);

/**
 * One side's per-creature damage.
 *
 * The rows run in TWO columns from sm up. A single column stretched to half the panel put the creature
 * name hard left and its damage hard right with several hundred pixels of nothing between them, which is
 * what made the figures hard to associate with their unit. Two narrower columns keep each name next to
 * its own number and halve the block's height, which is what buys the larger portrait and type below.
 */
const PerformanceList: React.FC<{
    label: string;
    performances: readonly PortalUnitPerformanceData[];
}> = ({ label, performances }) => (
    <Box sx={{ minWidth: 0 }}>
        <Typography level="body-xs" textColor={hocColors.muted} sx={{ mb: 0.75 }}>
            {label}
        </Typography>
        <Box
            sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))", lg: "repeat(3, minmax(0, 1fr))" },
                columnGap: { xs: 2, lg: 2.5 },
                rowGap: 0.65,
            }}
        >
            {performances.map((performance, index) => {
                const creatureId = performance.creature_id ?? 0;
                return (
                    <Stack
                        key={`${creatureId}_${index}`}
                        direction="row"
                        spacing={1}
                        alignItems="center"
                        sx={{ minWidth: 0 }}
                    >
                        <Box
                            sx={{
                                borderRadius: "7px",
                                boxShadow: index === 0 ? `0 0 0 1px ${hocColors.gold}` : "none",
                                flexShrink: 0,
                            }}
                        >
                            <CreatureIcon creatureId={creatureId} size={34} />
                        </Box>
                        <Typography level="body-sm" textColor={hocColors.mutedStrong} noWrap sx={{ flex: 1 }}>
                            {creatureName(creatureId)}
                        </Typography>
                        <Typography
                            level="body-sm"
                            sx={{
                                color: index === 0 ? hocColors.gold : hocColors.muted,
                                fontWeight: index === 0 ? 700 : 500,
                                whiteSpace: "nowrap",
                            }}
                        >
                            {tf("{amount} dmg", { amount: formatMatchDamage(performance.damage_dealt) })}
                        </Typography>
                    </Stack>
                );
            })}
            {performances.length === 0 && (
                <Typography level="body-xs" textColor={hocColors.muted}>
                    {t("No damage data")}
                </Typography>
            )}
        </Box>
    </Box>
);

const SetupChoice: React.FC<{
    alt?: string;
    badge?: string;
    belowIcon?: React.ReactNode;
    /** Plain-text summary for assistive tech; the hover card is `tooltip` when given. */
    detail: string;
    fallback?: React.ReactNode;
    image?: string;
    name: string;
    roundImage?: boolean;
    tooltip?: React.ReactNode;
}> = ({ alt = "", badge, belowIcon, detail, fallback, image, name, roundImage = false, tooltip }) => (
    <Tooltip title={tooltip ?? detail} placement="top" size="sm" variant="soft">
        <span className="hoc-profile-choice">
            <span className="hoc-profile-choice-art">
                {image ? (
                    <img
                        src={image}
                        alt={alt}
                        width={30}
                        height={30}
                        className={roundImage ? "hoc-profile-choice-round" : undefined}
                    />
                ) : (
                    fallback
                )}
                {belowIcon}
            </span>
            <span>{name}</span>
            {badge && <strong className="hoc-profile-choice-badge">{badge}</strong>}
        </span>
    </Tooltip>
);

const SetupSummaryIcon: React.FC<{
    alt?: string;
    badge?: string;
    compact: boolean;
    /** Plain-text summary for assistive tech; the hover card is `tooltip` when given. */
    detail: string;
    fallback?: React.ReactNode;
    image?: string;
    roundImage?: boolean;
    tooltip?: React.ReactNode;
}> = ({ alt = "", badge, compact, detail, fallback, image, roundImage = false, tooltip }) => {
    const size = compact ? 24 : 32;
    return (
        <Tooltip title={tooltip ?? detail} placement="top" size="sm" variant="soft">
            <Box
                aria-label={detail}
                sx={{
                    position: "relative",
                    width: size,
                    height: size,
                    flex: `0 0 ${size}px`,
                    display: "grid",
                    placeItems: "center",
                    borderRadius: roundImage ? "50%" : "5px",
                    overflow: "visible",
                    bgcolor: "rgba(0,0,0,0.3)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: hocColors.gold,
                    "& svg": { fontSize: compact ? 15 : 18 },
                }}
            >
                {image ? (
                    <Box
                        component="img"
                        src={image}
                        alt={alt}
                        sx={{
                            width: roundImage ? "100%" : size - 3,
                            height: roundImage ? "100%" : size - 3,
                            borderRadius: roundImage ? "50%" : 0,
                            objectFit: roundImage ? "cover" : "contain",
                        }}
                    />
                ) : (
                    fallback
                )}
                {badge && (
                    <Box
                        component="span"
                        sx={{
                            position: "absolute",
                            right: -3,
                            bottom: -3,
                            minWidth: compact ? 13 : 15,
                            height: compact ? 11 : 12,
                            px: 0.2,
                            display: "grid",
                            placeItems: "center",
                            borderRadius: "3px",
                            bgcolor: "#3a2204",
                            border: `1px solid ${hocColors.orangeBorder}`,
                            color: hocColors.gold,
                            fontSize: compact ? "0.44rem" : "0.5rem",
                            fontWeight: 800,
                            lineHeight: 1,
                        }}
                    >
                        {badge}
                    </Box>
                )}
            </Box>
        </Tooltip>
    );
};

const SetupSummaryGroup: React.FC<{
    children: React.ReactNode;
    compact: boolean;
    label: string;
}> = ({ children, compact, label }) => (
    <Box sx={{ minWidth: 0 }}>
        <Typography
            level="body-xs"
            textColor={hocColors.muted}
            sx={{ mb: 0.35, fontSize: compact ? "0.56rem" : "0.62rem" }}
        >
            {label}
        </Typography>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: compact ? 0.45 : 0.55 }}>{children}</Box>
    </Box>
);

const SetupSummary: React.FC<{
    compact: boolean;
    /** Set when the build sits beside the two armies rather than stacked under them, so it drops its own
     * top margin and lets the shared grid own the spacing. */
    inline?: boolean;
    setup: MatchTeamSetup;
}> = ({ compact, inline = false, setup }) => {
    if (!setup.available) {
        return (
            <Typography level="body-xs" textColor={hocColors.muted} sx={{ mt: inline ? 0 : 0.75 }}>
                {t("Build data unavailable")}
            </Typography>
        );
    }

    const doctrine = Doctrine.getDoctrineProperties(setup.doctrine as Doctrine.Doctrine);
    const doctrineName = t(doctrine.name);
    const artifacts = artifactsForSetup(setup);
    return (
        <Box sx={{ mt: inline ? 0 : compact ? 0.65 : 0.8, minWidth: 0 }}>
            <Typography
                level="body-xs"
                sx={{ color: hocColors.mutedStrong, mb: 0.45, fontSize: compact ? "0.6rem" : "0.66rem" }}
            >
                {t("Your build")}
            </Typography>
            <Box sx={{ display: "flex", alignItems: "flex-start", flexWrap: "wrap", gap: compact ? 0.7 : 0.9 }}>
                <SetupSummaryGroup compact={compact} label={t("Doctrine")}>
                    <SetupSummaryIcon
                        alt={doctrineName}
                        badge={`${doctrine.upgradePoints}`}
                        compact={compact}
                        detail={`${doctrineName}: ${t(doctrine.description)}`}
                        fallback={<ExploreRoundedIcon />}
                        image={getDoctrineIconImage(doctrine.id)}
                        roundImage
                        tooltip={
                            <InfoCard
                                title={doctrineName}
                                subtitle={tf("{count} pts", { count: doctrine.upgradePoints })}
                                lines={[doctrine.description]}
                            />
                        }
                    />
                </SetupSummaryGroup>
                {artifacts.length > 0 && (
                    <SetupSummaryGroup compact={compact} label={t("Artifacts")}>
                        {artifacts.map((artifact) => (
                            <SetupSummaryIcon
                                key={`${artifact.tier}_${artifact.id}`}
                                alt={artifact.name}
                                badge={`T${artifact.tier}`}
                                compact={compact}
                                detail={`${artifact.name}: ${Artifact.formatArtifactDescription(artifact)}`}
                                image={(images as Record<string, string>)[artifact.imageKey]}
                                tooltip={
                                    <InfoCard
                                        title={artifact.name}
                                        subtitle={tf("Tier {tier} artifact", { tier: artifact.tier })}
                                        lines={[Artifact.formatArtifactDescription(artifact)]}
                                    />
                                }
                            />
                        ))}
                    </SetupSummaryGroup>
                )}
                {setup.complete && setup.augments.length > 0 && (
                    <SetupSummaryGroup compact={compact} label={t("Augments")}>
                        {setup.augments.map((augment) => {
                            const effect = augmentEffectSummary(augment.kind, augment.level);
                            return (
                                <SetupSummaryIcon
                                    key={augment.kind}
                                    alt={tf("{kind} augment", { kind: t(augment.kind) })}
                                    badge={`L${augment.level}`}
                                    compact={compact}
                                    detail={`${tf("{kind} augment, level {level}", {
                                        kind: t(augment.kind),
                                        level: augment.level,
                                    })}: ${effect}`}
                                    image={images[AUGMENT_IMAGE_KEY[augment.kind]]}
                                    tooltip={
                                        <InfoCard
                                            title={tf("{kind} augment", { kind: t(augment.kind) })}
                                            subtitle={tf("Level {level}", { level: augment.level })}
                                            lines={[effect]}
                                        />
                                    }
                                />
                            );
                        })}
                    </SetupSummaryGroup>
                )}
                {setup.complete && setup.synergies.length > 0 && (
                    <SetupSummaryGroup compact={compact} label={t("Synergies")}>
                        {setup.synergies.map((synergy) => {
                            const name = synergyName(synergy);
                            const level = synergyLevel(synergy);
                            return (
                                <Box key={synergy}>
                                    <SetupSummaryIcon
                                        alt={name}
                                        compact={compact}
                                        detail={tf("{name}, level {level}: {description}", {
                                            name,
                                            level,
                                            description: synergyDescription(synergy),
                                        })}
                                        fallback={<AutoAwesomeRoundedIcon />}
                                        image={SYNERGY_KEY_TO_IMAGE[synergy as keyof typeof SYNERGY_KEY_TO_IMAGE]}
                                        tooltip={
                                            <InfoCard
                                                title={name}
                                                subtitle={tf("Level {level}", { level })}
                                                lines={[synergyDescription(synergy)]}
                                            />
                                        }
                                    />
                                    <SynergyLevelDots faction={synergy.split(":", 1)[0]} level={level} />
                                </Box>
                            );
                        })}
                    </SetupSummaryGroup>
                )}
                {!setup.complete && (
                    <Typography level="body-xs" textColor={hocColors.muted} sx={{ alignSelf: "center" }}>
                        {t("Combat setup not recorded")}
                    </Typography>
                )}
            </Box>
        </Box>
    );
};

const SetupRow: React.FC<{ children: React.ReactNode; label: string }> = ({ children, label }) => (
    <Box sx={{ minWidth: 0 }}>
        <p className="hoc-profile-build-label">{label}</p>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.55, minWidth: 0 }}>{children}</Box>
    </Box>
);

const TeamBuildChoices: React.FC<{
    label: string;
    setup: MatchTeamSetup;
}> = ({ label, setup }) => {
    if (!setup.available) {
        return (
            <Box sx={{ minWidth: 0 }}>
                <h4 className="hoc-profile-build-title">{label}</h4>
                <Typography level="body-xs" textColor={hocColors.muted}>
                    {t("Build choices were not recorded for this match.")}
                </Typography>
            </Box>
        );
    }

    const doctrine = Doctrine.getDoctrineProperties(setup.doctrine as Doctrine.Doctrine);
    const doctrineName = t(doctrine.name);
    const artifacts = artifactsForSetup(setup);

    return (
        <Stack spacing={1.05} sx={{ minWidth: 0 }}>
            <h4 className="hoc-profile-build-title">{label}</h4>

            <SetupRow label={t("Doctrine")}>
                <SetupChoice
                    detail={t(doctrine.description)}
                    fallback={<ExploreRoundedIcon />}
                    image={getDoctrineIconImage(doctrine.id)}
                    name={doctrineName}
                    badge={tf("{count} pts", { count: doctrine.upgradePoints })}
                    roundImage
                    tooltip={
                        <InfoCard
                            title={doctrineName}
                            subtitle={tf("{count} pts", { count: doctrine.upgradePoints })}
                            lines={[doctrine.description]}
                        />
                    }
                />
            </SetupRow>

            <SetupRow label={t("Artifacts")}>
                {artifacts.map((artifact) => (
                    <SetupChoice
                        key={`${artifact.tier}_${artifact.id}`}
                        alt={artifact.name}
                        detail={Artifact.formatArtifactDescription(artifact)}
                        image={(images as Record<string, string>)[artifact.imageKey]}
                        name={artifact.name}
                        badge={`T${artifact.tier}`}
                        tooltip={
                            <InfoCard
                                title={artifact.name}
                                subtitle={tf("Tier {tier} artifact", { tier: artifact.tier })}
                                lines={[Artifact.formatArtifactDescription(artifact)]}
                            />
                        }
                    />
                ))}
                {artifacts.length === 0 && (
                    <Typography level="body-xs" textColor={hocColors.muted}>
                        {t("None recorded")}
                    </Typography>
                )}
            </SetupRow>

            {setup.complete ? (
                <>
                    <SetupRow label={t("Augments")}>
                        {setup.augments.map((augment) => {
                            const effect = augmentEffectSummary(augment.kind, augment.level);
                            return (
                                <SetupChoice
                                    key={augment.kind}
                                    alt={tf("{kind} augment", { kind: t(augment.kind) })}
                                    detail={`${tf("{kind} augment, level {level}", {
                                        kind: t(augment.kind),
                                        level: augment.level,
                                    })}: ${effect}`}
                                    image={images[AUGMENT_IMAGE_KEY[augment.kind]]}
                                    name={t(augment.kind)}
                                    badge={`L${augment.level}`}
                                    tooltip={
                                        <InfoCard
                                            title={tf("{kind} augment", { kind: t(augment.kind) })}
                                            subtitle={tf("Level {level}", { level: augment.level })}
                                            lines={[effect]}
                                        />
                                    }
                                />
                            );
                        })}
                    </SetupRow>

                    <SetupRow label={t("Synergies")}>
                        {setup.synergies.map((synergy) => {
                            const name = synergyName(synergy);
                            const level = synergyLevel(synergy);
                            return (
                                <SetupChoice
                                    key={synergy}
                                    belowIcon={<SynergyLevelDots faction={synergy.split(":", 1)[0]} level={level} />}
                                    detail={tf("Level {level}: {description}", {
                                        level,
                                        description: synergyDescription(synergy),
                                    })}
                                    image={SYNERGY_KEY_TO_IMAGE[synergy as keyof typeof SYNERGY_KEY_TO_IMAGE]}
                                    name={name}
                                    tooltip={
                                        <InfoCard
                                            title={name}
                                            subtitle={tf("Level {level}", { level })}
                                            lines={[synergyDescription(synergy)]}
                                        />
                                    }
                                />
                            );
                        })}
                        {setup.synergies.length === 0 && (
                            <Typography level="body-xs" textColor={hocColors.muted}>
                                {t("None recorded")}
                            </Typography>
                        )}
                    </SetupRow>
                </>
            ) : (
                <Typography
                    level="body-xs"
                    textColor={hocColors.muted}
                    sx={{ borderTop: "1px solid rgba(255,255,255,0.08)", pt: 0.9 }}
                >
                    {t("Augments and synergies were not recorded for this historical match.")}
                </Typography>
            )}
        </Stack>
    );
};

const BuildChoices: React.FC<{
    compact: boolean;
    match: PortalMatchData;
    opponent: string;
}> = ({ compact, match, opponent }) => {
    const playerSetup = normalizeMatchSetup(match.player_setup);
    const opponentSetup = normalizeMatchSetup(match.opponent_setup);

    return (
        <div className={compact ? "hoc-profile-builds hoc-profile-builds--compact" : "hoc-profile-builds"}>
            <TeamBuildChoices label={t("Your build")} setup={playerSetup} />
            <TeamBuildChoices label={tf("{opponent}'s build", { opponent })} setup={opponentSetup} />
        </div>
    );
};

const ReplayIconButton: React.FC<{
    available: boolean;
    compact: boolean;
    onClick: () => void;
}> = ({ available, compact, onClick }) => (
    <Tooltip title={available ? t("Replay match") : t("Replay unavailable for this match")} size="sm" variant="soft">
        <span style={{ display: "inline-flex" }}>
            <IconButton
                aria-label={available ? t("Replay match") : t("Replay unavailable")}
                disabled={!available}
                size={compact ? "sm" : "md"}
                variant="plain"
                onClick={onClick}
                sx={{
                    color: hocColors.gold,
                    minWidth: 44,
                    minHeight: 44,
                    "&:hover": { bgcolor: hocColors.orangeSoft },
                    "&.Mui-disabled": { color: "rgba(239, 228, 204, 0.25)" },
                }}
            >
                <ReplayRoundedIcon fontSize="small" />
            </IconButton>
        </span>
    </Tooltip>
);

const MatchCard: React.FC<{
    compact: boolean;
    expanded: boolean;
    match: PortalMatchData;
    onExpand: () => void;
    onReplay: () => void;
    seasons: RankedSeasonCatalog;
}> = ({ compact, expanded, match, onExpand, onReplay, seasons }) => {
    const detailsId = useId();
    const headingId = useId();
    const { language } = useTranslation();
    const result = matchResultPresentation(match);
    const kind = matchKindPresentation(match);
    const side = matchSide(match.team);
    const playerPerformances = normalizePerformances(match.player_top_units);
    const opponentPerformances = normalizePerformances(match.opponent_top_units);
    const topPlayer = playerPerformances[0];
    const duration = formatMatchDuration(match.duration_ms);
    const laps = Math.max(0, Number(match.total_laps ?? 0));
    const replayAvailable = !!match.replay_available;
    const opponent = match.opponent_username || t("Unknown opponent");
    const opponentProfileHref = matchOpponentProfileHref(match, language);
    const contextualDetailsLabel = tf(
        expanded ? "Collapse details: {result} vs {opponent}" : "Expand details: {result} vs {opponent}",
        { opponent, result: t(result.label) },
    );
    // Undefined keeps the browser default for English; Russian gets the day-first Russian ordering.
    const exactFinished = match.finished_time
        ? new Date(match.finished_time).toLocaleString(language === "ru" ? "ru-RU" : undefined)
        : t("Unknown");
    const playerSetup = normalizeMatchSetup(match.player_setup);
    const mmrBefore = Number.isFinite(match.mmr_before) ? Math.round(Number(match.mmr_before)) : 0;
    const mmrAfter = Number.isFinite(match.mmr_after) ? Math.round(Number(match.mmr_after)) : 0;
    const mmrDelta = formatSignedMatchValue(match.mmr_delta);
    const ratingTone = profileRatingTone(match.mmr_delta ?? 0);
    const goldEarned = Number.isFinite(match.gold_earned) ? Math.max(0, Math.round(Number(match.gold_earned))) : 0;
    const rewardCurrency = rankedSeasonCurrencyAt(seasons, match.finished_time);

    return (
        <article
            className="hoc-profile-match-card"
            aria-labelledby={headingId}
            data-game-id={match.game_id}
            data-result={result.tone}
        >
            <Box
                sx={{
                    position: "relative",
                    p: compact ? 1 : 1.25,
                    pl: compact ? 1.25 : 1.5,
                }}
            >
                <Box
                    component="button"
                    type="button"
                    aria-controls={detailsId}
                    data-profile-match-toggle
                    aria-expanded={expanded}
                    aria-label={contextualDetailsLabel}
                    onClick={onExpand}
                    sx={{
                        position: "absolute",
                        inset: 0,
                        zIndex: 1,
                        width: "100%",
                        m: 0,
                        p: 0,
                        appearance: "none",
                        border: 0,
                        borderRadius: "7px",
                        bgcolor: "transparent",
                        cursor: "pointer",
                        WebkitTapHighlightColor: "transparent",
                        transition: "background-color 150ms ease, box-shadow 150ms ease",
                        "&:hover": { bgcolor: "rgba(255,255,255,0.025)" },
                        "&:focus-visible": {
                            outline: `2px solid ${hocColors.gold}`,
                            outlineOffset: -3,
                        },
                    }}
                />

                <Box sx={{ position: "relative", zIndex: 2, pointerEvents: "none" }}>
                    <Stack direction="row" spacing={0.75} alignItems="center">
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                            <h3 id={headingId} className="hoc-profile-match-heading">
                                <strong className="hoc-profile-match-result">{t(result.label)}</strong> {t("vs")}{" "}
                                {opponentProfileHref ? (
                                    <Box
                                        component="a"
                                        href={opponentProfileHref}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        aria-label={tf("Open {opponent}'s profile in a new tab", { opponent })}
                                        onClick={(event) => event.stopPropagation()}
                                        sx={{
                                            position: "relative",
                                            zIndex: 3,
                                            color: "inherit",
                                            pointerEvents: "auto",
                                            textDecoration: "none",
                                            textUnderlineOffset: "0.18em",
                                            borderRadius: 2,
                                            "&:hover": { color: hocColors.gold, textDecoration: "underline" },
                                            "&:focus-visible": {
                                                color: hocColors.gold,
                                                outline: `2px solid ${hocColors.gold}`,
                                                outlineOffset: 2,
                                            },
                                        }}
                                    >
                                        {opponent}
                                    </Box>
                                ) : (
                                    opponent
                                )}
                            </h3>
                            <Stack
                                direction="row"
                                spacing={0.75}
                                alignItems="center"
                                sx={{ mt: 0.25, flexWrap: "wrap" }}
                            >
                                <Tooltip
                                    title={kind.detail ? t(kind.detail) : ""}
                                    placement="top"
                                    size="sm"
                                    variant="soft"
                                >
                                    <span className="hoc-profile-match-mode" data-mode={kind.tone}>
                                        {t(kind.label)}
                                    </span>
                                </Tooltip>
                                {side && (
                                    <Stack
                                        direction="row"
                                        spacing={0.375}
                                        alignItems="center"
                                        sx={{ whiteSpace: "nowrap" }}
                                    >
                                        <Box
                                            sx={{
                                                width: 7,
                                                height: 7,
                                                borderRadius: "50%",
                                                bgcolor: SIDE_PRESENTATION[side].color,
                                            }}
                                        />
                                        <Typography
                                            level="body-xs"
                                            sx={{ color: SIDE_PRESENTATION[side].color, fontWeight: 700 }}
                                        >
                                            {t(SIDE_PRESENTATION[side].label)}
                                        </Typography>
                                    </Stack>
                                )}
                                <Typography level="body-xs" textColor={hocColors.muted} sx={{ whiteSpace: "nowrap" }}>
                                    {timeAgo(match.finished_time ?? 0)}
                                </Typography>
                                {result.detail && (
                                    <Typography level="body-xs" sx={{ color: "var(--hoc-profile-result)" }}>
                                        {tf(result.detail, result.detailParams ?? {})}
                                    </Typography>
                                )}
                            </Stack>
                        </Box>
                        <Stack
                            direction="row"
                            spacing={1.25}
                            alignItems="center"
                            sx={{ display: { xs: "none", md: "flex" }, flexWrap: "wrap", flexShrink: 0, ml: 1 }}
                        >
                            {duration && <MetadataItem icon={<AccessTimeRoundedIcon />} label={duration} />}
                            {laps > 0 && (
                                <MetadataItem
                                    icon={<LoopRoundedIcon />}
                                    label={
                                        laps === 1
                                            ? tf("{count} lap", { count: laps })
                                            : tf("{count} laps", { count: laps })
                                    }
                                />
                            )}
                            {topPlayer && (
                                <Stack direction="row" spacing={0.45} alignItems="center" sx={{ minWidth: 0 }}>
                                    <MilitaryTechRoundedIcon sx={{ color: hocColors.gold, fontSize: 15 }} />
                                    <CreatureIcon creatureId={topPlayer.creature_id ?? 0} size={20} />
                                    <Typography level="body-xs" sx={{ color: hocColors.gold, whiteSpace: "nowrap" }}>
                                        {tf("{amount} dmg", { amount: formatMatchDamage(topPlayer.damage_dealt) })}
                                    </Typography>
                                </Stack>
                            )}
                            {kind.showsMmr && mmrDelta && (
                                <RewardBadge label={`${mmrDelta} ${t("MMR")}`} tone={ratingTone} />
                            )}
                            {kind.showsGold && goldEarned > 0 && (
                                <RewardBadge
                                    icon={<CurrencyIcon iconSvg={rewardCurrency.iconSvg} size={13} />}
                                    label={`+${goldEarned.toLocaleString(language)}`}
                                    tone="gold"
                                />
                            )}
                        </Stack>
                        <Box sx={{ position: "relative", zIndex: 3, pointerEvents: "auto" }}>
                            <ReplayIconButton available={replayAvailable} compact={compact} onClick={onReplay} />
                        </Box>
                        <Box
                            aria-hidden="true"
                            sx={{
                                display: "grid",
                                placeItems: "center",
                                width: 32,
                                height: 44,
                                flexShrink: 0,
                                color: hocColors.mutedStrong,
                            }}
                        >
                            <ExpandMoreRoundedIcon
                                fontSize="small"
                                sx={{
                                    transform: expanded ? "rotate(180deg)" : "none",
                                    transition: "transform 150ms ease",
                                }}
                            />
                        </Box>
                    </Stack>

                    {/* The card's top row ran title-left / buttons-right with a wide gap between them, and
                        these chips sat on a row of their own underneath. From md they move into that gap:
                        the header stops being mostly empty and the card loses a row. Below md the gap is
                        not there to reclaim, so they keep their own row. */}
                    <Stack
                        direction="row"
                        spacing={1.25}
                        alignItems="center"
                        sx={{ display: { xs: "flex", md: "none" }, mt: 0.75, flexWrap: "wrap" }}
                    >
                        {duration && <MetadataItem icon={<AccessTimeRoundedIcon />} label={duration} />}
                        {laps > 0 && (
                            <MetadataItem
                                icon={<LoopRoundedIcon />}
                                label={
                                    laps === 1
                                        ? tf("{count} lap", { count: laps })
                                        : tf("{count} laps", { count: laps })
                                }
                            />
                        )}
                        {topPlayer && (
                            <Stack direction="row" spacing={0.45} alignItems="center" sx={{ minWidth: 0 }}>
                                <MilitaryTechRoundedIcon sx={{ color: hocColors.gold, fontSize: 15 }} />
                                <CreatureIcon creatureId={topPlayer.creature_id ?? 0} size={20} />
                                <Typography level="body-xs" sx={{ color: hocColors.gold, whiteSpace: "nowrap" }}>
                                    {tf("{amount} dmg", { amount: formatMatchDamage(topPlayer.damage_dealt) })}
                                </Typography>
                            </Stack>
                        )}
                        {kind.showsMmr && mmrDelta && (
                            <RewardBadge label={`${mmrDelta} ${t("MMR")}`} tone={ratingTone} />
                        )}
                        {kind.showsGold && goldEarned > 0 && (
                            <RewardBadge
                                icon={<CurrencyIcon iconSvg={rewardCurrency.iconSvg} size={13} />}
                                label={`+${goldEarned.toLocaleString(language)}`}
                                tone="gold"
                            />
                        )}
                    </Stack>

                    {/* Armies and build share ONE row from md up. Each army is six fixed-size portraits, so
                        splitting the card into two stretched halves left the right ~40% of every row empty
                        while the build strip sat alone underneath. Sizing the armies to their content and
                        giving the remainder to the build fills that gap and drops a card's height by a third.
                        Below md there is no surplus to reclaim, so the build goes back under a full-width row. */}
                    <Box
                        sx={{
                            display: "grid",
                            gridTemplateColumns: compact
                                ? "minmax(0, 1fr) minmax(0, 1fr)"
                                : {
                                      xs: "1fr",
                                      sm: "minmax(0, 1fr) minmax(0, 1fr)",
                                      md: "max-content max-content minmax(0, 1fr)",
                                  },
                            alignItems: "start",
                            columnGap: compact ? 0.75 : { xs: 1.5, md: 3 },
                            rowGap: compact ? 0.75 : 1.5,
                            mt: 0.9,
                        }}
                    >
                        <RosterStrip compact={compact} creatureIds={match.creature_ids ?? []} label={t("Your army")} />
                        <RosterStrip
                            compact={compact}
                            creatureIds={match.opponent_creature_ids ?? []}
                            label={tf("{opponent}'s army", { opponent })}
                            muted
                        />
                        <Box
                            sx={{
                                minWidth: 0,
                                gridColumn: compact ? "1 / -1" : { xs: "auto", sm: "1 / -1", md: "auto" },
                            }}
                        >
                            <SetupSummary compact={compact} inline setup={playerSetup} />
                        </Box>
                    </Box>
                </Box>
            </Box>

            {expanded && (
                <div className="hoc-profile-match-detail" id={detailsId} aria-labelledby={headingId} role="region">
                    <dl className="hoc-profile-match-metrics">
                        <Metric label={t("Battle duration")} value={duration || t("Unknown")} />
                        <Metric label={t("Laps")} value={laps > 0 ? String(laps) : t("Unknown")} />
                        {kind.showsMmr && (
                            <>
                                <Metric label={t("MMR rating")} value={`${mmrBefore} → ${mmrAfter}`} />
                                <Metric label={t("MMR change")} value={mmrDelta || "0"} />
                            </>
                        )}
                        {kind.showsGold && goldEarned > 0 && (
                            <Metric
                                label={`${rewardCurrency.name} (${rewardCurrency.symbol})`}
                                value={`+${goldEarned}`}
                            />
                        )}
                        <Metric label={t("Your damage")} value={formatMatchDamage(match.player_damage)} />
                        <Metric label={t("Opponent damage")} value={formatMatchDamage(match.opponent_damage)} />
                    </dl>

                    <Box
                        sx={{
                            display: "grid",
                            gridTemplateColumns: compact ? "1fr" : { xs: "1fr", sm: "minmax(0, 1fr) minmax(0, 1fr)" },
                            gap: compact ? 1.25 : 2,
                            mt: 1.5,
                        }}
                    >
                        <PerformanceList label={t("Your damage")} performances={playerPerformances} />
                        <PerformanceList
                            label={`${opponent} · ${t("Opponent damage")}`}
                            performances={opponentPerformances}
                        />
                    </Box>

                    <BuildChoices compact={compact} match={match} opponent={opponent} />

                    <Stack
                        direction={compact ? "column" : { xs: "column", sm: "row" }}
                        spacing={1}
                        alignItems={compact ? "stretch" : { xs: "stretch", sm: "center" }}
                        justifyContent="space-between"
                        sx={{ mt: 1.5 }}
                    >
                        <Typography level="body-xs" textColor={hocColors.muted}>
                            {tf("Finished {when}", { when: exactFinished })}
                        </Typography>
                        <Button
                            aria-label={t("Replay match")}
                            disabled={!replayAvailable}
                            size="sm"
                            variant="soft"
                            startDecorator={<ReplayRoundedIcon />}
                            onClick={onReplay}
                            sx={{
                                color: hocColors.parchment,
                                bgcolor: hocColors.orangeSoft,
                                border: `1px solid ${hocColors.orangeBorder}`,
                                borderRadius: "7px",
                                "&:hover": { bgcolor: "rgba(255, 143, 0, 0.24)" },
                            }}
                        >
                            {replayAvailable ? t("Replay match") : t("Replay unavailable")}
                        </Button>
                    </Stack>
                </div>
            )}
        </article>
    );
};

export const MatchHistory: React.FC<MatchHistoryProps> = ({
    compact = false,
    filterable = false,
    pageSize,
    matches,
    onReplay,
    seasons,
}) => {
    const [visibleCount, setVisibleCount] = useState(pageSize ?? Number.POSITIVE_INFINITY);
    const [filter, setFilter] = useState<MatchHistoryFilter>("all");
    const [query, setQuery] = useState("");
    const [scope, setScope] = useState<MatchHistoryScope>("either");
    const [expandedGameId, setExpandedGameId] = useState<string>();
    // Subscribes this subtree to the profile language picker, so switching repaints it without a reload.
    useTranslation();
    const history = useMatchHistorySearch(matches, query, scope, filter, filterable);
    const visibleMatches = history.matches.slice(0, visibleCount);
    const hasLocalMore = visibleMatches.length < history.matches.length;
    const resetVisibleCount = () => setVisibleCount(pageSize ?? Number.POSITIVE_INFINITY);
    const showMore = () => {
        if (pageSize !== undefined) setVisibleCount(visibleCount + pageSize);
        if (!hasLocalMore) history.loadMore();
    };
    const clearFilters = () => {
        setQuery("");
        setScope("either");
        setFilter("all");
        setExpandedGameId(undefined);
        resetVisibleCount();
    };

    return (
        <Stack spacing={1} sx={{ width: "100%", maxWidth: "100%", minWidth: 0, overflow: "hidden" }}>
            {filterable && (
                <MatchHistorySearchControls
                    query={query}
                    scope={scope}
                    filter={filter}
                    count={visibleMatches.length}
                    loading={history.loading}
                    onQueryChange={(value) => {
                        setQuery(value);
                        setExpandedGameId(undefined);
                        resetVisibleCount();
                    }}
                    onScopeChange={(value) => {
                        setScope(value);
                        setExpandedGameId(undefined);
                        resetVisibleCount();
                    }}
                    onFilterChange={(value) => {
                        setFilter(value);
                        setExpandedGameId(undefined);
                        resetVisibleCount();
                    }}
                />
            )}

            {history.error && (
                <Alert
                    color="warning"
                    variant="soft"
                    endDecorator={
                        <Button size="sm" variant="plain" onClick={history.retry}>
                            {t("Try again")}
                        </Button>
                    }
                >
                    {t("Unable to search match history.")}
                </Alert>
            )}

            {visibleMatches.length === 0 && !history.loading && !history.error && (
                <Stack
                    spacing={1}
                    alignItems={filterable ? "center" : "flex-start"}
                    sx={{ py: filterable ? 4 : 0, textAlign: filterable ? "center" : "left" }}
                >
                    {filterable && <SearchRoundedIcon sx={{ color: hocColors.gold, opacity: 0.65, fontSize: 30 }} />}
                    <Typography level={compact ? "body-xs" : "body-sm"} textColor={hocColors.mutedStrong}>
                        {!query && filter === "all" && scope === "either"
                            ? t("No finished matches yet.")
                            : t("No matches found.")}
                    </Typography>
                    {(query || filter !== "all" || scope !== "either") && (
                        <>
                            <Typography level="body-xs" textColor={hocColors.muted}>
                                {t("Try another name or search either army.")}
                            </Typography>
                            <Button size="sm" variant="plain" onClick={clearFilters} sx={{ color: hocColors.gold }}>
                                {t("Clear filters")}
                            </Button>
                        </>
                    )}
                </Stack>
            )}

            {visibleMatches.map((match) => {
                const gameId = match.game_id ?? "";
                const expanded = expandedGameId === gameId;
                return (
                    <MatchCard
                        key={gameId}
                        compact={compact}
                        expanded={expanded}
                        match={match}
                        onExpand={() => setExpandedGameId(expanded ? undefined : gameId)}
                        onReplay={() => onReplay(match)}
                        seasons={seasons}
                    />
                );
            })}

            {filterable && (hasLocalMore || history.hasMore) && !history.loading && (
                <Button
                    variant="soft"
                    size="sm"
                    loading={history.loadingMore}
                    onClick={showMore}
                    className="hoc-profile-action"
                    sx={{ alignSelf: "center", mt: 1, color: hocColors.parchment, bgcolor: "transparent" }}
                >
                    {t("Load more matches")}
                </Button>
            )}
        </Stack>
    );
};
