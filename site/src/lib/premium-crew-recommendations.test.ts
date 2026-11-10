import { expect, test } from "bun:test";
import { premiumCatalog } from "./premium-catalog";
import { CREW_LEVELS, premiumCrewBoardPlan, samplePremiumCrew } from "./premium-crew";
import {
    premiumCrewComboDraft,
    premiumCrewComboRecommendations,
    premiumCrewSynergyRecommendations,
    renderPremiumCrewRecommendations,
} from "./premium-crew-recommendations";
import { normalizePremiumCrewDraft, premiumCrewShareUrl, readPremiumCrewDraft } from "./premium-crew-state";
import type { PremiumCatalog, PremiumLibrary, PremiumRow } from "./premium-library";
import type { PremiumCrewHistory } from "./premium-crew-history";

const catalog = premiumCatalog("en");
const own = samplePremiumCrew(null, catalog);
const unit = (name: string) => Number(Object.keys(catalog.units).find((id) => catalog.units[id].name === name));
const row = (ids: number[], score = 0.65, families = 100, lower = score - 0.15): PremiumRow => ({
    key: ids.join(":"),
    ids,
    score,
    families,
    observations: families,
    interval: [lower, Math.min(1, score + 0.15)],
    frequency: 0.1,
});
const data = (input: Partial<PremiumLibrary> = {}) =>
    ({
        scope: { cohort: "ranked-draft" },
        families: 1000,
        armies: 2000,
        maps: [],
        units: [],
        pairs: [],
        triples: [],
        artifactsTier1: [],
        artifactsTier2: [],
        synergies: [],
        plans: [],
        doctrines: [],
        ...input,
    }) as PremiumLibrary;

test("one-click pairs and trios reserve all requested picks, retain other tiers and obey the six-slot rules", () => {
    const l1 = Object.keys(catalog.units)
        .map(Number)
        .filter((id) => catalog.units[id].level === 1 && !own.includes(id))
        .slice(0, 2);
    const requested = [own[0], unit("Medusa"), unit("Hydra")];
    const draft = premiumCrewComboDraft(own, requested, catalog, 0)!;
    expect(draft.ids).toHaveLength(6);
    expect(new Set(draft.ids).size).toBe(6);
    expect(requested.every((id) => draft.ids.includes(id))).toBe(true);
    expect(draft.ids.map((id) => catalog.units[id].level)).toEqual([...CREW_LEVELS]);
    expect(draft.ids).toContain(own[4]);
    const pair = premiumCrewComboDraft(own, l1, catalog, 0)!;
    expect(pair.ids.slice(0, 2)).toEqual(l1);
    expect(pair.ids.slice(2)).toEqual(own.slice(2));
    expect(pair.replaced).toEqual(own.slice(0, 2));
    for (const bad of [[], [own[0], own[0]], [999999], [unit("Crusader"), unit("Unicorn")], [...own]])
        expect(premiumCrewComboDraft(own, bad, catalog)).toBeUndefined();
    const partial = premiumCrewComboDraft([], [unit("Medusa"), unit("Hydra")], catalog)!;
    expect(partial.ids).toEqual([unit("Medusa"), unit("Hydra")]);
    expect(partial.replaced).toEqual([]);
});

test("combination suggestions use supported observed rows and prefer connections to the selected crew", () => {
    const connected = row([own[0], unit("Medusa")], 0.6, 200, 0.55);
    const uncertain = row([own[0], unit("Trent")], 0.9, 50, 0.4);
    const unrelated = row([unit("Peasant"), unit("Hydra")], 0.95, 300, 0.85);
    const library = data({
        pairs: [
            uncertain,
            unrelated,
            connected,
            row([own[0], unit("Healer")], 0.99, 49),
            row([unit("Crusader"), unit("Unicorn")], 0.99, 500),
        ],
    });
    const result = premiumCrewComboRecommendations(own, 2, catalog, library, 50);
    expect(result.withCrew).toBe(true);
    expect(result.rows).toEqual([connected, uncertain]);
    const broad = premiumCrewComboRecommendations([], 2, catalog, library, 50);
    expect(broad.withCrew).toBe(false);
    expect(broad.rows[0]).toEqual(unrelated);
    const triad = row([own[0], unit("Medusa"), unit("Hydra")]);
    expect(premiumCrewComboRecommendations(own, 3, catalog, data({ triples: [triad] }), 50).rows).toEqual([triad]);
});

test("unit suggestions use the active slot's shared history, never a fabricated fit score or a different population", () => {
    const observed = row([unit("Peasant")], 0.7, 91);
    const history = { slots: [{ slot: 0, contextUnits: [own[4]], rows: [observed] }] } as PremiumCrewHistory;
    const html = renderPremiumCrewRecommendations(
        own,
        0,
        "units",
        catalog,
        data({ units: [row([unit("Wolf")], 0.99, 500)] }),
        "en",
        50,
        history,
    );
    expect(html).toContain("70.0%");
    expect(html).toContain("n=91");
    expect(html).toContain(`With ${catalog.units[own[4]].name}`);
    expect(html).not.toContain("99.0%");
    expect(html).toContain(`data-crew-combo="${unit("Peasant")}"`);
    expect(html).toContain("data-premium-help");
    history.slots[0].rows = [];
    expect(
        renderPremiumCrewRecommendations(own, 0, "units", catalog, data({ units: [observed] }), "en", 50, history),
    ).not.toContain("70.0%");
});

