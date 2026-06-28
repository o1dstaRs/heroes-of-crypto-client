import { getFactionOf, type CreatureId, type ResponsePlayerPortalObject } from "@heroesofcrypto/common";

import { UNIT_ID_TO_NAME } from "../unit_ui_constants";

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

    const matches: NonNullable<ResponsePlayerPortalObject["recent_matches"]> = [];
    const comboTally = new Map<string, Tally>();
    const comboCreatures = new Map<string, number[]>();
    const creatureTally = new Map<number, Tally>();
    const factionTally = new Map<number, Tally>();

    for (let i = 0; i < TOTAL; i++) {
        const base = baseLineups[Math.floor(rng() * baseLineups.length)];
        const lineup = [...base.lineup];
        const won = rng() < base.winChance;
        const finishedTime = now - i * (dayMs * 0.6) - Math.floor(rng() * dayMs * 0.4);

        matches.push({
            game_id: `mock-${i}`,
            won,
            abandoned: rng() < 0.06,
            finished_time: finishedTime,
            opponent_username: OPPONENTS[Math.floor(rng() * OPPONENTS.length)],
            team: rng() < 0.5 ? 2 : 1,
            creature_ids: lineup,
            opponent_creature_ids: pickLineup(6),
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
    const losses = matches.length - wins;

    // Streaks from newest to oldest.
    let currentStreak = 0;
    if (matches.length) {
        const latestWon = matches[0].won;
        for (const m of matches) {
            if (m.won !== latestWon) break;
            currentStreak += 1;
        }
        currentStreak = latestWon ? currentStreak : -currentStreak;
    }
    let bestWinStreak = 0;
    let run = 0;
    for (const m of matches) {
        if (m.won) {
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
