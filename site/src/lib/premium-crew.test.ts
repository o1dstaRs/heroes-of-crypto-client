import { expect, test } from "bun:test";
import { valid } from "@heroesofcrypto/common/src/ai/placement/layout";
import { premiumCatalog } from "./premium-catalog";
import {
    CREW_LEVELS,
    premiumCrewArtifacts,
    premiumCrewFormation,
    premiumCrewSlots,
    premiumCrewSynergies,
    renderPremiumCrew,
    samplePremiumCrew,
} from "./premium-crew";
import type { PremiumLibrary } from "./premium-library";
import { premiumCrewEvidenceResponse } from "../../server/premium-crew-evidence";
import type { PremiumEvidenceSnapshot } from "@heroesofcrypto/common/src/simulation/premium_evidence_snapshot";

const catalog = premiumCatalog("en");
const eligible = Object.entries(catalog.units).filter(([, item]) => item.kit?.amount);
const crew = (offset = 0) => {
    const picked: number[] = [];
    for (const level of CREW_LEVELS) {
        const options = eligible.filter(([id, item]) => item.level === level && !picked.includes(Number(id)));
        picked.push(Number(options[offset % options.length][0]));
    }
    return picked;
};

test("the starting crew fills all six legal board positions without requiring battle statistics", () => {
    const ids = samplePremiumCrew(null, catalog);
    expect(ids).toHaveLength(6);
    expect(new Set(ids).size).toBe(6);
    expect(ids.map((id) => catalog.units[id].level)).toEqual(CREW_LEVELS);
    const formation = premiumCrewFormation(ids, catalog);
    expect(valid(formation.input, formation.positions)).toBe(true);
    const html = renderPremiumCrew(ids, catalog, "en", "screen", 1, false);
    expect(html.match(/class="premium-crew-token"/g)).toHaveLength(6);
    expect(html).not.toContain("Add unit");
    expect(html).not.toContain("data-crew-sample");
    for (const id of ids) expect(html).toContain(`data-knowledge-reference="${catalog.units[id].anchor}"`);
});

test("starting crews retain saved units and fill missing tiers when the evidence only covers one choice", () => {
    const existing = crew(1);
    const observed = eligible.find(([id, item]) => item.level === 3 && Number(id) !== existing[4])!;
    const library = {
        units: [{ key: observed[0], ids: [Number(observed[0])], families: 80, interval: [0.45, 0.7] }],
    } as PremiumLibrary;
    expect(samplePremiumCrew(library, catalog, existing)).toEqual(existing);
    const partial = [existing[0], existing[2]];
    const filled = samplePremiumCrew(library, catalog, partial);
    expect(filled).toHaveLength(6);
    expect(filled).toContain(partial[0]);
    expect(filled).toContain(partial[1]);
    expect(filled).toContain(Number(observed[0]));
    expect(filled.map((id) => catalog.units[id].level)).toEqual(CREW_LEVELS);
    const html = renderPremiumCrew(filled, catalog, "en", "screen", 1);
    const boardButtons = html.match(/<button[^>]*class="premium-crew-token"[^>]*>/g)!;
    expect(boardButtons).toHaveLength(6);
    boardButtons.forEach((button, index) => {
        expect(button).toContain(`data-crew-slot="${index}"`);
        expect(button).toContain('aria-label="Replace ');
    });
});

test("crew tools remain usable without offering unavailable statistical picks", () => {
    const empty = renderPremiumCrew([], catalog, "en", "screen", 1, false);
    expect(empty).toContain("data-crew-slot");
    expect(empty).not.toContain("data-crew-sample");
    expect(empty).not.toContain("rankings");
    const built = renderPremiumCrew(crew(), catalog, "en", "screen", 1, false);
    expect(built).toContain("Suggested formation");
    expect(built).toContain("Artifacts for this crew");
    expect(built).toContain("data-crew-share");
    expect(built).not.toContain("data-crew-sample");
});

