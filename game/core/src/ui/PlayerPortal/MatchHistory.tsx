import { Artifact, Perk, SynergyKeysToPower, TeamVals } from "@heroesofcrypto/common";
import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import ExploreRoundedIcon from "@mui/icons-material/ExploreRounded";
import LoopRoundedIcon from "@mui/icons-material/LoopRounded";
import MilitaryTechRoundedIcon from "@mui/icons-material/MilitaryTechRounded";
import ReplayRoundedIcon from "@mui/icons-material/ReplayRounded";
import { Box, Button, IconButton, Sheet, Stack, ToggleButtonGroup, Tooltip, Typography } from "@mui/joy";
import React, { useId, useMemo, useState } from "react";

import { rankedSeasonCurrencyAt, type RankedSeasonCatalog } from "../../api/ranked_season_client";
import { images } from "../../generated/image_imports";
import { t, tf, useTranslation } from "../../i18n/i18n";
import { CurrencyIcon } from "../GoldCurrencyIcon";
import { SYNERGY_KEY_TO_IMAGE, SYNERGY_NAME_TO_DESCRIPTION } from "../LeftSideBar/SynergiesConstants";
import { hocColors } from "../hocTheme";
import { getPerkIconImage } from "../perkCopy";
import {
    filterPortalMatches,
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
    type MatchKindTone,
    type MatchResultTone,
    type MatchTeamSetup,
    type PortalMatchData,
    type PortalUnitPerformanceData,
} from "./matchHistoryModel";
import { CreatureIcon, creatureName, timeAgo } from "./portalFormat";

const RESULT_COLORS: Record<MatchResultTone, string> = {
    draw: hocColors.gold,
    loss: hocColors.danger,
    win: "#46d160",
};

const MATCH_KIND_STYLES: Record<MatchKindTone, { background: string; border: string; color: string }> = {
    calibration: { background: "rgba(170,156,255,0.07)", border: "rgba(170,156,255,0.34)", color: "#aa9cff" },
    lobby: { background: "rgba(114,207,194,0.07)", border: "rgba(114,207,194,0.34)", color: "#72cfc2" },
    ranked: { background: "rgba(220,177,88,0.07)", border: "rgba(220,177,88,0.34)", color: hocColors.gold },
    unknown: {
        background: "rgba(239,228,204,0.05)",
        border: "rgba(239,228,204,0.2)",
        color: hocColors.mutedStrong,
    },
};

