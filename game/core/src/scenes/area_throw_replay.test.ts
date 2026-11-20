import { describe, expect, mock, test } from "bun:test";
import { GridSettings, type GameEvent } from "@heroesofcrypto/common";

import { Sandbox } from "./Sandbox";
import { FIGHT_EVENT_VFX } from "./testSupport/fightVfxCatalog";

/**
 * The area throw was the LAST replay path still driving its visuals off a local engine re-run instead of
 * the recorded event. That cost two things:
 *
 *   - damage is `getRandomInt(min, max)` plus luck/crit rolls, so each client re-rolled its own numbers.
 *     The figures on screen were not the damage the server dealt and the two players disagreed.
 *   - a re-apply the engine REJECTS — `unit_already_acted` once a snapshot has synced the actor,
 *     `fight_finished`, spent shots — returned early and swallowed the whole action: no numbers, no
 *     deaths, and none of the events riding along with it (turn advance, lap flip, Armageddon, narrowing).
 *
 * AreaThrowImpactTiming.test.ts plays the recorded damage waves and the rejected-but-recorded exit; this
 * file covers the record's hand-off and the exit that has no recorded area event to draw.
 */
const gs = new GridSettings(16, 2048, 0, 1024, -1024, 5, 0.06);

const thrower = {
    getId: () => "giant",
    getName: () => "Gargantuan",
    hasAbilityActive: (name: string) => name === "Area Throw",
    getRangedProjectileOrigin: () => ({ x: 0, y: 0 }),
    getCumulativeHp: () => 100,
    getAmountAlive: () => 10,
};

const recordWith = (events: GameEvent[]) => ({
    sequence: 1,
    clientTimeMs: 0,
    action: { type: "area_throw_attack" as const, attackerId: "giant", targetCell: { x: 4, y: 5 } },
    events,
    stateAfter: { units: [], gridType: 0, currentLap: 1, fightStarted: true, fightFinished: false },
});

const sceneWith = (overrides: Record<string, unknown> = {}) =>
    Object.assign(Object.create(Sandbox.prototype), {
        sc_sceneSettings: { getGridSettings: () => gs },
        unitsHolder: { getAllUnits: () => new Map([["giant", thrower]]) },
        shouldDeferActionToAuthoritativeReplay: () => false,
        getAreaThrowImpactCell: (_unit: unknown, cell: unknown) => cell,
        snapshotRenderableUnits: () => new Map(),
        reportRefusedLocalAction: () => {},
        createActionEngine: () => ({ apply: () => ({ completed: false, events: [] }) }),
        applyReplayEvents: mock(() => {}),
        ...overrides,
    });

describe("area throw replay reads the authoritative record", () => {
    test("an area-throw replay hands down the whole record, not just the action", async () => {
        const performAreaThrow = mock(async () => {});
        const scene = sceneWith({ performAreaThrow });
        const record = recordWith([]);

        expect(await scene.playReplayAreaThrowAction(record)).toBe(true);

        expect(performAreaThrow).toHaveBeenCalledTimes(1);
        const [unit, cell, , handedDown] = performAreaThrow.mock.calls[0] as unknown[];
        expect(unit).toBe(thrower);
        expect(cell).toEqual(record.action.targetCell);
        // Without the record there is nothing authoritative to read — this is the wiring that broke.
        expect(handedDown).toBe(record);
    });

    test("the recorded area_attacked wins over the local re-run's re-rolled one", async () => {
        const areaEvent = (amount: number) =>
            ({
                type: "area_attacked",
                attackerId: "giant",
                targetCell: { x: 4, y: 5 },
                targetPosition: { x: 0, y: 0 },
                unitIdsDied: [],
                damage: { amount, splash: [] },
                animations: [],
            }) as unknown as GameEvent;
        const recorded = areaEvent(30);
        const rerolled = areaEvent(12);
        const stop = new Error("first presented area event captured");
        const presented: GameEvent[] = [];
        const scene = sceneWith({
            createActionEngine: () => ({ apply: () => ({ completed: true, events: [rerolled] }) }),
            noteDeathBlowsFromAttackEvent: (event: GameEvent) => {
                presented.push(event);
                throw stop;
            },
        });

        await expect(
            scene.performAreaThrow(thrower, { x: 4, y: 5 }, { x: 0, y: 0 }, recordWith([recorded])),
        ).rejects.toBe(stop);
        expect(presented).toEqual([recorded]);
        expect(presented[0]).toBe(recorded);
    });

    test("a rejected re-apply with no recorded area event still lands the recorded events", async () => {
        const turn: GameEvent = { type: "turn_ended", unitId: "giant" } as unknown as GameEvent;
        const record = recordWith([turn]);
        const replay = sceneWith();
        await replay.performAreaThrow(thrower, record.action.targetCell, { x: 0, y: 0 }, record);
        expect(replay.applyReplayEvents).toHaveBeenCalledWith(record.events);

        // A live sandbox throw has no record: a refusal there changes nothing.
        const live = sceneWith();
        await live.performAreaThrow(thrower, record.action.targetCell, { x: 0, y: 0 });
        expect(live.applyReplayEvents).not.toHaveBeenCalled();
    });

    test("area_attacked is still classified as a replay-routed event", () => {
        // If this ever flips to snapshot-diff/none the wiring above is moot — the catalog is the contract.
        expect(FIGHT_EVENT_VFX.area_attacked.ranked).toBe("replay");
    });
});
