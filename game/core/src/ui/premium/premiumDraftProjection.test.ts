import { expect, test } from "bun:test";
import { Artifact, CreatureLevelList, CreatureVals, GridVals, synergyVariantsForSeed } from "@heroesofcrypto/common";
import { cells } from "../../../../heroes-of-crypto-common/src/ai/placement/layout";
import type { PremiumDraftState } from "./premiumDraftAssessment";
import { clampDraftPanel, projectPremiumDraft } from "./premiumDraftProjection";

const state = (extra: Partial<PremiumDraftState> = {}): PremiumDraftState => ({
    gameId: "projected-draft",
    picked: [],
    opponentPicked: [],
    artifactTier1: 0,
    artifactTier2: 0,
    isYourTurn: true,
    ...extra,
});
const own = [
    CreatureVals.PEASANT,
    CreatureVals.ORC,
    CreatureVals.ELF,
    CreatureVals.HARPY,
    CreatureVals.HEALER,
    CreatureVals.HYDRA,
];
const enemy = [
    CreatureVals.SCAVENGER,
    CreatureVals.FAIRY,
    CreatureVals.BLACKSMITH,
    CreatureVals.TROGLODYTE,
    CreatureVals.CYCLOPS,
    CreatureVals.BLACK_DRAGON,
];

test("AI preview fits partial and full armies without overlap, with their actual footprints", () => {
    for (let n = 0; n <= 6; n++) {
        const plan = projectPremiumDraft(state({ picked: own.slice(0, n), opponentPicked: enemy.slice(0, n) }));
        expect(plan.own).toHaveLength(n);
        expect(plan.enemy).toHaveLength(n);
        for (const [army, left] of [
            [plan.own, true],
            [plan.enemy, false],
        ] as const) {
            const occupied = new Set<string>();
            for (const body of army)
                for (const p of cells(body, body.position)) {
                    expect(p.x).toBeGreaterThanOrEqual(left ? 1 : 12);
                    expect(p.x).toBeLessThanOrEqual(left ? 3 : 14);
                    expect(p.y).toBeGreaterThanOrEqual(1);
                    expect(p.y).toBeLessThanOrEqual(14);
                    const key = `${p.x}:${p.y}`;
                    expect(occupied.has(key)).toBe(false);
                    occupied.add(key);
                }
        }
    }
});

test("all level-correct rosters keep large bodies in bounds", () => {
    for (let i = 0; i < 16; i++) {
        const ids = [1, 1, 2, 2, 3, 4].map((level, slot) => {
            const pool = CreatureLevelList[level];
            return pool[(i + slot) % pool.length];
        });
        const plan = projectPremiumDraft(state({ picked: ids }));
        // A Nature extra-stack slot can add split stacks; every picked creature still appears.
        expect(new Set(plan.own.map((u) => u.creature)).size).toBe(new Set(ids).size);
        expect(plan.own.filter((u) => !u.split)).toHaveLength(new Set(ids).size);
    }
});

test("projection only contains revealed picks and never fills hidden enemy slots", () => {
    const draft = state({
        picked: [0, CreatureVals.ORC, CreatureVals.ORC, -1, 999999],
        opponentPicked: [0, CreatureVals.FAIRY, 0, 0, 0, 0],
    });
    const before = JSON.stringify(draft);
    const plan = projectPremiumDraft(draft);
    expect(plan.own.map((u) => u.creature)).toEqual([CreatureVals.ORC]);
    expect(plan.enemy.map((u) => u.creature)).toEqual([CreatureVals.FAIRY]);
    expect(plan.hiddenEnemy).toBe(5);
    expect(plan.steps.flatMap((s) => s.unitIds)).not.toContain(CreatureVals.BLACK_DRAGON);
    expect(JSON.stringify(draft)).toBe(before);
    expect(plan).toEqual(projectPremiumDraft(draft));
});

test("new confirmed picks update the formation, strategic roles and visible enemy threats", () => {
    const initial = projectPremiumDraft(state({ picked: [CreatureVals.PEASANT] }));
    const next = projectPremiumDraft(
        state({ picked: [CreatureVals.PEASANT, CreatureVals.ELF], opponentPicked: [CreatureVals.CYCLOPS] }),
    );
    expect(initial.steps.map((s) => s.title)).not.toContain("Protect your damage");
    expect(next.steps.map((s) => s.title)).toContain("Protect your damage");
    expect(next.steps.find((s) => s.title === "Revealed threats")?.text).toContain("Cyclops");
    expect(next.arrows.some((a) => a.creature === CreatureVals.PEASANT)).toBe(true);
    expect(next.arrows.every((a) => next.own.some((u) => u.creature === a.creature))).toBe(true);
});

