import { expect, test } from "bun:test";
import { premiumCatalog } from "./premium-catalog";
import { CREW_LEVELS, premiumCrewArtifactBenefit } from "./premium-crew";
import { normalizePremiumCrewDraft, premiumCrewShareUrl, readPremiumCrewDraft } from "./premium-crew-state";

const catalog = premiumCatalog("en");
const units = Object.entries(catalog.units).filter(([, item]) => item.kit?.amount);
const ids: number[] = [];
for (const level of CREW_LEVELS)
    ids.push(Number(units.find(([id, item]) => item.level === level && !ids.includes(Number(id)))![0]));
const saved = { version: 1 as const, ids, layout: "spread" as const, battlefield: "3" as const };

test("saved and shared crews enforce current draft quotas and discard unavailable picks", () => {
    const level3 = units.filter(([, item]) => item.level === 3).map(([id]) => Number(id));
    const input = { version: 1, ids: [...ids, ...ids, ...level3, -1, 999999, "1", null] };
    const before = JSON.stringify(input);
    const result = normalizePremiumCrewDraft(input, catalog);
    expect(result.ids).toEqual(ids);
    expect(result.ids.map((id) => catalog.units[id].level)).toEqual([1, 1, 2, 2, 3, 4]);
    expect(JSON.stringify(input)).toBe(before);
    const future = normalizePremiumCrewDraft({ ...saved, version: 2 }, catalog);
    expect(future).toEqual({ version: 1, ids: [], layout: "screen", battlefield: "all" });
});

test("crew links round-trip formation and battlefield without unrelated query data", () => {
    for (const path of ["/premium/", "/ru/premium/"]) {
        const link = new URL(
            premiumCrewShareUrl(
                new URL(`https://heroesofcrypto.io${path}?redirect=/profile&token=private#premium-units`),
                saved,
            ),
        );
        expect(link.pathname).toBe(path);
        expect(link.hash).toBe("#premium-crew");
        expect(link.searchParams.has("redirect")).toBe(false);
        expect(link.searchParams.has("token")).toBe(false);
        expect(readPremiumCrewDraft(link, null, catalog)).toEqual(saved);
    }
});

test("automatic and manually changed synergies keep their mode through refreshes and shared links", () => {
    for (const synergiesAutomatic of [true, false]) {
        const draft = { ...saved, synergyVariants: { Life: 2 as const, Nature: 1 as const }, synergiesAutomatic };
        const page = new URL("https://heroesofcrypto.io/premium/");
        expect(readPremiumCrewDraft(page, JSON.stringify(draft), catalog)).toEqual(draft);
        expect(readPremiumCrewDraft(new URL(premiumCrewShareUrl(page, draft)), null, catalog)).toEqual(draft);
    }
});

test("explicit shared crews override storage, including an empty crew; damaged storage remains usable", () => {
    const stored = JSON.stringify(saved);
    expect(readPremiumCrewDraft(new URL("https://heroesofcrypto.io/premium/"), stored, catalog)).toEqual(saved);
    expect(readPremiumCrewDraft(new URL("https://heroesofcrypto.io/premium/?crew="), stored, catalog).ids).toEqual([]);
    for (const invalid of ["{", "null", "[]", "x".repeat(5000)]) {
        expect(readPremiumCrewDraft(new URL("https://heroesofcrypto.io/premium/"), invalid, catalog).ids).toEqual([]);
    }
    expect(
        readPremiumCrewDraft(
            new URL("https://heroesofcrypto.io/premium/?crew=garbage,-1&formation=bogus&battlefield=99"),
            stored,
            catalog,
        ),
    ).toEqual({ version: 1, ids: [], layout: "screen", battlefield: "all" });
});

test("artifact explanations name only the supplied eligible units", () => {
    const id = (name: string) => Number(units.find(([, item]) => item.name === name)![0]);
    const pair = [id("Peasant"), id("Medusa")];
    const ranged = premiumCrewArtifactBenefit("quiver_of_echoes", pair, "en");
    expect(ranged.names).toEqual(["Medusa"]);
    expect(ranged.label).toBe("For 1 ranged unit");
    expect(premiumCrewArtifactBenefit("cursed_ward", pair, "en").names).toEqual(["Peasant", "Medusa"]);
    expect(premiumCrewArtifactBenefit("mages_ring", [id("Peasant")], "en").names).toEqual([]);
});