test("ranked crew limits survive replacement, removal and programmatic input", () => {
    const ids = crew();
    const afterRemoval = ids.filter((id) => id !== ids[0]);
    expect(
        premiumCrewSlots(afterRemoval, catalog).map((id, i) => (id ? catalog.units[id].level : CREW_LEVELS[i])),
    ).toEqual([1, 1, 2, 2, 3, 4]);
    expect(premiumCrewSlots(afterRemoval, catalog).filter((id) => id === undefined)).toHaveLength(1);
    const level3 = eligible
        .filter(([, item]) => item.level === 3)
        .slice(0, 2)
        .map(([id]) => Number(id));
    expect(() => premiumCrewFormation(level3, catalog)).toThrow("No free level 3 draft slot");
    expect(() => premiumCrewFormation([ids[0], ids[0]], catalog)).toThrow("distinct");
});

test("formations respect real footprints, deployment cells and collisions across draftable rosters", () => {
    for (let offset = 0; offset < 20; offset++) {
        for (const layout of ["screen", "spread"] as const) {
            for (const map of [1, 3, 4]) {
                const result = premiumCrewFormation(crew(offset), catalog, layout, map);
                expect(valid(result.input, result.positions)).toBe(true);
                expect(result.positions).toHaveLength(6);
            }
        }
    }
    const empty = premiumCrewFormation([], catalog);
    expect(empty.positions).toEqual([]);
});

test("artifact suggestions exclude items with no beneficiaries and synergy levels count the actual crew", () => {
    const ground = eligible
        .filter(([, item]) => item.kit?.role === "melee" && item.level === 1)
        .slice(0, 2)
        .map(([id]) => Number(id));
    const artifacts = premiumCrewArtifacts(ground, catalog);
    expect(artifacts.map((item) => item.tier)).toEqual([1, 2]);
    expect(
        artifacts.some((item) =>
            ["winged_boots", "quiver_of_echoes", "farsight_quiver", "hunters_longbow"].includes(item.item.slug),
        ),
    ).toBe(false);
    const life = eligible
        .filter(([, item]) => item.faction === "Life")
        .slice(0, 6)
        .map(([id]) => Number(id));
    expect(premiumCrewSynergies(life.slice(0, 1), catalog)[0].level).toBe(0);
    expect(premiumCrewSynergies(life.slice(0, 2), catalog)[0].level).toBe(1);
    expect(premiumCrewSynergies(life.slice(0, 4), catalog)[0].level).toBe(2);
    expect(premiumCrewSynergies(life, catalog)[0].level).toBe(3);
});

test("crew evidence checks access and forwards the exact roster, map and training partition", async () => {
    const ids = crew();
    let queried: unknown;
    const reader = {
        manifest: { snapshotId: "test" },
        query(input: unknown) {
            queried = input;
            return {
                snapshotId: "test",
                independentFamilies: 0,
                scoreRate: null,
                interval95: [0, 1],
                evidenceId: "test:crew",
            };
        },
    } as unknown as Pick<PremiumEvidenceSnapshot, "manifest" | "query">;
    const request = new Request(
        `http://localhost/premium/crew?snapshot=test&cohort=ranked-draft&map=3&units=${ids.join(",")}`,
    );
    expect(premiumCrewEvidenceResponse(request, { active: false }, reader).status).toBe(403);
    const response = premiumCrewEvidenceResponse(request, { active: true }, reader);
    expect(response.status).toBe(200);
    expect(queried).toEqual({
        cohort: "ranked-draft",
        map: 3,
        partition: "train",
        ownUnits: [...ids].sort((a, b) => a - b),
    });
    expect((await response.json()).score).toBeNull();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(
        premiumCrewEvidenceResponse(
            new Request("http://localhost/premium/crew?units=1,1,1,1,1,1"),
            { active: true },
            reader,
        ).status,
    ).toBe(400);
});