test("different partner pairs that make the same crew change occupy only one suggestion", () => {
    const first = row([own[0], unit("Hydra")], 0.8, 120, 0.7);
    const duplicateChange = row([own[2], unit("Hydra")], 0.8, 110, 0.65);
    const different = row([own[0], unit("Black Dragon")], 0.7, 100, 0.6);
    expect(
        premiumCrewComboRecommendations(own, 2, catalog, data({ pairs: [first, duplicateChange, different] }), 50).rows,
    ).toEqual([first, different]);
});

test("combo cards show real percentages and explicit replacements before applying a pick", () => {
    const pair = row([own[0], unit("Hydra")], 0.72, 154);
    const html = renderPremiumCrewRecommendations(own, 5, "pairs", catalog, data({ pairs: [pair] }), "en");
    expect(html).toContain("72.0%");
    expect(html).toContain("n=154");
    expect(html).toContain("Use pair");
    expect(html).toContain(`Replaces ${catalog.units[own[5]].name}`);
    expect(html).toContain(`data-crew-combo="${pair.ids.join(",")}"`);
    expect(html).toContain("premium-pick-portrait");
    expect(html).toContain("not a win forecast");
});

test("artifact recommendations retain tier and sample boundaries and exclude artifacts with no beneficiaries", () => {
    const ground = [unit("Peasant"), unit("Pikeman")];
    const artifact = (slug: string) =>
        Object.entries(catalog.artifacts)
            .find(([, item]) => item.slug === slug)![0]
            .split(":")
            .map(Number);
    const [tier, flying] = artifact("winged_boots");
    const supported = row([1], 0.64, 120);
    const library = data({
        artifactsTier1: [supported, row([flying], 0.99, 500)],
        artifactsTier2: [row([2], 0.56, 71)],
    });
    expect(tier).toBe(1);
    const html = renderPremiumCrewRecommendations(
        ground,
        0,
        "artifacts",
        catalog,
        library,
        "en",
        50,
        undefined,
        [1, 2],
    );
    expect(html).toContain("64.0%");
    expect(html).toContain("56.0%");
    expect(html).not.toContain("99.0%");
    expect(html).toContain('data-crew-artifact-tier="1" data-crew-artifact="1"');
    expect(html).toContain("Equipped ✓");
    expect(html).toContain("one per tier");
});

test("synergy suggestions respect native faction activation levels and actual roster capacity", () => {
    const twoLife = [unit("Peasant"), unit("Pikeman")];
    const rows = [row([4, 1, 1]), row([4, 2, 2]), row([4, 2, 3]), row([99, 1, 1]), row([4, 3, 1])];
    const picks = premiumCrewSynergyRecommendations(twoLife, catalog, rows, 50);
    expect(picks.map((item) => item.level)).toEqual([1, 2]);
    expect(picks.map((item) => item.needed)).toEqual([0, 2]);
    const limited = {
        ...catalog,
        units: Object.fromEntries(
            Object.entries(catalog.units).filter(
                ([id, item]) => item.faction !== "Life" || twoLife.includes(Number(id)),
            ),
        ),
    } as PremiumCatalog;
    expect(premiumCrewSynergyRecommendations(twoLife, limited, rows, 50).map((item) => item.level)).toEqual([1]);
    const html = renderPremiumCrewRecommendations(twoLife, 0, "synergies", catalog, data({ synergies: rows }), "en");
    expect(html).toContain("One variant is rolled");
    expect(html).toContain('data-crew-faction="Life"');
    expect(html).toContain("Level active");
});

test("equipped artifacts survive saved/shared drafts and are the planner's actual artifacts", () => {
    const artifactIds: [number, number] = [9, 4];
    const draft = {
        version: 1 as const,
        ids: own,
        layout: "screen" as const,
        battlefield: "all" as const,
        artifactIds,
    };
    const link = new URL(premiumCrewShareUrl(new URL("https://heroesofcrypto.io/premium/?token=secret"), draft));
    expect(readPremiumCrewDraft(link, null, catalog)).toEqual(draft);
    expect(readPremiumCrewDraft(new URL("https://heroesofcrypto.io/premium/"), JSON.stringify(draft), catalog)).toEqual(
        draft,
    );
    expect(link.searchParams.has("token")).toBe(false);
    expect(
        premiumCrewBoardPlan(own, [], catalog, "screen", 1, undefined, null, undefined, artifactIds).own.input
            .artifacts,
    ).toEqual(artifactIds);
    expect(normalizePremiumCrewDraft({ ...draft, artifactIds: [999999, 4] }, catalog).artifactIds).toEqual([0, 4]);
    expect(normalizePremiumCrewDraft({ ...draft, artifactIds: [999999, -1] }, catalog).artifactIds).toBeUndefined();
});

test("missing observations never become recommendation percentages", () => {
    for (const category of ["units", "pairs", "triples", "artifacts", "synergies"] as const) {
        const html = renderPremiumCrewRecommendations(own, 0, category, catalog, null, "en");
        expect(html).toContain("Best next picks");
        expect(html).not.toMatch(/\d+\.\d+%/);
        expect(html).not.toContain("data-crew-combo=");
    }
});

test("smaller samples are opt-in and remain explicitly marked", () => {
    const library = data({ triples: [row([own[0], unit("Medusa"), unit("Hydra")], 0.75, 27)] });
    const strict = renderPremiumCrewRecommendations(own, 0, "triples", catalog, library, "en", 50);
    expect(strict).not.toContain("75.0%");
    expect(strict).toContain('data-crew-recommendation-minimum="20"');
    const smaller = renderPremiumCrewRecommendations(own, 0, "triples", catalog, library, "en", 20);
    expect(smaller).toContain("75.0%");
    expect(smaller).toContain("n=27");
    expect(smaller).toContain("Small sample");
});
