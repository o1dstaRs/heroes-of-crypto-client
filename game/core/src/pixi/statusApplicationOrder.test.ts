import { expect, test } from "bun:test";
import { FightStateManager, HoCConfig, HoCConstants, TeamVals, type GameEvent } from "@heroesofcrypto/common";

import type { AuthoritativeGameSnapshot, AuthoritativeJournalEntry } from "../game_action_transport";
import { Sandbox } from "../scenes/Sandbox";
import { orderSidebarBuffs, orderSidebarDebuffs } from "../ui/LeftSideBar/effectOrder";
import { PixiScene } from "./PixiScene";
import { StatusApplicationOrder } from "./statusApplicationOrder";

type Application = Extract<GameEvent, { type: "effects_applied" }>["applications"][number];
const applied = (...applications: Application[]): GameEvent[] => [{ type: "effects_applied", applications }];
const application = (name: string, kind: Application["kind"] = "debuff", unitId = "unit"): Application => ({
    name,
    kind,
    unitId,
});
const names = (effects: { name: string }[]) => effects.map((effect) => effect.name);
const properties = () => {
    const unit = HoCConfig.getCreatureConfig(TeamVals.LEFT, "Life", "Peasant", "", 1);
    return { ...unit, id: "unit" };
};
const inspectableScene = () =>
    Object.create(PixiScene.prototype) as PixiScene & {
        rememberStatusApplications(events: readonly GameEvent[]): void;
        resetStatusApplicationOrder(): void;
    };
const entry = (sequence: number, events: GameEvent[]): AuthoritativeJournalEntry => ({
    sequence,
    actionId: String(sequence),
    playerId: "player",
    team: TeamVals.LEFT,
    actionType: 0,
    actionJson: "{}",
    eventsJson: JSON.stringify(events),
    acceptedAtMs: sequence,
});
const snapshot = (latestSequence: number, journalTail: AuthoritativeJournalEntry[], gameId = "game") =>
    ({ gameId, latestSequence, journalTail }) as AuthoritativeGameSnapshot;

test("the sidebar preserves arrival order through scene conversion and puts new short buffs before old long buffs", () => {
    const unit = properties();
    unit.applied_buffs = ["Armor Augment", "Veteran Helm", "Luck Aura", "Riot", "Spiritual Armor"];
    unit.applied_buffs_laps = [
        HoCConstants.NUMBER_OF_LAPS_TOTAL,
        HoCConstants.NUMBER_OF_LAPS_TOTAL,
        Number.MAX_SAFE_INTEGER,
        4,
        1,
    ];
    unit.applied_buffs_descriptions = [
        "Augment.",
        "Artifact. Armor.",
        "Aura.",
        "Old attack buff.;",
        "New armor buff.;",
    ];
    const before = structuredClone(unit);
    const scene = inspectableScene();
    const impact = scene.getUnitVisibleImpact(unit);
    expect(names(orderSidebarBuffs(impact.buffs))).toEqual([
        "Spiritual Armor",
        "Riot",
        "Luck Aura",
        "Veteran Helm",
        "Armor Augment",
    ]);
    expect(unit).toEqual(before);
    expect(orderSidebarBuffs(impact.buffs)[0]).toMatchObject({ description: "New armor buff.", laps: 1 });
    unit.applied_buffs_laps[3] = 3;
    expect(names(orderSidebarBuffs(scene.getUnitVisibleImpact(unit).buffs))).toEqual(
        names(orderSidebarBuffs(impact.buffs)),
    );
});

