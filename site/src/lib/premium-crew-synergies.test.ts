import { expect, test } from "bun:test";
import { finalizeA19Placement, buildPlacementInput } from "@heroesofcrypto/common/src/ai/placement/adapter";
import { valid } from "@heroesofcrypto/common/src/ai/placement/layout";
import { premiumCatalog } from "./premium-catalog";
import { CREW_LEVELS, premiumCrewBoardPlan, renderPremiumCrew, samplePremiumCrew } from "./premium-crew";
import {
    CREW_SYNERGY_FACTIONS,
    resolveCrewSynergies,
    normalizeCrewSynergyVariants,
    type CrewSynergyVariants,
} from "./premium-crew-synergies";
import { readPremiumCrewDraft, premiumCrewShareUrl, normalizePremiumCrewDraft } from "./premium-crew-state";
import { premiumCrewStrategyRequest } from "./premium-crew-strategy";
import type { PremiumLibrary, PremiumRow } from "./premium-library";
import type { PremiumCrewHistory } from "./premium-crew-history";

const catalog = premiumCatalog("en");
const factionCrew = (faction: string) => {
    const ids: number[] = [];
    for (const level of CREW_LEVELS)
        ids.push(
            Number(
                Object.keys(catalog.units).find(
                    (key) =>
                        catalog.units[key].faction === faction &&
                        catalog.units[key].level === level &&
                        catalog.units[key].kit?.amount &&
                        !ids.includes(Number(key)),
                ),
            ),
        );
    return ids;
};
const nature = factionCrew("Nature"),
    life = factionCrew("Life");
const row = (variant: number, level: number, score: number, families: number, lower: number): PremiumRow => ({
    key: `4:${variant}:${level}`,
    ids: [4, variant, level],
    score,
    families,
    observations: families,
    interval: [lower, Math.min(1, score + 0.1)],
    frequency: 0.1,
});
const library: PremiumLibrary = {
    scope: { cohort: "ranked-draft" },
    families: 1000,
    armies: 2000,
    maps: [],
    pairs: [],
    triples: [],
    artifactsTier1: [],
    artifactsTier2: [],
    plans: [],
    doctrines: [],
    units: [],
    synergies: [row(1, 3, 0.6, 80, 0.45), row(2, 3, 0.7, 120, 0.55), row(1, 1, 0.99, 500, 0.9)],
};
const selected: CrewSynergyVariants = { Life: 1, Nature: 1, Chaos: 1, Might: 1 };

test("recommended variants compare the current activation level and actual supported rows; manual choices remain selected", () => {
    const automatic = resolveCrewSynergies(life, catalog, {}, library).find((item) => item.faction === "Life")!;
    expect(automatic.level).toBe(3);
    expect(automatic.variant).toBe(2);
    expect(automatic.recommendedVariant).toBe(2);
    const manual = resolveCrewSynergies(life, catalog, { Life: 1 }, library).find((item) => item.faction === "Life")!;
    expect(manual.variant).toBe(1);
    expect(manual.recommendedVariant).toBe(2);
    expect(
        resolveCrewSynergies(life, catalog, {}, { ...library, synergies: [row(2, 3, 0.99, 49, 0.9)] }).find(
            (item) => item.faction === "Life",
        )!.recommendedVariant,
    ).toBeUndefined();
});

test("a selected match variant applies to both armies at their distinct-creature activation levels", () => {
    const plan = premiumCrewBoardPlan(
        nature,
        life,
        catalog,
        "screen",
        1,
        finalizeA19Placement,
        undefined,
        undefined,
        [],
        selected,
    );
    for (const faction of CREW_SYNERGY_FACTIONS)
        expect(plan.synergies.find((item) => item.faction === faction)!.variant).toBe(
            plan.enemySynergies.find((item) => item.faction === faction)!.variant,
        );
    expect(plan.synergies.find((item) => item.faction === "Nature")!.level).toBe(3);
    expect(plan.enemySynergies.find((item) => item.faction === "Nature")!.level).toBe(0);
    expect(plan.own.effects.extraStacks).toBe(4);
    expect(plan.enemy.effects.supply).toBe(19);
    expect(new Set(plan.own.input.bodies.map((body) => body.creature)).size).toBe(6);
});

