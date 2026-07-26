// Framework-free helpers for the /profile page: resolve a portal creature id / faction value to the
// same name + image the /units page uses, plus small win-rate / streak / relative-time formatters.
// Mirrors game/core/src/ui/PlayerPortal/portalFormat.tsx but with no React/MUI so it runs in the site's
// client bundle.
import creaturesJson from "@heroesofcrypto/common/src/configuration/creatures.json";
import { CreatureVals } from "@heroesofcrypto/common/src/generated/protobuf/v1/enums_reexports";
import { ToFactionName } from "@heroesofcrypto/common/src/factions/faction_type";

import { factionColors, type FactionName } from "./units-data";

const UNKNOWN_CREATURE_IMAGE = "/assets/images/units/units/unknown_creature_512.webp";

// Same slug rule the /units page uses so image paths line up (lowercase, non-alnum -> "_").
const slugify = (name: string): string =>
    name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "");

const FACTION_NAMES: FactionName[] = ["Life", "Nature", "Chaos", "Death", "Might"];

export interface CreatureInfo {
    name: string;
    image: string;
}

// creatures.json is grouped by faction: { version, Life: { Squire: {...} }, ... }. Flatten it to a
// slug -> {name,image} map so a portal creature id resolves via its CreatureVals enum key.
const creatureBySlug = new Map<string, CreatureInfo>();
{
    const grouped = creaturesJson as unknown as { version: number } & Record<string, Record<string, { name: string }>>;
    for (const faction of FACTION_NAMES) {
        const group = grouped[faction];
        if (!group) {
            continue;
        }
        for (const creature of Object.values(group)) {
            const s = slugify(creature.name);
            creatureBySlug.set(s, { name: creature.name, image: `/assets/images/units/units/${s}_512.webp` });
        }
    }
}

const titleCase = (enumKey: string): string =>
    enumKey
        .split("_")
        .filter(Boolean)
        .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
        .join(" ");

// The CreatureVals numeric enum reverse-maps an id to its key (e.g. 40 -> "TSAR_CANNON"); its lowercase
// equals the /units image slug. Unknown ids fall back to a readable name + the placeholder portrait.
export function creatureById(id: number): CreatureInfo {
    const enumKey = (CreatureVals as unknown as Record<number, string>)[id];
    const info = enumKey ? creatureBySlug.get(enumKey.toLowerCase()) : undefined;
    if (info) {
        return info;
    }
    return { name: enumKey ? titleCase(enumKey) : `#${id}`, image: UNKNOWN_CREATURE_IMAGE };
}

export interface FactionInfo {
    name: string;
    image: string;
    color: string;
}

export function factionById(faction: number): FactionInfo {
    const name = ToFactionName[faction] || "Neutral";
    return {
        name,
        image: `/assets/images/units/factions/${name.toLowerCase()}_128.webp`,
        color: (factionColors as Record<string, string>)[name] ?? "#f2c75d",
    };
}

export const winRatePct = (wins: number, games: number): number =>
    games > 0 ? Math.round((wins / games) * 100) : 0;

// Green when winning, gold around even, red when losing — matches the in-game portal palette.
export const winRateColor = (pct: number): string => (pct >= 60 ? "#46d160" : pct >= 45 ? "#f2c75d" : "#ff5a5a");

export interface StreakLabels {
    /** "{}" is replaced with the streak length, e.g. "{} win streak". */
    win: string;
    loss: string;
    none: string;
}

export function streakLabel(streak: number, labels: StreakLabels): string {
    if (streak > 0) {
        return labels.win.replace("{}", String(streak));
    }
    if (streak < 0) {
        return labels.loss.replace("{}", String(-streak));
    }
    return labels.none;
}

export interface TimeAgoLabels {
    now: string;
    m: string;
    h: string;
    d: string;
    mo: string;
    y: string;
}

/** Compact relative time ("3d", "2h", "just now"). Suffixes are localized by the caller. */
export function timeAgo(ms: number, labels: TimeAgoLabels, now: number = Date.now()): string {
    if (!ms) {
        return "";
    }
    const diff = now - ms;
    if (diff < 60_000) {
        return labels.now;
    }
    const mins = Math.floor(diff / 60_000);
    if (mins < 60) {
        return `${mins}${labels.m}`;
    }
    const hours = Math.floor(mins / 60);
    if (hours < 24) {
        return `${hours}${labels.h}`;
    }
    const days = Math.floor(hours / 24);
    if (days < 30) {
        return `${days}${labels.d}`;
    }
    const months = Math.floor(days / 30);
    if (months < 12) {
        return `${months}${labels.mo}`;
    }
    return `${Math.floor(months / 12)}${labels.y}`;
}
