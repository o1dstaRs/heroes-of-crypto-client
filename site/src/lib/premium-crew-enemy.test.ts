import { expect, test } from "bun:test";
import { buildPlacementInput, finalizeA19Placement } from "@heroesofcrypto/common/src/ai/placement/adapter";
import { cells, valid } from "@heroesofcrypto/common/src/ai/placement/layout";
import { premiumCatalog } from "./premium-catalog";
import {
    CREW_LEVELS,
    premiumCrewFormation,
    randomPremiumEnemy,
    renderPremiumCrew,
    samplePremiumCrew,
} from "./premium-crew";
import { normalizePremiumCrewDraft, premiumCrewShareUrl, readPremiumCrewDraft } from "./premium-crew-state";

const catalog = premiumCatalog("en");
const own = samplePremiumCrew(null, catalog);

test("random enemies obey draft quotas, exclude our picks and never mutate the roster", () => {
    const before = JSON.stringify(catalog);
    for (const roll of [0, 0.25, 0.5, 0.75, 0.999999]) {
        const enemy = randomPremiumEnemy(own, catalog, () => roll);
        expect(enemy).toHaveLength(6);
        expect(new Set([...own, ...enemy]).size).toBe(12);
        expect(enemy.map((id) => catalog.units[id].level)).toEqual([...CREW_LEVELS]);
        expect(enemy.every((id) => !!catalog.units[id].kit?.amount)).toBe(true);
    }
    expect(JSON.stringify(catalog)).toBe(before);
    expect(randomPremiumEnemy(Object.keys(catalog.units).map(Number), catalog)).toEqual([]);
});

test("editing our crew replaces only the conflicting enemy pick and keeps the rest stable", () => {
    const enemy = randomPremiumEnemy(own, catalog, () => 0);
    expect(randomPremiumEnemy(own, catalog, () => 0.9, enemy)).toEqual(enemy);
    for (let index = 0; index < 6; index++) {
        const changedOwn = [...own];
        changedOwn[index] = enemy[index];
        const repaired = randomPremiumEnemy(changedOwn, catalog, () => 0.9, enemy);
        expect(repaired).toHaveLength(6);
        expect(repaired[index]).not.toBe(enemy[index]);
        expect(repaired.filter((_, i) => i !== index)).toEqual(enemy.filter((_, i) => i !== index));
        expect(new Set([...changedOwn, ...repaired]).size).toBe(12);
    }
});

test("both armies have valid nonoverlapping footprints on all supported battlefields and layouts", () => {
    for (const map of [1, 3, 4]) {
        for (const layout of ["screen", "spread"] as const) {
            const enemy = randomPremiumEnemy(own, catalog, () => 0.9999);
            const left = premiumCrewFormation(own, catalog, layout, map, enemy, true, finalizeA19Placement);
            const right = premiumCrewFormation(enemy, catalog, "screen", map, own, false, finalizeA19Placement);
            const occupied = new Set<number>();
            for (const formation of [left, right]) {
                expect(formation.planned).toBe(true);
                expect(valid(formation.input, formation.positions)).toBe(true);
                formation.input.bodies.forEach((body, i) => {
                    for (const p of cells(body, formation.positions[i])) {
                        const key = p.x * 16 + p.y;
                        expect(occupied.has(key)).toBe(false);
                        occupied.add(key);
                        expect(formation.input.left ? p.x >= 1 && p.x <= 3 : p.x >= 12 && p.x <= 14).toBe(true);
                    }
                });
            }
        }
    }
});

test("the shipped AI accepts the preview setup and changes our formation for a different enemy", () => {
    const enemy = randomPremiumEnemy(own, catalog, () => 0);
    const result = premiumCrewFormation(own, catalog, "screen", 1, enemy, true, finalizeA19Placement);
    const input = result.input;
    const accepted = buildPlacementInput(
        input.bodies.map((b) => ({
            getId: () => b.id,
            getName: () => b.name,
            getAmountAlive: () => b.amount,
            getFootprintWidth: () => b.width,
            getFootprintHeight: () => b.height,
        })),
        {
            team: 2,
            gridType: 1,
            sideOrientedPlacement: true,
            legalCellHashes: new Set(input.legal),
            publicOpponentCreatureIds: enemy,
            artifacts: [1, 1],
            doctrine: input.doctrine,
            augments: input.augments,
        },
    );
    expect(accepted).toBeDefined();
    expect(accepted!.enemyIds).toEqual([...enemy].sort((a, b) => a - b));
    expect(accepted!.enemyKits.some((kit) => kit.length > 0)).toBe(true);
    const other = premiumCrewFormation(
        own,
        catalog,
        "screen",
        1,
        randomPremiumEnemy(own, catalog, () => 0.2),
        true,
        finalizeA19Placement,
    );
    expect(other.positions).not.toEqual(result.positions);
    expect(premiumCrewFormation(own.slice(0, 5), catalog, "screen", 1, enemy, true, finalizeA19Placement).planned).toBe(
        false,
    );
});

test("enemy picks persist and share safely; malformed, overlapping and over-quota enemies are dropped", () => {
    const enemyIds = randomPremiumEnemy(own, catalog, () => 0.4);
    const draft = { version: 1 as const, ids: own, layout: "spread" as const, battlefield: "4" as const, enemyIds };
    const page = new URL("https://heroesofcrypto.io/premium/?token=private");
    expect(readPremiumCrewDraft(page, JSON.stringify(draft), catalog)).toEqual(draft);
    const shared = new URL(premiumCrewShareUrl(page, draft));
    expect(readPremiumCrewDraft(shared, null, catalog)).toEqual(draft);
    expect(shared.searchParams.has("token")).toBe(false);
    for (const bad of [own, enemyIds.slice(0, 5), Array(6).fill(enemyIds[0]), [...enemyIds.slice(0, 5), 999999]])
        expect(normalizePremiumCrewDraft({ ...draft, enemyIds: bad }, catalog).enemyIds).toBeUndefined();
});

test("the board exposes the randomizer and enemy hovers without treating enemy tokens as our crew slots", () => {
    const enemy = randomPremiumEnemy(own, catalog, () => 0);
    const html = renderPremiumCrew(
        own,
        catalog,
        "en",
        "screen",
        1,
        false,
        null,
        undefined,
        enemy,
        finalizeA19Placement,
    );
    const tokens = html.match(/<button[^>]*data-crew-enemy[^>]*>/g)!;
    expect(tokens).toHaveLength(6);
    for (const token of tokens) {
        expect(token).toContain("data-knowledge-reference");
        expect(token).not.toContain("data-crew-slot");
    }
    expect(html).toContain("Game AI formation");
    expect(html).toContain("data-crew-randomize");
    expect(html).toContain("not odds against this opponent");
    expect(renderPremiumCrew([], catalog, "en", "screen", 1)).toContain("data-crew-randomize");
});