test("sparse co-play recommendations broaden by support coverage and disclose their population", () => {
    const history = {
        synergies: { contextUnits: [life[0]], rows: [row(1, 3, 0.99, 20, 0.8), row(2, 3, 0.99, 30, 0.8)] },
    } as unknown as PremiumCrewHistory;
    const option = resolveCrewSynergies(life, catalog, {}, library, history).find((item) => item.faction === "Life")!;
    expect(option.recommendedVariant).toBe(2);
    expect(option.contextUnits).toEqual([]);
    expect(option.rows.map((item) => item.families)).toEqual([80, 120]);
});

test("Nature adds native AI split stacks and reruns the actual final planner legally on every map", () => {
    let accepted = 0;
    const planner: typeof finalizeA19Placement = (units, context, incumbent) => {
        expect(buildPlacementInput(units, context)).toBeDefined();
        accepted++;
        return finalizeA19Placement(units, context, incumbent);
    };
    for (const map of [1, 3, 4])
        for (const layout of ["screen", "spread"] as const) {
            const split = premiumCrewBoardPlan(
                nature,
                life,
                catalog,
                layout,
                map,
                planner,
                undefined,
                undefined,
                [],
                selected,
            );
            const unsplit = premiumCrewBoardPlan(
                nature,
                life,
                catalog,
                layout,
                map,
                planner,
                undefined,
                undefined,
                [],
                { ...selected, Nature: 2 },
            );
            expect(split.own.input.bodies.length).toBeGreaterThan(6);
            expect(split.own.input.bodies.length).toBeLessThanOrEqual(split.own.capacity);
            expect(unsplit.own.input.bodies).toHaveLength(6);
            expect(split.own.positions).not.toEqual(unsplit.own.positions);
            for (const formation of [split.own, split.enemy, unsplit.own, unsplit.enemy])
                expect(valid(formation.input, formation.positions)).toBe(true);
            for (const id of nature)
                expect(
                    split.own.input.bodies
                        .filter((body) => body.creature === id)
                        .reduce((sum, body) => sum + body.amount, 0),
                ).toBe(catalog.units[id].kit!.amount);
            expect(split.synergies.find((item) => item.faction === "Nature")!.count).toBe(6);
        }
    expect(accepted).toBe(24);
});

test("Supply changes displayed counts without compounding or corrupting the placement model's roster totals", () => {
    const before = JSON.stringify(catalog);
    const supply = premiumCrewBoardPlan(
        life,
        nature,
        catalog,
        "screen",
        1,
        finalizeA19Placement,
        undefined,
        undefined,
        [],
        selected,
    );
    const morale = premiumCrewBoardPlan(
        life,
        nature,
        catalog,
        "screen",
        1,
        finalizeA19Placement,
        undefined,
        undefined,
        [],
        { ...selected, Life: 2 },
    );
    expect(supply.own.effects.supply).toBe(19);
    expect(morale.own.effects.supply).toBe(0);
    expect(morale.own.effects.morale).toBe(20);
    supply.own.input.bodies.forEach((body, index) => {
        expect(body.amount).toBe(catalog.units[body.creature].kit!.amount);
        expect(supply.own.displayBodies[index].amount).toBe(Math.floor(body.amount * 1.19));
        expect(morale.own.displayBodies[index].amount).toBe(body.amount);
    });
    expect(
        premiumCrewBoardPlan(
            life,
            nature,
            catalog,
            "screen",
            1,
            finalizeA19Placement,
            undefined,
            undefined,
            [],
            selected,
        ).own.displayBodies,
    ).toEqual(supply.own.displayBodies);
    expect(JSON.stringify(catalog)).toBe(before);
});