// Which side the player fought as, coloured to match the board: team LOWER is green (always the bottom),
// team UPPER is red (always the top). Team-fixed, never viewer-relative — see scenes/teamColors.ts.
const SIDE_PRESENTATION: Record<"green" | "red", { label: string; color: string }> = {
    green: { label: "Green", color: "#46d160" },
    red: { label: "Red", color: "#ff5a5a" },
};
const matchSide = (team: number | undefined): "green" | "red" | undefined => {
    if (team === TeamVals.LOWER) return "green";
    if (team === TeamVals.UPPER) return "red";
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
        <Stack direction="row" spacing={0.35} sx={{ flexWrap: "wrap", minHeight: compact ? 20 : 28 }}>
            {creatureIds.slice(0, 8).map((creatureId, index) => (
                <CreatureIcon
                    key={`${label}_${creatureId}_${index}`}
                    creatureId={creatureId}
                    size={compact ? 20 : 28}
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

const MatchKindBadge: React.FC<{ label: string; tone: MatchKindTone }> = ({ label, tone }) => (
    <Box
        component="span"
        sx={{
            display: "inline-flex",
            alignItems: "center",
            minHeight: 20,
            px: 0.75,
            border: `1px solid ${MATCH_KIND_STYLES[tone].border}`,
            borderRadius: "999px",
            bgcolor: MATCH_KIND_STYLES[tone].background,
            color: MATCH_KIND_STYLES[tone].color,
            fontSize: "0.66rem",
            fontWeight: 800,
            lineHeight: 1,
            letterSpacing: "0.025em",
            whiteSpace: "nowrap",
        }}
    >
        {label}
    </Box>
);

const RewardBadge: React.FC<{ icon?: React.ReactNode; label: string; tone: "gold" | "rating" }> = ({
    icon,
    label,
    tone,
}) => (
    <Box
        component="span"
        sx={{
            display: "inline-flex",
            alignItems: "center",
            minHeight: 22,
            px: 0.75,
            borderRadius: "6px",
            bgcolor: tone === "gold" ? "rgba(220,177,88,0.12)" : "rgba(170,156,255,0.1)",
            color: tone === "gold" ? hocColors.gold : "#c7bfff",
            fontSize: "0.69rem",
            fontWeight: 800,
            lineHeight: 1,
            whiteSpace: "nowrap",
            gap: 0.35,
        }}
    >
        {icon}
        {label}
    </Box>
);

const Metric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <Box sx={{ minWidth: 0 }}>
        <Typography level="body-xs" textColor={hocColors.muted}>
            {label}
        </Typography>
        <Typography level="title-sm" textColor={hocColors.parchment} sx={{ mt: 0.1 }}>
            {value}
        </Typography>
    </Box>
);

const PerformanceList: React.FC<{
    label: string;
    performances: readonly PortalUnitPerformanceData[];
}> = ({ label, performances }) => (
    <Box sx={{ minWidth: 0 }}>
        <Typography level="body-xs" textColor={hocColors.muted} sx={{ mb: 0.75 }}>
            {label}
        </Typography>
        <Stack spacing={0.65}>
            {performances.map((performance, index) => {
                const creatureId = performance.creature_id ?? 0;
                return (
                    <Stack
                        key={`${creatureId}_${index}`}
                        direction="row"
                        spacing={0.75}
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
                            <CreatureIcon creatureId={creatureId} size={30} />
                        </Box>
                        <Typography level="body-xs" textColor={hocColors.mutedStrong} noWrap sx={{ flex: 1 }}>
                            {creatureName(creatureId)}
                        </Typography>
                        <Typography level="body-xs" sx={{ color: index === 0 ? hocColors.gold : hocColors.muted }}>
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
        </Stack>
    </Box>
);

const SetupChoice: React.FC<{
    alt?: string;
    badge?: string;
    detail: string;
    fallback?: React.ReactNode;
    image?: string;
    name: string;
    roundImage?: boolean;
}> = ({ alt = "", badge, detail, fallback, image, name, roundImage = false }) => (
    <Tooltip title={detail} placement="top" size="sm" variant="soft">
        <Stack
            direction="row"
            spacing={0.65}
            alignItems="center"
            sx={{
                minWidth: 0,
                maxWidth: "100%",
                py: 0.25,
                pr: 0.6,
                borderRadius: "6px",
                bgcolor: "rgba(255,255,255,0.035)",
            }}
        >
            <Box
                sx={{
                    width: 30,
                    height: 30,
                    flex: "0 0 30px",
                    display: "grid",
                    placeItems: "center",
                    overflow: "hidden",
                    borderRadius: roundImage ? "50%" : "6px",
                    bgcolor: "rgba(0,0,0,0.28)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    color: hocColors.gold,
                    "& svg": { fontSize: 18 },
                }}
            >
                {image ? (
                    <Box
                        component="img"
                        src={image}
                        alt={alt}
                        sx={{
                            width: roundImage ? "100%" : 26,
                            height: roundImage ? "100%" : 26,
                            borderRadius: roundImage ? "50%" : 0,
                            objectFit: roundImage ? "cover" : "contain",
                        }}
                    />
                ) : (
                    fallback
                )}
            </Box>
            <Typography level="body-xs" textColor={hocColors.mutedStrong} noWrap sx={{ minWidth: 0, maxWidth: 128 }}>
                {name}
            </Typography>
            {badge && (
                <Typography
                    level="body-xs"
                    sx={{ color: hocColors.gold, fontWeight: 700, whiteSpace: "nowrap", ml: "auto" }}
                >
                    {badge}
                </Typography>
            )}
        </Stack>
    </Tooltip>
);

const SetupSummaryIcon: React.FC<{
    alt?: string;
    badge: string;
    compact: boolean;
    detail: string;
    fallback?: React.ReactNode;
    image?: string;
    roundImage?: boolean;
}> = ({ alt = "", badge, compact, detail, fallback, image, roundImage = false }) => {
    const size = compact ? 24 : 28;
    return (
        <Tooltip title={detail} placement="top" size="sm" variant="soft">
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
    setup: MatchTeamSetup;
}> = ({ compact, setup }) => {
    if (!setup.available) {
        return (
            <Typography level="body-xs" textColor={hocColors.muted} sx={{ mt: 0.75 }}>
                {t("Build data unavailable")}
            </Typography>
        );
    }

    const perk = Perk.getPerkProperties(setup.perk as Perk.Perk);
    const artifacts = artifactsForSetup(setup);
    return (
        <Box sx={{ mt: compact ? 0.65 : 0.8, minWidth: 0 }}>
            <Typography
                level="body-xs"
                sx={{ color: hocColors.mutedStrong, mb: 0.45, fontSize: compact ? "0.6rem" : "0.66rem" }}
            >
                {t("Your build")}
            </Typography>
            <Box sx={{ display: "flex", alignItems: "flex-start", flexWrap: "wrap", gap: compact ? 0.7 : 0.9 }}>
                <SetupSummaryGroup compact={compact} label={t("Perk")}>
                    <SetupSummaryIcon
                        badge={`${perk.upgradePoints}`}
                        compact={compact}
                        detail={`${perk.name}: ${perk.description}`}
                        fallback={<ExploreRoundedIcon />}
                        image={getPerkIconImage(setup.perk)}
                        roundImage
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
                            />
                        ))}
                    </SetupSummaryGroup>
                )}
                {setup.complete && setup.augments.length > 0 && (
                    <SetupSummaryGroup compact={compact} label={t("Augments")}>
                        {setup.augments.map((augment) => (
                            <SetupSummaryIcon
                                key={augment.kind}
                                alt={tf("{kind} augment", { kind: t(augment.kind) })}
                                badge={`L${augment.level}`}
                                compact={compact}
                                detail={tf("{kind} augment, level {level}", {
                                    kind: t(augment.kind),
                                    level: augment.level,
                                })}
                                image={images[AUGMENT_IMAGE_KEY[augment.kind]]}
                            />
                        ))}
                    </SetupSummaryGroup>
                )}
                {setup.complete && setup.synergies.length > 0 && (
                    <SetupSummaryGroup compact={compact} label={t("Synergies")}>
                        {setup.synergies.map((synergy) => {
                            const name = synergyName(synergy);
                            const level = synergyLevel(synergy);
                            return (
                                <SetupSummaryIcon
                                    key={synergy}
                                    alt={name}
                                    badge={`L${level}`}
                                    compact={compact}
                                    detail={tf("{name}, level {level}: {description}", {
                                        name,
                                        level,
                                        description: synergyDescription(synergy),
                                    })}
                                    fallback={<AutoAwesomeRoundedIcon />}
                                    image={SYNERGY_KEY_TO_IMAGE[synergy as keyof typeof SYNERGY_KEY_TO_IMAGE]}
                                />
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
        <Typography level="body-xs" textColor={hocColors.muted} sx={{ mb: 0.45 }}>
            {label}
        </Typography>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.55, minWidth: 0 }}>{children}</Box>
    </Box>
);

const TeamBuildChoices: React.FC<{
    label: string;
    setup: MatchTeamSetup;
    tone: "opponent" | "player";
}> = ({ label, setup, tone }) => {
    if (!setup.available) {
        return (
            <Box sx={{ minWidth: 0 }}>
                <Typography level="title-sm" sx={{ color: tone === "player" ? "#46d160" : "#ff7272", mb: 0.65 }}>
                    {label}
                </Typography>
                <Typography level="body-xs" textColor={hocColors.muted}>
                    {t("Build choices were not recorded for this match.")}
                </Typography>
            </Box>
        );
    }

    const perk = Perk.getPerkProperties(setup.perk as Perk.Perk);
    const artifacts = artifactsForSetup(setup);

    return (
        <Stack spacing={1.05} sx={{ minWidth: 0 }}>
            <Typography level="title-sm" sx={{ color: tone === "player" ? "#46d160" : "#ff7272" }}>
                {label}
            </Typography>

            <SetupRow label={t("Perk")}>
                <SetupChoice
                    detail={perk.description}
                    fallback={<ExploreRoundedIcon />}
                    image={getPerkIconImage(setup.perk)}
                    name={perk.name}
                    badge={tf("{count} pts", { count: perk.upgradePoints })}
                    roundImage
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
                        {setup.augments.map((augment) => (
                            <SetupChoice
                                key={augment.kind}
                                alt={tf("{kind} augment", { kind: t(augment.kind) })}
                                detail={tf("{kind} augment, level {level}", {
                                    kind: t(augment.kind),
                                    level: augment.level,
                                })}
                                image={images[AUGMENT_IMAGE_KEY[augment.kind]]}
                                name={t(augment.kind)}
                                badge={`L${augment.level}`}
                            />
                        ))}
                    </SetupRow>

                    <SetupRow label={t("Synergies")}>
                        {setup.synergies.map((synergy) => {
                            const name = synergyName(synergy);
                            const level = synergyLevel(synergy);
                            return (
                                <SetupChoice
                                    key={synergy}
                                    alt={name}
                                    detail={tf("Level {level}: {description}", {
                                        level,
                                        description: synergyDescription(synergy),
                                    })}
                                    image={SYNERGY_KEY_TO_IMAGE[synergy as keyof typeof SYNERGY_KEY_TO_IMAGE]}
                                    name={name}
                                    badge={`L${level}`}
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
        <Box sx={{ mt: 1.6, pt: 1.35, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
            <Stack direction="row" spacing={0.65} alignItems="center" sx={{ mb: 1.15 }}>
                <AutoAwesomeRoundedIcon sx={{ color: hocColors.gold, fontSize: 17 }} />
                <Typography level="title-sm" textColor={hocColors.parchment}>
                    {t("Build choices")}
                </Typography>
            </Stack>
            <Box
                sx={{
                    display: "grid",
                    gridTemplateColumns: compact ? "1fr" : { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" },
                    gap: compact ? 1.4 : { xs: 1.4, sm: 0 },
                    "& > *:nth-of-type(2)": compact
                        ? { borderTop: "1px solid rgba(255,255,255,0.08)", pt: 1.35 }
                        : {
                              borderTop: { xs: "1px solid rgba(255,255,255,0.08)", sm: "none" },
                              borderLeft: { xs: "none", sm: "1px solid rgba(255,255,255,0.08)" },
                              pt: { xs: 1.35, sm: 0 },
                              pl: { xs: 0, sm: 1.5 },
                          },
                    "& > *:first-of-type": compact ? undefined : { pr: { xs: 0, sm: 1.5 } },
                }}
            >
                <TeamBuildChoices label={t("Your build")} setup={playerSetup} tone="player" />
                <TeamBuildChoices
                    label={tf("{opponent}'s build", { opponent })}
                    setup={opponentSetup}
                    tone="opponent"
                />
            </Box>
        </Box>
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
    const resultColor = RESULT_COLORS[result.tone];
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
    const goldEarned = Number.isFinite(match.gold_earned) ? Math.max(0, Math.round(Number(match.gold_earned))) : 0;
    const rewardCurrency = rankedSeasonCurrencyAt(seasons, match.finished_time);

    return (
        <Sheet
            aria-labelledby={headingId}
            component="article"
            variant="soft"
            sx={{
                position: "relative",
                overflow: "hidden",
                boxSizing: "border-box",
                width: "100%",
                maxWidth: "100%",
                minWidth: 0,
                border: `1px solid ${expanded ? hocColors.orangeBorder : "rgba(255,255,255,0.08)"}`,
                borderRadius: "8px",
                bgcolor: expanded ? "rgba(25,15,8,0.84)" : "rgba(0,0,0,0.27)",
                transition: "border-color 150ms ease, background-color 150ms ease",
                flexShrink: 0,
            }}
        >
            <Box sx={{ position: "absolute", inset: "0 auto 0 0", width: 3, bgcolor: resultColor }} />
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
                        "&:hover": { bgcolor: hocColors.orangeSoft },
                        "&:focus-visible": {
                            outline: `2px solid ${hocColors.gold}`,
                            outlineOffset: -3,
                        },
                    }}
                />

                <Box sx={{ position: "relative", zIndex: 2, pointerEvents: "none" }}>
                    <Stack direction="row" spacing={0.75} alignItems="center">
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography
                                id={headingId}
                                component="h3"
                                level={compact ? "body-xs" : "body-sm"}
                                noWrap
                                sx={{ color: hocColors.parchment }}
                            >
                                <Box component="span" sx={{ color: resultColor, fontWeight: 800 }}>
                                    {t(result.label)}
                                </Box>{" "}
                                {t("vs")}{" "}
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
                            </Typography>
                            <Stack
                                direction="row"
                                spacing={0.75}
                                alignItems="center"
                                sx={{ mt: 0.25, flexWrap: "wrap" }}
                            >
                                <MatchKindBadge label={t(kind.label)} tone={kind.tone} />
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
                                                boxShadow: `0 0 4px ${SIDE_PRESENTATION[side].color}`,
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
                                    <Typography level="body-xs" sx={{ color: resultColor, whiteSpace: "nowrap" }}>
                                        {t(result.detail)}
                                    </Typography>
                                )}
                            </Stack>
                        </Box>
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

                    <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mt: 0.75, flexWrap: "wrap" }}>
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
                            <RewardBadge label={tf("MMR {amount}", { amount: mmrDelta })} tone="rating" />
                        )}
                        {kind.showsGold && (
                            <RewardBadge
                                icon={<CurrencyIcon iconSvg={rewardCurrency.iconSvg} size={13} />}
                                label={`${rewardCurrency.symbol} +${goldEarned}`}
                                tone="gold"
                            />
                        )}
                    </Stack>

                    <Box
                        sx={{
                            display: "grid",
                            gridTemplateColumns: compact
                                ? "minmax(0, 1fr) minmax(0, 1fr)"
                                : { xs: "1fr", sm: "minmax(0, 1fr) minmax(0, 1fr)" },
                            gap: compact ? 0.75 : 1.5,
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
                    </Box>

                    <SetupSummary compact={compact} setup={playerSetup} />
                </Box>
            </Box>

            {expanded && (
                <Box
                    id={detailsId}
                    aria-labelledby={headingId}
                    role="region"
                    sx={{
                        borderTop: "1px solid rgba(255,255,255,0.08)",
                        px: compact ? 1.25 : 1.5,
                        py: 1.25,
                    }}
                >
                    <Box
                        sx={{
                            display: "grid",
                            gridTemplateColumns: compact
                                ? "repeat(2, minmax(0, 1fr))"
                                : "repeat(auto-fit, minmax(min(100%, 120px), 1fr))",
                            gap: 1.25,
                        }}
                    >
                        <Metric label={t("Battle duration")} value={duration || t("Unknown")} />
                        <Metric label={t("Laps")} value={laps > 0 ? String(laps) : t("Unknown")} />
                        {kind.showsMmr && (
                            <>
                                <Metric label={t("MMR rating")} value={`${mmrBefore} → ${mmrAfter}`} />
                                <Metric label={t("MMR change")} value={mmrDelta || "0"} />
                            </>
                        )}
                        {kind.showsGold && (
                            <Metric
                                label={`${rewardCurrency.name} (${rewardCurrency.symbol})`}
                                value={`+${goldEarned}`}
                            />
                        )}
                        <Metric label={t("Your damage")} value={formatMatchDamage(match.player_damage)} />
                        <Metric label={t("Opponent damage")} value={formatMatchDamage(match.opponent_damage)} />
                    </Box>

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
                </Box>
            )}
        </Sheet>
    );
};

export const MatchHistory: React.FC<MatchHistoryProps> = ({
    compact = false,
    filterable = false,
    matches,
    onReplay,
    seasons,
}) => {
    const [filter, setFilter] = useState<MatchHistoryFilter>("all");
    const [expandedGameId, setExpandedGameId] = useState<string>();
    // Subscribes this subtree to the profile language picker, so switching repaints it without a reload.
    useTranslation();
    const filteredMatches = useMemo(() => filterPortalMatches(matches, filter), [filter, matches]);
    const wins = useMemo(() => filterPortalMatches(matches, "wins").length, [matches]);
    const losses = useMemo(() => filterPortalMatches(matches, "losses").length, [matches]);

    return (
        <Stack spacing={1} sx={{ width: "100%", maxWidth: "100%", minWidth: 0, overflow: "hidden" }}>
            {filterable && matches.length > 0 && (
                <ToggleButtonGroup
                    aria-label={t("Filter match history")}
                    size="sm"
                    buttonFlex={1}
                    value={filter}
                    onChange={(_, value) => {
                        if (value) {
                            setFilter(value as MatchHistoryFilter);
                            setExpandedGameId(undefined);
                        }
                    }}
                    sx={{
                        alignSelf: "flex-start",
                        width: { xs: "100%", sm: "auto" },
                        maxWidth: "100%",
                        boxSizing: "border-box",
                        borderRadius: "7px",
                        "& button": {
                            minWidth: 0,
                            px: 1,
                            whiteSpace: "nowrap",
                            color: hocColors.mutedStrong,
                            borderColor: hocColors.orangeBorder,
                            borderRadius: "7px",
                            "&[aria-pressed='true']": { bgcolor: hocColors.orangeSoft, color: hocColors.parchment },
                        },
                    }}
                >
                    <Button value="all">{tf("All {count}", { count: matches.length })}</Button>
                    <Button value="wins">{tf("Wins {count}", { count: wins })}</Button>
                    <Button value="losses">{tf("Losses {count}", { count: losses })}</Button>
                </ToggleButtonGroup>
            )}

            {filteredMatches.length === 0 && (
                <Typography level={compact ? "body-xs" : "body-sm"} textColor={hocColors.muted}>
                    {matches.length === 0
                        ? t("No finished matches yet.")
                        : filter === "wins"
                          ? t("No wins in recent matches.")
                          : t("No losses in recent matches.")}
                </Typography>
            )}

            {filteredMatches.map((match) => {
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
        </Stack>
    );
};
