import { expect, test } from "bun:test";
import { valid } from "@heroesofcrypto/common/src/ai/placement/layout";
import { premiumCatalog } from "./premium-catalog";
import { premiumCrewFormation, premiumCrewZoneDepth, renderPremiumCrew, samplePremiumCrew } from "./premium-crew";
import { normalizePremiumCrewDraft, premiumCrewShareUrl, readPremiumCrewDraft } from "./premium-crew-state";
import {
    CREW_UPGRADE_BUDGET,
    DEFAULT_CREW_UPGRADES,
    normalizeCrewUpgrades,
    renderCrewUpgrades,
    setCrewUpgradeLevel,
} from "./premium-crew-upgrades";

const catalog = premiumCatalog("en");
const rush = [
    { kind: "Placement" as const, value: 2 },
    { kind: "Armor" as const, value: 2 },
    { kind: "Sniper" as const, value: 1 },
    { kind: "Movement" as const, value: 2 },
];

test("upgrade plans stay within caps and the Battle Trance budget, in canonical order", () => {
    expect(
        normalizeCrewUpgrades([
            { kind: "Sniper", value: 1 },
            { kind: "Armor", value: 3 },
            { kind: "Might", value: 0 },
        ]),
    ).toEqual([
        { kind: "Armor", value: 3 },
        { kind: "Sniper", value: 1 },
    ]);
    for (const bad of [
        [{ kind: "Placement", value: 3 }],
        [
            { kind: "Armor", value: 3 },
            { kind: "Armor", value: 1 },
        ],
        [{ kind: "Luck", value: 1 }],
        [{ kind: "Armor", value: 1.5 }],
        [
            { kind: "Armor", value: 3 },
            { kind: "Might", value: 3 },
            { kind: "Sniper", value: 2 },
        ],
        "Armor",
    ])
        expect(normalizeCrewUpgrades(bad)).toBeUndefined();
    // Raising past the budget is refused; lowering always works.
    expect(setCrewUpgradeLevel(DEFAULT_CREW_UPGRADES, "Movement", 1)).toBeUndefined();
    expect(setCrewUpgradeLevel(DEFAULT_CREW_UPGRADES, "Might", 2)).toEqual([
        { kind: "Armor", value: 3 },
        { kind: "Might", value: 2 },
        { kind: "Sniper", value: 1 },
    ]);
    expect(CREW_UPGRADE_BUDGET).toBe(7);
});

test("a planned Placement upgrade deepens the crew's zone and the board draws it", () => {
    const ids = samplePremiumCrew(null, catalog);
    const base = premiumCrewFormation(ids, catalog);
    const deep = premiumCrewFormation(ids, catalog, "auto", 1, [], true, undefined, [1, 1], [], rush);
    expect(deep.input.augments).toEqual(rush);
    expect(deep.input.legal.length).toBeGreaterThan(base.input.legal.length);
    const columns = (legal: readonly number[]) => [...new Set(legal.map((key) => key >> 4))].sort((a, b) => a - b);
    // The game's depths: 3 columns (B-D), 4 with Placement 1 (B-E), 6 with Placement 2, which opens the edge column A.
    expect(columns(base.input.legal)).toEqual([1, 2, 3]);
    expect(columns(deep.input.legal)).toEqual([0, 1, 2, 3, 4, 5]);
    const one = premiumCrewFormation(
        ids,
        catalog,
        "auto",
        1,
        [],
        true,
        undefined,
        [1, 1],
        [],
        [{ kind: "Placement", value: 1 }],
    );
    expect(columns(one.input.legal)).toEqual([1, 2, 3, 4]);
    expect([0, 1, 2].map(premiumCrewZoneDepth)).toEqual([3, 4, 6]);
    expect(valid(deep.input, deep.positions)).toBe(true);
    const zone = (html: string) => html.match(/class="crew-zone"/g)?.length ?? 0;
    expect(zone(renderPremiumCrew(ids, catalog, "en", "auto", 1, false))).toBe(base.input.legal.length);
});

test("the upgrades section shows the AI's plan, marks it when the player deviates and refuses nothing silently", () => {
    const auto = renderCrewUpgrades(rush, rush, true, "ready", "en");
    expect(auto).toContain("AI plan ✓");
    expect(auto).toContain("7 / 7 points");
    expect(auto.match(/data-crew-upgrade="Placement"/g)).toHaveLength(2);
    expect(auto.match(/data-crew-upgrade="Armor"/g)).toHaveLength(3);
    expect(auto).not.toContain('class="ai"');
    const manual = renderCrewUpgrades(DEFAULT_CREW_UPGRADES, rush, false, "ready", "en");
    expect(manual).toContain("Use the AI plan");
    expect(manual).toContain("The ring marks the AI's level");
    expect(manual).toContain('data-crew-upgrade="Placement" data-crew-upgrade-level="2" class="ai"');
    expect(renderCrewUpgrades(DEFAULT_CREW_UPGRADES, undefined, true, "unavailable", "en")).toContain(
        "The AI's plan is unavailable right now",
    );
});

test("a changed upgrade plan survives storage and shared links; the AI plan is never stored", () => {
    const ids = samplePremiumCrew(null, catalog);
    const draft = normalizePremiumCrewDraft(
        { version: 1, ids, layout: "auto", battlefield: "all", upgrades: rush, upgradesAutomatic: false },
        catalog,
    );
    expect(draft.upgrades).toEqual(rush);
    const link = new URL(premiumCrewShareUrl(new URL("https://example.test/premium"), draft));
    expect(link.searchParams.get("upgrades")).toBe("2,2,0,1,2,0");
    const shared = readPremiumCrewDraft(link, null, catalog);
    expect(shared.upgrades).toEqual(rush);
    expect(shared.upgradesAutomatic).toBe(false);
    const automatic = normalizePremiumCrewDraft(
        { version: 1, ids, layout: "auto", battlefield: "all", upgradesAutomatic: true },
        catalog,
    );
    expect(
        new URL(premiumCrewShareUrl(new URL("https://example.test/premium"), automatic)).searchParams.has("upgrades"),
    ).toBe(false);
    expect(
        normalizePremiumCrewDraft(
            { version: 1, ids, layout: "auto", battlefield: "all", upgrades: [{ kind: "Armor", value: 9 }] },
            catalog,
        ).upgrades,
    ).toBeUndefined();
});