test("spell debuffs and ability effects share application chronology, including reapplications and resisted rolls", () => {
    const unit = properties();
    unit.applied_effects = ["Poison", "Stun"];
    unit.applied_effects_laps = [3, 1];
    unit.applied_effects_descriptions = ["Poisoned", "Stunned"];
    unit.applied_effects_stacks = [4, 1];
    unit.applied_debuffs = ["Gravechain", "Weakness", "Quagmire"];
    unit.applied_debuffs_laps = [HoCConstants.NUMBER_OF_LAPS_TOTAL, 5, 2];
    unit.applied_debuffs_descriptions = ["Artifact. Cursed.;", "Weak attack.;", "Slowed.;"];
    const scene = inspectableScene();
    scene.sc_selectedUnitProperties = unit;
    scene.rememberStatusApplications(
        applied(
            application("Stun", "effect"),
            application("Weakness"),
            application("Poison", "effect"),
            application("Quagmire"),
        ),
    );
    const ordered = () => orderSidebarDebuffs(scene.getUnitVisibleImpact(unit).debuffs);
    expect(names(ordered())).toEqual(["Quagmire", "Poison", "Weakness", "Stun", "Gravechain"]);
    expect(ordered()[1]).toMatchObject({ stacks: 4, description: "Poisoned", laps: 3 });
    scene.rememberStatusApplications(applied({ ...application("Weakness"), resisted: true }));
    expect(names(ordered())).toEqual(["Quagmire", "Poison", "Weakness", "Stun", "Gravechain"]);
    scene.rememberStatusApplications(applied(application("Stun", "effect")));
    expect(names(ordered())).toEqual(["Stun", "Quagmire", "Poison", "Weakness", "Gravechain"]);
    expect(names(orderSidebarDebuffs(scene.sc_visibleOverallImpact!.debuffs))).toEqual(names(ordered()));
    expect(scene.sc_unitPropertiesUpdateNeeded).toBe(true);
    unit.applied_debuffs_laps[2] = 0;
    expect(names(ordered())).toEqual(["Stun", "Poison", "Weakness", "Gravechain"]);
});

test("ranked chronology survives duplicate, overlapping, out-of-order and malformed journal tails", () => {
    const order = new StatusApplicationOrder();
    const old = entry(1, applied(application("Poison", "effect")));
    const recent = entry(2, applied(application("Weakness")));
    const future = entry(3, applied(application("Stun", "effect")));
    order.recordSnapshot(snapshot(2, [future, recent, old, recent]));
    const first = order.get("unit", "Poison", false)!;
    const second = order.get("unit", "Weakness", false)!;
    expect(second).toBeGreaterThan(first);
    expect(order.get("unit", "Stun", false)).toBeUndefined();
    order.recordSnapshot(snapshot(2, [recent, old]));
    order.recordSnapshot(snapshot(1, [old]));
    expect(order.get("unit", "Poison", false)).toBe(first);
    expect(order.get("unit", "Weakness", false)).toBe(second);
    order.recordSnapshot(
        snapshot(4, [{ ...entry(3, []), eventsJson: "broken" }, entry(4, applied(application("Stun", "effect")))]),
    );
    expect(order.get("unit", "Stun", false)).toBeGreaterThan(second);
    order.recordSnapshot(snapshot(1, [old], "other game"));
    expect(order.get("unit", "Weakness", false)).toBeUndefined();
});

test("rewinding clears future applications and different units and positive/negative statuses stay independent", () => {
    const order = new StatusApplicationOrder();
    order.record(
        applied(
            application("Helping Hand", "buff"),
            application("Helping Hand"),
            application("Poison", "effect", "other"),
        ),
    );
    expect(order.get("unit", "Helping Hand", true)).toBeLessThan(order.get("unit", "Helping Hand", false)!);
    expect(order.get("unit", "Poison", false)).toBeUndefined();
    order.clear();
    order.record(applied(application("Poison", "effect")));
    expect(order.get("unit", "Helping Hand", true)).toBeUndefined();
    expect(order.get("other", "Poison", false)).toBeUndefined();
});

test("the live sandbox records successful applications even when replay recording is suspended", () => {
    const scene = Object.assign(Object.create(Sandbox.prototype), { replayRecordingSuspended: true });
    FightStateManager.getInstance().reset();
    const engine = scene.createReplayRecordingActionEngine({
        apply: () => ({ completed: true, events: applied(application("Weakness"), application("Stun", "effect")) }),
    });
    engine.apply({ type: "end_turn", unitId: "unit" });
    const unit = properties();
    unit.applied_effects = ["Stun"];
    unit.applied_effects_laps = [1];
    unit.applied_effects_descriptions = ["Stunned"];
    unit.applied_debuffs = ["Weakness"];
    unit.applied_debuffs_laps = [5];
    unit.applied_debuffs_descriptions = ["Weak attack.;"];
    expect(names(orderSidebarDebuffs(scene.getUnitVisibleImpact(unit).debuffs))).toEqual(["Stun", "Weakness"]);
});
