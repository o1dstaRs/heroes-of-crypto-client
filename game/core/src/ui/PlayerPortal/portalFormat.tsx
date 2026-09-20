import { ToFactionName } from "@heroesofcrypto/common";
import { Box, Tooltip, Typography } from "@mui/joy";
import React from "react";

import { getAbilityDisplayMetadata } from "../../abilityDisplay";
import { t, tf } from "../../i18n/i18n";
import { CreaturePortraitImage } from "../CreaturePortraitImage";
import { creatureCatalogEntry, startingStackAmount } from "../creatureCatalog";
import { UNIT_ID_TO_NAME } from "../unit_ui_constants";
import { hocColors } from "../hocTheme";

// Creature names stay in English on purpose: they are content data from the shared configs, and the
// pick phase already shows them untranslated. Only the chrome around them is localized.
export const creatureName = (creatureId: number): string => UNIT_ID_TO_NAME[creatureId] ?? `#${creatureId}`;

export const factionName = (faction: number): string => t(ToFactionName[faction] || "Neutral");

export const winRatePct = (wins: number, games: number): number => (games > 0 ? Math.round((wins / games) * 100) : 0);

/** Color-codes a win rate: green when winning, gold around even, red when losing. */
export const winRateColor = (pct: number): string => {
    if (pct >= 60) {
        return "#46d160";
    }
    if (pct >= 45) {
        return hocColors.gold;
    }
    return "#ff5a5a";
};

export const streakLabel = (currentStreak: number): string => {
    if (currentStreak > 0) {
        return tf("{count}W streak", { count: currentStreak });
    }
    if (currentStreak < 0) {
        return tf("{count}L streak", { count: -currentStreak });
    }
    return t("No streak");
};

export const timeAgo = (ms: number): string => {
    if (!ms) {
        return "";
    }
    const diff = Date.now() - ms;
    if (diff < 0) {
        return t("just now");
    }
    const mins = Math.floor(diff / 60000);
    if (mins < 1) {
        return t("just now");
    }
    if (mins < 60) {
        return tf("{count}m ago", { count: mins });
    }
    const hours = Math.floor(mins / 60);
    if (hours < 24) {
        return tf("{count}h ago", { count: hours });
    }
    const days = Math.floor(hours / 24);
    if (days < 30) {
        return tf("{count}d ago", { count: days });
    }
    const months = Math.floor(days / 30);
    return months < 12
        ? tf("{count}mo ago", { count: months })
        : tf("{count}y ago", { count: Math.floor(months / 12) });
};

/**
 * The body of every hover card in the portal — a creature, an artifact, an augment, a synergy, the
 * doctrine: a bold title, an optional muted subtitle, then the lines that say what the thing does.
 */
export const InfoCard: React.FC<{
    children?: React.ReactNode;
    lines?: readonly string[];
    subtitle?: string;
    title: string;
}> = ({ children, lines = [], subtitle, title }) => (
    <Box sx={{ maxWidth: 340, py: 0.25 }}>
        <Typography level="title-sm" sx={{ color: hocColors.gold, lineHeight: 1.2 }}>
            {title}
        </Typography>
        {subtitle && (
            <Typography level="body-xs" textColor={hocColors.muted} sx={{ mt: 0.15 }}>
                {subtitle}
            </Typography>
        )}
        {lines.map((line, index) => (
            <Typography
                key={`${index}_${line}`}
                level="body-xs"
                sx={{ mt: 0.5, color: hocColors.mutedStrong, whiteSpace: "pre-line" }}
            >
                {line}
            </Typography>
        ))}
        {children}
    </Box>
);

export interface CreatureInfo {
    abilities: { description: string; name: string }[];
    name: string;
    stats: { label: string; value: string }[];
    subtitle: string;
}

const ATTACK_TYPE_LABEL: Record<string, string> = { MELEE: "Melee", RANGE: "Ranged", MAGIC: "Magic" };

/**
 * What a creature is, as the hover card quotes it: the catalogue's own stats and ability texts, so the
 * numbers are the ones the draft's detail panel shows and the fight applies. Undefined for an id this
 * client's catalogue does not know (a newer server mid-deploy).
 */
