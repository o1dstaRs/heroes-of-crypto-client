import { expect, test } from "bun:test";
import {
    premiumInsightRows,
    premiumUnitMatchups,
    renderPremiumInsights,
    renderPremiumMatchups,
} from "./premium-insights";
import type { PremiumCatalog, PremiumLibrary, PremiumRow } from "./premium-library";
import type { PremiumView } from "./premium-render";

const row = (ids: number[], score: number, interval: [number, number], families = 100): PremiumRow => ({
    key: ids.join(":"),
    ids,
    score,
    interval,
    families,
    observations: families,
    frequency: 0.1,
});
const catalog: PremiumCatalog = {
    units: {
        1: { name: "Peasant", slug: "peasant", anchor: "unit-peasant", level: 1, faction: "Life" },
        2: { name: "Wolf", slug: "wolf", anchor: "unit-wolf", level: 1, faction: "Nature" },
        3: { name: "Griffin", slug: "griffin", anchor: "unit-griffin", level: 3, faction: "Life" },
    },
    artifacts: {},
    doctrines: {},
};
const library = (): PremiumLibrary => ({
    scope: { cohort: "ranked-draft", map: 1 },
    families: 1000,
    armies: 2000,
    maps: [],
    units: [row([1], 0.58, [0.48, 0.68]), row([2], 1, [0, 1], 1), row([3], 0.64, [0.59, 0.69])],
    pairs: [],
    triples: [],
    artifactsTier1: [],
    artifactsTier2: [],
    synergies: [],
    plans: [],
    doctrines: [],
});
const view: PremiumView = {
    lang: "en",
    minimum: 50,
    search: "",
    level: "",
    sort: "confidence",
    combo: "pairs",
    tier: 1,
    matchupUnit: 3,
};

test("snapshot highlights compare units within level and never headline tiny samples", () => {
    const data = library();
    const before = JSON.stringify(data);
    const result = premiumInsightRows(data, catalog, 1);
    expect(result.threshold).toBe(50);
    expect(result.unitLeaders.map((row) => row.ids[0])).toEqual([1, 3]);
    expect(result.unitLaggards).toEqual([]);
    expect(JSON.stringify(data)).toBe(before);
    const html = renderPremiumInsights(data, catalog, view);
    expect(html).toContain("Advantage unresolved");
    expect(html).toContain("No clear below-50% unit result");
    expect(html).toContain("selected snapshot, cohort and map");
    expect(html).not.toContain("Wolf");
});

test("only calls a lower outcome signal when the whole interval is below 50%", () => {
    const data = library();
    data.units.push(row([2], 0.4, [0.32, 0.48]));
    expect(premiumInsightRows(data, catalog, 50).unitLaggards.map((row) => row.ids[0])).toEqual([2]);
    data.units[3].interval[1] = 0.5;
    expect(premiumInsightRows(data, catalog, 50).unitLaggards).toEqual([]);
});

test("matchup groups retain own/opponent direction, support and unresolved intervals", () => {
    const data = library();
    data.matchups = [
        row([3, 1], 0.65, [0.55, 0.75]),
        row([3, 2], 0.35, [0.25, 0.45]),
        row([3, 4], 0.55, [0.4, 0.7]),
        row([1, 3], 0.35, [0.25, 0.45]),
        row([3, 5], 1, [0.6, 1], 1),
    ];
    const result = premiumUnitMatchups(data, 3, 50);
    expect(result.favorable.map((row) => row.ids)).toEqual([[3, 1]]);
    expect(result.difficult.map((row) => row.ids)).toEqual([[3, 2]]);
    expect(result.unresolved.map((row) => row.ids)).toEqual([[3, 4]]);
    const html = renderPremiumMatchups(data, catalog, view);
    expect(html).toContain("Griffin");
    expect(html).toContain("65.0%");
    expect(html).toContain("35.0%");
    expect(html).toContain("full armies that contained the two units on opposite sides");
    expect(html).toContain("Other units and upgrades also affect the result.");
});

test("unavailable and insufficient matchup data never become a losing score", () => {
    const data = library();
    expect(renderPremiumMatchups(data, catalog, view)).toContain("not available from this server yet");
    data.matchups = [];
    const html = renderPremiumMatchups(data, catalog, view);
    expect(html).toContain("No matchup has a full 95% interval above 50%");
    expect(html).not.toContain("0.0%");
});
