import { describe, expect, mock, test } from "bun:test";

import { TeamVals, type GameEvent, type UnitProperties } from "@heroesofcrypto/common";

import { Sandbox, getMissingReplaySummons, type SandboxSceneUnitState } from "./Sandbox";

type SummonEvent = Extract<GameEvent, { type: "unit_summoned" }>;

const unitState = (id: string, dead = false): SandboxSceneUnitState => ({
    properties: { id } as UnitProperties,
    team: TeamVals.LEFT,
    placed: true,
    dead,
    cells: [{ x: 3, y: 4 }],
    baseCell: { x: 3, y: 4 },
});

const summonEvent = (unitId = "server-wolf", merged = false): SummonEvent => ({
    type: "unit_summoned",
    casterId: "satyr",
    unitId,
    team: TeamVals.LEFT,
    unitName: "Wolf",
    amount: 3,
    position: { x: 30, y: 40 },
    cells: [{ x: 3, y: 4 }],
    merged,
});

describe("authoritative summon replay", () => {
    test("materializes the server summon id even when a client-random id is present", () => {
        const event = summonEvent();
        const state = unitState(event.unitId);

        const missing = getMissingReplaySummons([event], { units: [state] }, new Set(["client-random-wolf"]));

        expect(missing).toEqual([{ event, unitState: state }]);
        expect(missing[0]?.event.unitId).toBe("server-wolf");
    });

    test("does not create a second body for an existing merged summon", () => {
        const event = summonEvent("server-wolf", true);

        expect(getMissingReplaySummons([event], { units: [unitState(event.unitId)] }, new Set([event.unitId]))).toEqual(
            [],
        );
    });

    test("deduplicates events and safely defers malformed or already-dead state to snapshot hydration", () => {
        const event = summonEvent("server-spider");

        expect(
            getMissingReplaySummons([event, event], { units: [unitState(event.unitId)] }, new Set<string>()),
        ).toHaveLength(1);
        expect(getMissingReplaySummons([event], { units: [] }, new Set<string>())).toEqual([]);
        expect(getMissingReplaySummons([event], { units: [unitState(event.unitId, true)] }, new Set<string>())).toEqual(
            [],
        );
    });

    test("summon spells bypass the local random-id engine and apply authoritative cleanup", async () => {
        const event = summonEvent();
        const caster = {
            getId: () => "satyr",
            getName: () => "Satyr",
            getPosition: () => ({ x: 0, y: 0 }),
            hasAnimationState: () => false,
        };
        const record = {
            sequence: 1,
            clientTimeMs: 0,
            action: { type: "cast_spell", casterId: "satyr", spellName: "Summon Wolves" },
            events: [event],
            stateAfter: { units: [unitState(event.unitId)] },
        };
        const scene = Object.assign(Object.create(Sandbox.prototype), {
            isSceneDestroyed: () => false,
            unitsHolder: { getAllUnits: () => new Map([["satyr", caster]]) },
            sc_sceneSettings: { getGridSettings: () => ({}) },
            sc_sceneLog: { updateLog: () => {} },
            snapshotRenderableUnits: () => new Map(),
            playUnitCastSound: () => {},
            renderHealVfx: () => {},
            renderSpellDamageVfx: () => {},
            waitForSpellDamageDelivery: async () => true,
            renderCastOutcomes: () => {},
            renderSnareResistVfx: () => {},
            delayReplay: async () => {},
            createActionEngine: mock(() => ({ apply: () => ({ completed: true, events: [] }) })),
            materializeReplaySummons: mock(() => {}),
            cleanupAfterSpell: mock(() => {}),
        });

        expect(await scene.playReplayCastSpellAction(record)).toBe(true);

        expect(scene.createActionEngine).not.toHaveBeenCalled();
        expect(scene.materializeReplaySummons).toHaveBeenCalledWith(record.events, record.stateAfter);
        expect(scene.cleanupAfterSpell.mock.calls[0]?.[0]).toBe(record.events);
    });

    test("Infest attack events seed the authoritative body before the existing spawn-animation route", () => {
        const event = summonEvent("server-spider");
        const order: string[] = [];
        const units = new Map<string, unknown>();
        const body = {
            getId: () => event.unitId,
            setPosition: mock(() => {}),
            ensureVisual: () => 1,
            startSpawnAnimation: mock(() => order.push("spawn")),
            syncVisual: mock(() => {}),
            getAttackRange: () => 1,
            isSmallSize: () => true,
            getTeam: () => TeamVals.LEFT,
            getSpellsCount: () => 0,
        };
        const grid = {
            cleanupAll: () => {},
            occupyCells: mock((_cells: unknown) => {
                order.push("occupy");
                return true;
            }),
            getMatrix: () => [],
            getMatrixNoUnits: () => [],
        };
        const scene = Object.assign(Object.create(Sandbox.prototype), {
            grid,
            unitsHolder: { getAllUnits: () => units, addUnit: (unit: typeof body) => units.set(unit.getId(), unit) },
            createRenderableUnitFromSceneState: mock(() => {
                order.push("create");
                return body;
            }),
            snapshotRenderableUnits: () => new Map(),
            applyTurnEngineEvents: (events: GameEvent[]) => {
                order.push("events");
                for (const applied of events) if (applied.type === "unit_summoned") scene.syncSummonedUnit(applied);
            },
            dispelSmokeUnderRegisteredUnit: () => {},
            drawer: { getUnitsContainer: () => undefined },
            sc_sceneSettings: { getGridSettings: () => ({}) },
            refreshUnits: () => {},
        });
        const state = unitState(event.unitId);

        scene.applyReplayEvents([event], { units: [state] });

        // The body is created from post-action truth and registered, but claims no cells until its event is
        // reached in journal order (Infest frees the corpse's cells in the unit_destroyed just before it).
        expect(scene.createRenderableUnitFromSceneState).toHaveBeenCalledWith(state, true);
        expect(body.setPosition).toHaveBeenCalledWith(event.position.x, event.position.y);
        expect(order).toEqual(["create", "events", "occupy", "spawn"]);
        expect(grid.occupyCells.mock.calls[0]?.[0]).toEqual(event.cells);

        // A merged summon refreshes the existing stack instead of hatching a new one.
        scene.syncSummonedUnit({ ...event, merged: true });
        expect(body.startSpawnAnimation).toHaveBeenCalledTimes(1);
        expect(body.syncVisual).toHaveBeenCalledTimes(1);
    });
});
