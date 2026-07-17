import { Artifact, getFactionOf, Perk, type CreatureId, type ResponsePlayerPortalObject } from "@heroesofcrypto/common";

import { UNIT_ID_TO_NAME } from "../unit_ui_constants";
import type { PortalMatchData, PortalMatchSetupData, PortalUnitPerformanceData } from "./matchHistoryModel";

/**
 * Dev-only fake portal data so the dashboard can be previewed without finished ranked matches.
 * Enable with `?mockPortal=1` in the URL or `localStorage.setItem("mockPortal","1")`. Never active in
 * production builds.
 */
export const isMockPortalEnabled = (): boolean => {
    if (import.meta.env.PROD || import.meta.env.VITE_IS_PROD === "true") {
        return false;
    }
    try {
        const param = new URL(window.location.href).searchParams.get("mockPortal");
        if (param === "1") {
            // Persist so it survives client-side navigation (e.g. "Full profile" → /portal drops the query).
            window.localStorage.setItem("mockPortal", "1");
            return true;
        }
        if (param === "0") {
            window.localStorage.removeItem("mockPortal");
            return false;
        }
        return window.localStorage.getItem("mockPortal") === "1";
    } catch {
        return false;
    }
};

// Small deterministic RNG so the preview is stable across reloads.
const makeRng = (seed: number): (() => number) => {
    let state = seed >>> 0;
    return () => {
        state |= 0;
        state = (state + 0x6d2b79f5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};

const OPPONENTS = [
    "ShadowBlade",
    "IronWarden",
    "FrostQueen",
    "EmberWolf",
    "NightHerald",
    "StoneFist",
    "PaleRider",
    "SunCaller",
    "GraveTactician",
    "VoidPilgrim",
];

const SETUP_PRESETS: PortalMatchSetupData[] = [
    {
        artifact_tier_1: Artifact.Tier1Artifact.IRON_PLATE,
        artifact_tier_2: Artifact.Tier2Artifact.WARLORDS_EDGE,
        perk: Perk.Perk.SEE_NONE,
        augment_placement: 0,
        augment_armor: 3,
        augment_might: 3,
        augment_sniper: 1,
        augment_movement: 0,
        synergies: ["Might:1:2", "Life:2:2"],
        complete: true,
    },
    {
        artifact_tier_1: Artifact.Tier1Artifact.HUNTERS_LONGBOW,
        artifact_tier_2: Artifact.Tier2Artifact.FARSIGHT_QUIVER,
        perk: Perk.Perk.THREE_REVEALS,
        augment_placement: 0,
        augment_armor: 2,
        augment_might: 1,
        augment_sniper: 3,
        augment_movement: 0,
        synergies: ["Nature:2:3", "Chaos:1:2"],
        complete: true,
    },
    {
        artifact_tier_1: Artifact.Tier1Artifact.SWIFT_BOOTS,
        artifact_tier_2: Artifact.Tier2Artifact.CROWN_OF_COMMAND,
        perk: Perk.Perk.SEE_ALL,
        augment_placement: 1,
        augment_armor: 1,
        augment_might: 2,
        augment_sniper: 0,
        augment_movement: 1,
        synergies: ["Chaos:1:3", "Might:2:1"],
        complete: true,
    },
];

const setupPreset = (index: number): PortalMatchSetupData => {
    const preset = SETUP_PRESETS[index % SETUP_PRESETS.length];
    return { ...preset, synergies: [...(preset.synergies ?? [])] };
};

const historicalSetupPreset = (index: number): PortalMatchSetupData => {
    const preset = setupPreset(index);
    return {
        artifact_tier_1: preset.artifact_tier_1,
        artifact_tier_2: preset.artifact_tier_2,
        perk: preset.perk,
        complete: false,
    };
};

interface Tally {
    games: number;
    wins: number;
}
const bump = <K>(map: Map<K, Tally>, key: K, won: boolean): void => {
    const t = map.get(key) ?? { games: 0, wins: 0 };
    t.games += 1;
    t.wins += won ? 1 : 0;
    map.set(key, t);
};

export const buildMockPortal = (): ResponsePlayerPortalObject => {
    const rng = makeRng(20260628);
    const creaturePool = Object.keys(UNIT_ID_TO_NAME)
        .map(Number)
        .filter((id) => id > 0);

    const pickLineup = (size: number): number[] => {
        const pool = [...creaturePool];
        const out: number[] = [];
        for (let i = 0; i < size && pool.length; i++) {
            out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
        }
        return out.sort((a, b) => a - b);
    };

    // A few recurring line-ups (with their own strength) so combos/strategies populate realistically.
    const baseLineups = [
        { lineup: pickLineup(6), winChance: 0.72 },
        { lineup: pickLineup(6), winChance: 0.58 },
        { lineup: pickLineup(6), winChance: 0.46 },
        { lineup: pickLineup(5), winChance: 0.64 },
        { lineup: pickLineup(6), winChance: 0.33 },
    ];

    const TOTAL = 28;
    const dayMs = 86_400_000;
    const now = Date.now();

    const matches: PortalMatchData[] = [];
    const comboTally = new Map<string, Tally>();
    const comboCreatures = new Map<string, number[]>();
    const creatureTally = new Map<number, Tally>();
    const factionTally = new Map<number, Tally>();

    for (let i = 0; i < TOTAL; i++) {
        const base = baseLineups[Math.floor(rng() * baseLineups.length)];
        const lineup = [...base.lineup];
        const opponentLineup = pickLineup(6);
        const draw = rng() < 0.08;
        const abandoned = !draw && rng() < 0.08;
        const playerAbandoned = abandoned && rng() < 0.35;
        const won = draw ? false : abandoned ? !playerAbandoned : rng() < base.winChance;
        const finishedTime = now - i * (dayMs * 0.6) - Math.floor(rng() * dayMs * 0.4);
        const makePerformance = (creatureIds: number[]): PortalUnitPerformanceData[] =>
            creatureIds
                .map((creatureId) => ({
                    creature_id: creatureId,
                    damage_dealt: Math.round(90 + rng() * 1450),
                }))
                .sort((a, b) => (b.damage_dealt ?? 0) - (a.damage_dealt ?? 0));
        const playerPerformance = makePerformance(lineup);
        const opponentPerformance = makePerformance(opponentLineup);

        matches.push({
            game_id: `mock-${i}`,
            won,
            draw,
            abandoned,
            player_abandoned: playerAbandoned,
            finished_time: finishedTime,
            opponent_username: OPPONENTS[Math.floor(rng() * OPPONENTS.length)],
            team: rng() < 0.5 ? 2 : 1,
            creature_ids: lineup,
            opponent_creature_ids: opponentLineup,
            duration_ms: Math.round((4 * 60 + rng() * 22 * 60) * 1000),
            total_laps: 4 + Math.floor(rng() * 12),
            player_damage: playerPerformance.reduce((sum, performance) => sum + (performance.damage_dealt ?? 0), 0),
            opponent_damage: opponentPerformance.reduce((sum, performance) => sum + (performance.damage_dealt ?? 0), 0),
            replay_available: i % 6 !== 5,
            player_top_units: playerPerformance.slice(0, 3),
            opponent_top_units: opponentPerformance.slice(0, 3),
            // Exercise both partial historical setup and matches that predate setup tracking entirely.
            player_setup: i % 12 === 11 ? undefined : i % 8 === 7 ? historicalSetupPreset(i) : setupPreset(i),
            opponent_setup: i % 12 === 11 ? undefined : i % 8 === 7 ? historicalSetupPreset(i + 1) : setupPreset(i + 1),
        });

        const comboKey = lineup.join(",");
        bump(comboTally, comboKey, won);
        comboCreatures.set(comboKey, lineup);
        const seenFactions = new Set<number>();
        for (const id of lineup) {
            bump(creatureTally, id, won);
            let faction = 0;
            try {
                faction = getFactionOf(id as CreatureId) as unknown as number;
            } catch {
                faction = 0;
            }
            if (faction > 0 && !seenFactions.has(faction)) {
                seenFactions.add(faction);
                bump(factionTally, faction, won);
            }
        }
    }

    const wins = matches.filter((m) => m.won).length;
    const losses = matches.filter((m) => !m.won && !m.draw).length;

    // Streaks from newest to oldest.
    let currentStreak = 0;
    if (matches.length && !matches[0].draw) {
        const latestWon = matches[0].won;
        for (const m of matches) {
            if (m.draw || m.won !== latestWon) break;
            currentStreak += 1;
        }
        currentStreak = latestWon ? currentStreak : -currentStreak;
    }
    let bestWinStreak = 0;
    let run = 0;
    for (const m of matches) {
        if (m.won && !m.draw) {
            run += 1;
            bestWinStreak = Math.max(bestWinStreak, run);
        } else {
            run = 0;
        }
    }

    return {
        username: "PreviewCommander",
        wins,
        losses,
        total_games_played: matches.length,
        current_streak: currentStreak,
        best_win_streak: bestWinStreak,
        last_login: now - 3 * 3600_000,
        recent_matches: matches,
        combos: [...comboTally.entries()]
            .sort((a, b) => b[1].games - a[1].games)
            .map(([key, t]) => ({ creature_ids: comboCreatures.get(key) ?? [], games: t.games, wins: t.wins })),
        creature_stats: [...creatureTally.entries()]
            .sort((a, b) => b[1].games - a[1].games)
            .map(([creatureId, t]) => ({ creature_id: creatureId, games: t.games, wins: t.wins })),
        faction_stats: [...factionTally.entries()]
            .sort((a, b) => b[1].games - a[1].games)
            .map(([faction, t]) => ({ faction, games: t.games, wins: t.wins })),
    };
};