test("shared synergy variants stay locked to the match; enemy progress is a revealed lower bound", () => {
    const draft = state({ picked: [CreatureVals.PEASANT, CreatureVals.ELF], opponentPicked: [CreatureVals.FAIRY] });
    const plan = projectPremiumDraft(draft);
    for (const s of plan.synergies) expect(s.variant).toBe(synergyVariantsForSeed(draft.gameId!)[s.faction]);
    expect(plan.synergies.find((s) => s.faction === "Nature")?.enemyCount).toBe(1);
    expect(projectPremiumDraft({ ...draft, gameId: undefined }).synergies.every((s) => s.variant === undefined)).toBe(
        true,
    );
});

test("only revealed terrain and selected artifacts enter the projection", () => {
    expect(projectPremiumDraft(state()).map).toBeUndefined();
    const plan = projectPremiumDraft(
        state({
            picked: own,
            artifactTier1: Artifact.TIER1_ARTIFACT_LIST[0].id,
            scouting: { map: GridVals.LAVA_CENTER, bannedCreatureIds: [], knownBanLevels: [], remainingPickLevels: [] },
        }),
    );
    expect(plan.map).toBe(GridVals.LAVA_CENTER);
    expect(plan.artifacts).toHaveLength(1);
    expect(plan.artifacts[0].tier).toBe(1);
    expect(plan.arrows.filter((a) => a.kind === "advance").every((a) => a.to.y < 6 || a.to.y > 10)).toBe(true);
});

test("Premium's planned Placement upgrade widens your zone, and the formation is placed in the wider zone", () => {
    const melee = [CreatureVals.PEASANT, CreatureVals.ORC, CreatureVals.HARPY];
    const base = projectPremiumDraft(state({ picked: melee }));
    const planned = projectPremiumDraft(state({ picked: melee }), [
        { kind: "Placement", value: 2 },
        { kind: "Movement", value: 2 },
        { kind: "Armor", value: 0 },
    ]);
    expect(base.placementLevel).toBe(0);
    expect(base.upgradeSource).toBeUndefined();
    expect(planned.placementLevel).toBe(2);
    expect(planned.upgradeSource).toBe("planned");
    // A zero level is not an upgrade.
    expect(planned.upgrades).toEqual([
        { kind: "Placement", value: 2 },
        { kind: "Movement", value: 2 },
    ]);
    expect(Math.max(...base.zones.own.map((c) => c.x))).toBe(3);
    expect(Math.max(...planned.zones.own.map((c) => c.x))).toBe(5);
    expect(planned.zones.ownBase).toEqual(base.zones.own);
    // The enemy's upgrades are private: its zone stays at the base depth.
    expect(planned.zones.enemy).toEqual(base.zones.enemy);
    const legal = new Set(planned.zones.own.map((c) => `${c.x}:${c.y}`));
    for (const body of planned.own)
        for (const p of cells(body, body.position)) expect(legal.has(`${p.x}:${p.y}`)).toBe(true);
    // Front-line stacks step forward into the columns the upgrade adds.
    expect(Math.max(...planned.own.flatMap((body) => cells(body, body.position).map((p) => p.x)))).toBeGreaterThan(3);
});

test("once the player spends a Setup point, their own upgrades replace Premium's plan on the board", () => {
    const zero = ["Placement", "Armor", "Might", "Empower", "Sniper", "Movement"].map((kind) => ({ kind, value: 0 }));
    const plan = [{ kind: "Placement", value: 3 }];
    const untouched = projectPremiumDraft(
        state({ picked: own, setup: { placement: 0, augments: zero, amounts: {} } }),
        plan,
    );
    expect(untouched.upgradeSource).toBe("planned");
    expect(untouched.placementLevel).toBe(3);
    const chosen = projectPremiumDraft(
        state({
            picked: own,
            setup: {
                placement: 1,
                augments: zero.map((a) => (a.kind === "Placement" ? { ...a, value: 1 } : a)),
                amounts: {},
            },
        }),
        plan,
    );
    expect(chosen.upgradeSource).toBe("selected");
    expect(chosen.placementLevel).toBe(1);
    expect(chosen.upgrades).toEqual([{ kind: "Placement", value: 1 }]);
});

test.each([
    { width: 1440, height: 900 },
    { width: 390, height: 740 },
    { width: 280, height: 240 },
])("saved/resized window keeps every control reachable in %j", (viewport) => {
    const result = clampDraftPanel({ x: 2000, y: 1500, width: 900, height: 900 }, viewport);
    expect(result.x).toBeGreaterThanOrEqual(0);
    expect(result.y).toBeGreaterThanOrEqual(0);
    expect(result.x + result.width).toBeLessThanOrEqual(viewport.width);
    expect(result.y + result.height).toBeLessThanOrEqual(viewport.height);
});
