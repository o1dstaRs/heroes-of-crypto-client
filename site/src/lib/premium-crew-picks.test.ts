import { expect, test } from "bun:test";
import { premiumCatalog } from "./premium-catalog";
import { CREW_LEVELS, premiumCrewArtifacts, premiumCrewSlots } from "./premium-crew";
import { premiumCrewFactionSlot, rankPremiumCrewPicks, rankPremiumCrewRoster } from "./premium-crew-picks";
import type { PremiumCrewHistory } from "./premium-crew-history";
import type { PremiumLibrary, PremiumRow } from "./premium-library";

const catalog = premiumCatalog("en");
const id = (name: string) => Number(Object.entries(catalog.units).find(([, item]) => item.name === name)![0]);
const names = (...names: string[]) => names.map(id);
const crew = () => names("Dryad", "Arbalester", "Elf", "Beholder", "Cyclops", "Gargantuan");
const row = (ids: number[], score = 0.6, families = 80): PremiumRow => ({
    key: ids.join(":"),
    ids,
    families,
    observations: families * 2,
    score,
    interval: [Math.max(0, score - 0.15), Math.min(1, score + 0.15)],
    frequency: 0.1,
});
const library = (units: PremiumRow[] = []): PremiumLibrary => ({
    scope: { cohort: "ranked-draft", map: 1 },
    families: 80,
    armies: 160,
    maps: [],
    units,
    pairs: [],
    triples: [],
    artifactsTier1: [],
    artifactsTier2: [],
    synergies: [],
    plans: [],
    doctrines: [],
});

test("SQLite outcomes alone set the pick order; a faction bonus does not manufacture a higher score", () => {
    const data = library([row([id("Trent")], 0.4), row([id("Medusa")], 0.7)]);
    const picks = rankPremiumCrewPicks(crew(), 3, catalog, data);
    expect(picks[0].id).toBe(id("Medusa"));
    expect(picks[0].evidence?.score).toBe(0.7);
    const nature = picks.find((pick) => pick.id === id("Trent"))!;
    expect(nature.evidence?.score).toBe(0.4);
    expect(nature.signals).toContainEqual(
        expect.objectContaining({ kind: "synergy", faction: "Nature", text: "Nature level 2" }),
    );
    expect(nature.score).toBe(data.units[0].interval[0]);
    expect(rankPremiumCrewPicks(crew(), -1, catalog, data)).toEqual([]);
});

test("a shared SQLite co-play population overrides marginal unit results without mixing the two", () => {
    const ids = crew();
    const data = library([row([id("Medusa")], 0.9), row([id("Trent")], 0.8)]);
    const history = {
        slots: Array.from({ length: 6 }, (_, slot) => ({
            slot,
            contextUnits: [id("Dryad")],
            rows: slot === 3 ? [row([id("Trent")], 0.55)] : [],
        })),
    } as PremiumCrewHistory;
    const picks = rankPremiumCrewPicks(ids, 3, catalog, data, "en", history);
    expect(picks[0].id).toBe(id("Trent"));
    expect(picks[0].contextUnits).toEqual([id("Dryad")]);
    expect(picks[0].evidence?.score).toBe(0.55);
    expect(picks.find((pick) => pick.id === id("Medusa"))?.evidence).toBeUndefined();
});

test("all 56 icons retain legal slots, including selections outside the active level", () => {
    const ids = crew();
    const picks = rankPremiumCrewRoster(ids, 1, catalog);
    expect(picks).toHaveLength(56);
    expect(new Set(picks.map((pick) => pick.id)).size).toBe(56);
    expect(picks.some((pick) => catalog.units[pick.id].name === "Arachna Spider")).toBe(false);
    for (const pick of picks.filter((pick) => !pick.selected)) {
        const slots = premiumCrewSlots(ids, catalog);
        expect(CREW_LEVELS[pick.slot]).toBe(catalog.units[pick.id].level);
        if (catalog.units[pick.id].level === 1) expect(pick.slot).toBe(1);
        slots[pick.slot] = pick.id;
        const next = slots.filter((value): value is number => value !== undefined);
        expect(next).toHaveLength(6);
        expect(new Set(next).size).toBe(6);
        expect(next.map((id) => catalog.units[id].level)).toEqual(CREW_LEVELS);
    }
});

test("three badges require real support, and a one-family 100% result cannot outrank supported data", () => {
    const data = library([
        row([id("Trent")], 1, 1),
        row([id("Medusa")], 0.6),
        row([id("Harpy")], 0.57),
        row([id("Healer")], 0.54),
    ]);
    const picks = rankPremiumCrewRoster(crew(), 3, catalog, data);
    expect(picks.filter((pick) => pick.suggestion).map((pick) => pick.id)).toEqual(names("Medusa", "Harpy", "Healer"));
    expect(picks.find((pick) => pick.id === id("Trent"))?.suggestion).toBeUndefined();
    expect(picks.find((pick) => pick.id === id("Trent"))?.evidence?.score).toBe(1);
    expect(rankPremiumCrewRoster(crew(), 3, catalog).every((pick) => !pick.evidence && !pick.suggestion)).toBe(true);
});

test("faction shortcuts enforce quotas while retaining actual battle ordering", () => {
    const data = library([row([id("Trent")], 0.7), row([id("Satyr")], 0.6), row([id("White Tiger")], 0.55)]);
    const picks = rankPremiumCrewRoster(crew(), 3, catalog, data, "en", "Nature");
    expect(picks).toHaveLength(56);
    expect(picks.filter((pick) => pick.suggestion).map((pick) => pick.id)).toEqual(
        names("Trent", "Satyr", "White Tiger"),
    );
    const slot = premiumCrewFactionSlot(crew(), "Nature", catalog, data)!;
    expect(catalog.units[premiumCrewSlots(crew(), catalog)[slot]!].faction).not.toBe("Nature");
    expect(
        premiumCrewFactionSlot(
            names("Dryad", "Leprechaun", "Elf", "Trent", "Mantis", "Gargantuan"),
            "Nature",
            catalog,
            data,
        ),
    ).toBeUndefined();
});

test("artifact order and percentages come from recorded results and cannot fall back to policy weights", () => {
    const data = library();
    data.artifactsTier1 = [row([1], 0.45), row([9], 0.7)];
    data.artifactsTier2 = [row([2], 0.6), row([15], 1, 1)];
    const picks = premiumCrewArtifacts(crew(), catalog, 3, data);
    expect(picks.filter((pick) => pick.tier === 1).map((pick) => pick.id)).toEqual([9, 1]);
    expect(picks.find((pick) => pick.tier === 2)?.id).toBe(2);
    expect(picks.find((pick) => pick.id === 9 && pick.tier === 1)?.evidence.score).toBe(0.7);
    expect(premiumCrewArtifacts(crew(), catalog)).toEqual([]);
});
