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
} from "./premium-crew";
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
