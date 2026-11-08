import { expect, test } from "bun:test";
import { premiumCatalog } from "./premium-catalog";
import { CREW_LEVELS, premiumCrewArtifacts, premiumCrewSlots, samplePremiumCrew } from "./premium-crew";
import { premiumCrewFactionSlot, rankPremiumCrewPicks } from "./premium-crew-picks";
import type { PremiumLibrary, PremiumRow } from "./premium-library";

const catalog = premiumCatalog("en");
const id = (name: string) => Number(Object.entries(catalog.units).find(([, item]) => item.name === name)![0]);
const names = (...names: string[]) => names.map(id);
const row = (ids: number[], families = 80): PremiumRow => ({
    key: ids.join(","),
    ids,
    families,
    observations: families * 2,
    score: 0.8,
    interval: [0.65, 0.95],
    frequency: 0.1,
});
const library = (units: PremiumRow[] = [], pairs: PremiumRow[] = []): PremiumLibrary => ({
    scope: { cohort: "ranked-draft", map: 1 },
    families: 80,
    armies: 160,
    maps: [],
    units,
    pairs,
    triples: [],
    artifactsTier1: [],
    artifactsTier2: [],
    synergies: [],
    plans: [],
    doctrines: [],
});

test("the next-pick order only offers the selected level and keeps already picked units behind available ones", () => {
    const crew = samplePremiumCrew(null, catalog);
    const before = JSON.stringify(crew);
    for (let slot = 0; slot < 6; slot++) {
        const picks = rankPremiumCrewPicks(crew, slot, catalog);
        expect(picks.length).toBeGreaterThan(1);
        expect(new Set(picks.map((pick) => pick.id)).size).toBe(picks.length);
        expect(picks.every((pick) => catalog.units[pick.id].level === CREW_LEVELS[slot])).toBe(true);
        expect(picks[0].selected).toBe(false);
        const firstPicked = picks.findIndex((pick) => pick.selected);
        expect(picks.slice(firstPicked).every((pick) => pick.selected)).toBe(true);
        const available = picks.filter((pick) => !pick.selected);
        expect(available.every((pick, i) => !i || pick.score <= available[i - 1].score)).toBe(true);
    }
    expect(JSON.stringify(crew)).toBe(before);
    expect(rankPremiumCrewPicks(crew, -1, catalog)).toEqual([]);
});

test("a replacement removes the old faction contribution before scoring the next bonus", () => {
    const crew = samplePremiumCrew(null, catalog);
    const completing = rankPremiumCrewPicks(crew, 3, catalog).find((pick) => pick.id === id("Trent"))!;
    const retaining = rankPremiumCrewPicks(crew, 2, catalog).find((pick) => pick.id === id("Trent"))!;
    expect(completing.signals).toContainEqual(
        expect.objectContaining({ kind: "synergy", faction: "Nature", text: "Nature level 2" }),
    );
    expect(completing.signals.find((signal) => signal.text === "Nature level 2")?.detail).toContain(
        "One variant is rolled",
    );
    expect(retaining.signals.some((signal) => signal.text === "Nature level 2")).toBe(false);
    expect(completing.score).toBeGreaterThan(retaining.score);
    const fourNature = names("Dryad", "Arbalester", "Elf", "Trent", "Cyclops", "Gargantuan");
    const trade = rankPremiumCrewPicks(fourNature, 0, catalog).find((pick) => pick.id === id("Peasant"))!;
    expect(trade.signals).toContainEqual(
        expect.objectContaining({ kind: "synergy", faction: "Life", text: "Life level 1" }),
    );
    expect(trade.signals).toContainEqual({ kind: "lost-synergy", faction: "Nature", text: "Nature drops to L1" });
});

test("historical support helps rank a pick only at the sample floor and pairs must match the actual allies", () => {
    const crew = samplePremiumCrew(null, catalog);
    const candidate = id("Trent");
    const baseline = rankPremiumCrewPicks(crew, 3, catalog).find((pick) => pick.id === candidate)!;
    const weak = rankPremiumCrewPicks(
        crew,
        3,
        catalog,
        library([row([candidate], 20)], [row([candidate, crew[0]], 20)]),
    ).find((pick) => pick.id === candidate)!;
    expect(weak.score).toBe(baseline.score);
    const supported = rankPremiumCrewPicks(
        crew,
        3,
        catalog,
        library([row([candidate])], [row([candidate, crew[0]])]),
    ).find((pick) => pick.id === candidate)!;
    expect(supported.score).toBeGreaterThan(baseline.score);
    expect(supported.signals).toContainEqual({ kind: "pair", text: "Recorded with Dryad" });
    const unrelated = rankPremiumCrewPicks(crew, 3, catalog, library([], [row([candidate, id("Orc")])])).find(
        (pick) => pick.id === candidate,
    )!;
    expect(unrelated.score).toBe(baseline.score);
    expect(unrelated.signals.some((signal) => signal.kind === "pair")).toBe(false);
});

test("faction guidance opens a legal replacement slot that can advance the chosen faction", () => {
    const crew = samplePremiumCrew(null, catalog);
    const slot = premiumCrewFactionSlot(crew, "Nature", catalog)!;
    expect(slot).toBeGreaterThanOrEqual(0);
    const slots = premiumCrewSlots(crew, catalog);
    expect(catalog.units[slots[slot]!].faction).not.toBe("Nature");
    expect(
        rankPremiumCrewPicks(crew, slot, catalog).some(
            (pick) => !pick.selected && catalog.units[pick.id].faction === "Nature",
        ),
    ).toBe(true);
    const complete = names("Dryad", "Leprechaun", "Elf", "Trent", "Mantis", "Gargantuan");
    expect(premiumCrewFactionSlot(complete, "Nature", catalog)).toBeUndefined();
    expect(premiumCrewFactionSlot(crew, "Unknown", catalog)).toBeUndefined();
});

test("artifact previews use the proposed crew, with ranked options within each tier", () => {
    const crew = samplePremiumCrew(null, catalog);
    for (const pick of rankPremiumCrewPicks(crew, 4, catalog).filter((pick) => !pick.selected)) {
        const next = [...crew];
        next[4] = pick.id;
        expect(pick.artifacts.map((item) => item.key)).toEqual(
            premiumCrewArtifacts(next, catalog).map((item) => item.key),
        );
        const beneficiaries = pick.artifacts.flatMap((item) => item.benefit.names);
        expect(beneficiaries.every((name) => next.some((id) => catalog.units[id].name === name))).toBe(true);
        expect(beneficiaries).not.toContain(catalog.units[crew[4]].name);
    }
    const options = premiumCrewArtifacts(crew, catalog, 3);
    expect(options).toHaveLength(6);
    for (const tier of [1, 2]) {
        const ranked = options.filter((item) => item.tier === tier);
        expect(ranked).toHaveLength(3);
        expect(ranked.every((item, i) => !i || item.score <= ranked[i - 1].score)).toBe(true);
    }
});