export const creatureInfo = (creatureId: number): CreatureInfo | undefined => {
    const entry = creatureCatalogEntry(creatureId);
    if (!entry) {
        return undefined;
    }
    const c = entry.config;
    const ranged = c.attack_type === "RANGE";
    const stats: CreatureInfo["stats"] = [
        { label: t("Hit points"), value: `${c.hp}` },
        { label: t("Attack"), value: `${c.attack}` },
        { label: t("Damage"), value: `${c.attack_damage_min}–${c.attack_damage_max}` },
        { label: t("Armor"), value: `${c.armor}` },
        { label: t("Magic resist"), value: `${c.magic_resist}%` },
        // OWNER call: movement steps are the exact fractional stat (Trent 2.9), never rounded — the
        // board spends them exactly, and a rounded figure reads as "3 steps but walks 2".
        { label: t("Movement steps"), value: `${c.steps}` },
        { label: t("Initiative"), value: `${c.initiative}` },
    ];
    // Range-only values are omitted when the creature cannot use them, so an inapplicable mechanic
    // never reads as a real zero-valued stat.
    if (ranged && c.shot_distance > 0) {
        stats.push({ label: t("Shot distance"), value: `${c.shot_distance}` });
    }
    if (ranged && c.range_shots > 0) {
        stats.push({ label: t("Shots"), value: `${c.range_shots}` });
    }
    const subtitle = [
        t(entry.faction),
        tf("Level {level}", { level: c.level }),
        t(ATTACK_TYPE_LABEL[c.attack_type] ?? c.attack_type),
        c.movement_type === "FLY" ? t("Flying") : "",
        tf("Stack of {count}", { count: startingStackAmount(c) }),
    ]
        .filter(Boolean)
        .join(" · ");
    const abilities = (c.abilities ?? []).filter(Boolean).map((name) => ({
        name,
        description: (getAbilityDisplayMetadata(name)?.description ?? "").replace(/\s*\n\s*/g, " ").trim(),
    }));
    return { abilities, name: c.name, stats, subtitle };
};

/** The creature hover card: stats in two columns, then every ability with what it does. */
export const CreatureInfoCard: React.FC<{ creatureId: number }> = ({ creatureId }) => {
    const info = creatureInfo(creatureId);
    if (!info) {
        return <>{creatureName(creatureId)}</>;
    }
    return (
        <InfoCard title={info.name} subtitle={info.subtitle}>
            <Box
                sx={{
                    mt: 0.6,
                    display: "grid",
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                    columnGap: 1.5,
                    rowGap: 0.15,
                }}
            >
                {info.stats.map((stat) => (
                    <Box key={stat.label} sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}>
                        <Typography level="body-xs" textColor={hocColors.muted}>
                            {stat.label}
                        </Typography>
                        <Typography level="body-xs" sx={{ color: hocColors.mutedStrong, fontWeight: 600 }}>
                            {stat.value}
                        </Typography>
                    </Box>
                ))}
            </Box>
            {info.abilities.length > 0 && (
                <Box sx={{ mt: 0.7 }}>
                    <Typography level="body-xs" textColor={hocColors.muted}>
                        {t("Abilities")}
                    </Typography>
                    {info.abilities.map((ability) => (
                        <Typography key={ability.name} level="body-xs" sx={{ mt: 0.25, color: hocColors.mutedStrong }}>
                            <Box component="span" sx={{ color: hocColors.gold, fontWeight: 600 }}>
                                {ability.name}
                            </Box>
                            {ability.description ? ` — ${ability.description}` : ""}
                        </Typography>
                    ))}
                </Box>
            )}
        </InfoCard>
    );
};

/** A small creature portrait; hovering it opens the creature's full card. */
export const CreatureIcon: React.FC<{ creatureId: number; size?: number }> = ({ creatureId, size = 32 }) => (
    <Tooltip title={<CreatureInfoCard creatureId={creatureId} />} size="sm" variant="soft" placement="top">
        <CreaturePortraitImage
            creatureId={creatureId}
            alt={creatureName(creatureId)}
            sx={{
                width: size,
                height: size,
                borderRadius: "22%",
                bgcolor: "rgba(0,0,0,0.35)",
                border: `1px solid ${hocColors.orangeBorder}`,
                flexShrink: 0,
            }}
        />
    </Tooltip>
);

/** A horizontal win-rate bar with the percentage label. */
export const WinRateBar: React.FC<{ wins: number; games: number; width?: number | string }> = ({
    wins,
    games,
    width = 120,
}) => {
    const pct = winRatePct(wins, games);
    const color = winRateColor(pct);
    return (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, width }}>
            <Box
                sx={{
                    position: "relative",
                    flex: 1,
                    height: 8,
                    borderRadius: 4,
                    bgcolor: "rgba(255,255,255,0.08)",
                    overflow: "hidden",
                }}
            >
                <Box sx={{ position: "absolute", inset: 0, width: `${pct}%`, bgcolor: color, borderRadius: 4 }} />
            </Box>
            <Typography level="body-xs" sx={{ color, minWidth: 34, textAlign: "right", fontWeight: 600 }}>
                {pct}%
            </Typography>
        </Box>
    );
};