test("all draftable creatures can pass through native split planning without lost or duplicated creatures", () => {
    const fairy = Number(Object.keys(catalog.units).find((id) => catalog.units[id].name === "Fairy"));
    const tiger = Number(Object.keys(catalog.units).find((id) => catalog.units[id].name === "White Tiger"));
    for (const [key] of Object.entries(catalog.units).filter(([, item]) => item.kit?.amount)) {
        const ids = samplePremiumCrew(null, catalog, [Number(key), fairy, tiger]);
        const plan = premiumCrewBoardPlan(ids, [], catalog, "screen", 1, undefined, undefined, undefined, [], selected);
        expect(valid(plan.own.input, plan.own.positions)).toBe(true);
        expect(plan.own.input.bodies.length).toBeLessThanOrEqual(plan.own.capacity);
        for (const id of ids)
            expect(
                plan.own.input.bodies.filter((body) => body.creature === id).reduce((n, body) => n + body.amount, 0),
            ).toBe(catalog.units[id].kit!.amount);
        expect(plan.own.input.bodies.some((body) => body.creature === Number(key))).toBe(true);
    }
});

test("selected synergies persist and share while rejecting invalid variants and unknown factions", () => {
    const draft = {
        version: 1 as const,
        ids: nature,
        layout: "screen" as const,
        battlefield: "3" as const,
        synergyVariants: selected,
    };
    const page = new URL("https://heroesofcrypto.io/premium/?token=private");
    expect(readPremiumCrewDraft(new URL(premiumCrewShareUrl(page, draft)), null, catalog)).toEqual(draft);
    expect(readPremiumCrewDraft(page, JSON.stringify(draft), catalog)).toEqual(draft);
    expect(normalizeCrewSynergyVariants({ Life: 2, Nature: 99, Chaos: "1", Might: null, fake: 1 })).toEqual({
        Life: 2,
    });
    expect(
        normalizePremiumCrewDraft({ ...draft, synergyVariants: { Life: 0, Nature: 4 } }, catalog).synergyVariants,
    ).toBeUndefined();
});

test("automatic strategy uses exact variants, powers and all displayed split stacks, with bounded unique roster names", () => {
    const a = premiumCrewBoardPlan(
        nature,
        life,
        catalog,
        "screen",
        1,
        finalizeA19Placement,
        undefined,
        undefined,
        [],
        selected,
    );
    const b = premiumCrewBoardPlan(nature, life, catalog, "screen", 1, finalizeA19Placement, undefined, undefined, [], {
        ...selected,
        Nature: 2,
    });
    const req = premiumCrewStrategyRequest(a, catalog, "en")!;
    expect(req.key).not.toBe(premiumCrewStrategyRequest(b, catalog, "en")!.key);
    expect(req.body.question.length).toBeLessThanOrEqual(600);
    expect(req.body.history.every((entry) => entry.content.length <= 2000)).toBe(true);
    expect(req.body.history.map((entry) => entry.content).join("")).toContain('"extraStacks":4');
    expect(req.body.history.map((entry) => entry.content).join("")).toContain('"variant":1');
    expect(req.body.history.map((entry) => entry.content).join("")).toContain(
        "Selected faction variants apply to both armies",
    );
});

test("the board renders every native split with quantities, and selectable match bonuses show real recommendations", () => {
    const plan = premiumCrewBoardPlan(
        life,
        nature,
        catalog,
        "screen",
        1,
        finalizeA19Placement,
        library,
        undefined,
        [],
        selected,
    );
    const html = renderPremiumCrew(
        life,
        catalog,
        "en",
        "screen",
        1,
        true,
        library,
        undefined,
        nature,
        finalizeA19Placement,
        plan,
    );
    expect(html.match(/data-crew-synergy="/g)).toHaveLength(8);
    expect(html).toContain("Recommended");
    expect(html).toContain("70.0% · n=120");
    expect(html).toContain("Applies to both armies");
    expect(html.match(/data-crew-enemy="/g)).toHaveLength(plan.enemy.input.bodies.length);
    expect(html).toContain("AI split stack");
    expect(html).toContain("Board stack:");
});
