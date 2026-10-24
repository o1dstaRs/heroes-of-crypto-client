import { describe, expect, test } from "bun:test";

import { arenaPanelRenderKey } from "./arena-render";

const viewer = { loggedIn: false, playing: false };
const state = () => ({
    tab: "games",
    query: "",
    filters: { games: "all" },
    top: { computedAt: 1, players: [{ playerId: "one", mmr: 1500 }] },
    standings: { computedAt: 1, season: { currency: { name: "Gold" } } },
    games: { computedAt: 1, games: [{ gameId: "match", stage: "pick", predictionPool: 10 }] },
    myBets: new Map<string, unknown>(),
    loading: new Set<string>(),
    errors: new Set<string>(),
    cached: new Set<string>(),
    lastSuccessfulAt: 1,
    predictAmount: 0,
    predictSide: "",
    predictBusy: false,
    predictError: "",
});

describe("arena panel refreshes", () => {
    test("identical responses and connection status preserve the existing panel", () => {
        const first = state();
        const refreshed = state();
        refreshed.top.computedAt = refreshed.games.computedAt = refreshed.standings.computedAt = 200;
        refreshed.lastSuccessfulAt = 200;
        refreshed.loading.add("games");
        refreshed.cached.add("top");
        refreshed.errors.add("standings");
        expect(arenaPanelRenderKey(refreshed, viewer)).toBe(arenaPanelRenderKey(first, viewer));
    });

    test("changed game stage, market, or standing invalidates the panel", () => {
        const initial = arenaPanelRenderKey(state(), viewer);
        for (const change of [
            (next: ReturnType<typeof state>) => {
                next.games.games[0].stage = "fight";
            },
            (next: ReturnType<typeof state>) => {
                next.games.games[0].predictionPool = 100;
            },
            (next: ReturnType<typeof state>) => {
                next.top.players[0].mmr = 1600;
            },
            (next: ReturnType<typeof state>) => {
                next.standings.season.currency.name = "Embers";
            },
        ]) {
            const next = state();
            change(next);
            expect(arenaPanelRenderKey(next, viewer)).not.toBe(initial);
        }
    });

    test("prediction state and existing bets remain part of rendering", () => {
        const initial = arenaPanelRenderKey(state(), viewer);
        for (const patch of [
            { predictAmount: 20 },
            { predictSide: "one" },
            { predictBusy: true },
            { predictError: "closed" },
        ]) {
            expect(arenaPanelRenderKey({ ...state(), ...patch }, viewer)).not.toBe(initial);
        }
        const next = state();
        next.myBets.set("match", { amount: 20 });
        expect(arenaPanelRenderKey(next, viewer)).not.toBe(initial);
    });

    test("initial loading and failures still replace an empty panel", () => {
        const next = { ...state(), games: undefined };
        const empty = arenaPanelRenderKey(next, viewer);
        next.loading.add("games");
        const loading = arenaPanelRenderKey(next, viewer);
        expect(loading).not.toBe(empty);
        next.loading.clear();
        next.errors.add("games");
        expect(arenaPanelRenderKey(next, viewer)).not.toBe(loading);
        expect(arenaPanelRenderKey(next, viewer)).not.toBe(empty);
    });

    test("filters and viewer eligibility invalidate the panel", () => {
        const initial = arenaPanelRenderKey(state(), viewer);
        expect(arenaPanelRenderKey({ ...state(), query: "Artemis" }, viewer)).not.toBe(initial);
        expect(arenaPanelRenderKey({ ...state(), filters: { games: "fight" } }, viewer)).not.toBe(initial);
        expect(arenaPanelRenderKey(state(), { loggedIn: true, playing: false })).not.toBe(initial);
        expect(arenaPanelRenderKey(state(), { loggedIn: true, playing: true })).not.toBe(initial);
    });
});
