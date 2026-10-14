import { describe, expect, test } from "bun:test";

import { normalizePlayerMetrics } from "./player_metrics_contract";

const empty = () => ({
    version: 1,
    window: 20,
    mode: "ranked",
    gamesConsidered: 4,
    recordedGames: 0,
    missingGames: 4,
    minimumVersatilityGames: 5,
    stylePct: null,
    versatility: null,
    uniqueCreatures: null,
    human: null,
    automated: null,
    health: null,
    humanChoices: null,
    automatedChoices: null,
    damageCoverage: "actual health totals; partial event delivery",
    recent: [],
});

describe("player metrics wire contract", () => {
    test("preserves unavailable data rather than inventing zero scores", () => {
        expect(normalizePlayerMetrics(empty())).toEqual(empty());
        expect(normalizePlayerMetrics(undefined)).toBeNull();
        expect(normalizePlayerMetrics({})).toBeNull();
    });
    test("rejects inconsistent coverage, unsupported versions and malformed health", () => {
        expect(normalizePlayerMetrics({ ...empty(), version: 2 })).toBeNull();
        expect(normalizePlayerMetrics({ ...empty(), recordedGames: 3 })).toBeNull();
        expect(normalizePlayerMetrics({ ...empty(), health: { damageDealtHp: -1 } })).toBeNull();
        expect(normalizePlayerMetrics({ ...empty(), stylePct: { melee: 101 } })).toBeNull();
        expect(normalizePlayerMetrics({ ...empty(), humanChoices: { attack: 1 } })).toBeNull();
    });
    test("supports mode filters and rejects non-finite metrics", () => {
        expect(normalizePlayerMetrics({ ...empty(), mode: "practice" })?.mode).toBe("practice");
        expect(normalizePlayerMetrics({ ...empty(), mode: "all" })?.mode).toBe("all");
        expect(normalizePlayerMetrics({ ...empty(), versatility: Number.NaN })).toBeNull();
        expect(normalizePlayerMetrics({ ...empty(), mode: "sandbox" })).toBeNull();
    });
});
