import { describe, expect, mock, spyOn, test } from "bun:test";

import { Grid, GridSettings, GridVals, TeamVals, type GameEvent, type UnitProperties } from "@heroesofcrypto/common";

import { TextureType, unitToTextureName } from "../pixi/PixiUnitsFactory";
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

    test("an Infest spider takes the cell its corpse just left, so it is on the board as it hatches", () => {
        // Game 0cf25203, seq 112: the Queen's counter killed a Leprechaun at (2, 3) and Infest hatched a spider
        // there. The corpse still held the cell, so the client refused the spider and logged it as Critical.
        const settings = new GridSettings(16, 2048, 0, 1024, -1024, 5, 0.06);
        const grid = new Grid(settings, GridVals.NORMAL);
        const cell = { x: 2, y: 3 };
        grid.occupyCells([cell], "leprechaun", TeamVals.LEFT, 1, false, false);
        const corpse = {
            getId: () => "leprechaun",
            getAttackRange: () => 1,
            isSmallSize: () => true,
            getShatterInfo: () => null,
            hasStatusEffect: () => false,
            destroyVisuals: mock(() => {}),
        };
        const spider = {
            getId: () => "server-spider",
            getName: () => "Arachna Spider",
            setPosition: () => {},
            getCells: () => [cell],
            ensureVisual: () => 1,
            startSpawnAnimation: mock(() => {}),
            syncVisual: () => {},
            getAttackRange: () => 1,
            isSmallSize: () => true,
            getTeam: () => TeamVals.RIGHT,
            getSpellsCount: () => 0,
        };
        const units = new Map<string, unknown>([
            ["leprechaun", corpse],
            ["server-spider", spider],
        ]);
        const spawnInfestHatch = mock(() => {});
        const scene = Object.assign(Object.create(Sandbox.prototype), {
            grid,
            unitsHolder: { getAllUnits: () => units },
            playCustomDeathAnimation: () => false,
            combatVisuals: { spawnDeathVfx: () => {}, spawnInfestHatch },
            dispelSmokeUnderRegisteredUnit: () => {},
            drawer: { getUnitsContainer: () => undefined },
            sc_sceneSettings: { getGridSettings: () => settings },
            refreshUnits: () => {},
        });
        const hatch: SummonEvent = {
            ...summonEvent("server-spider"),
            team: TeamVals.RIGHT,
            unitName: "Arachna Spider",
            amount: 1,
            position: { x: -704, y: 448 },
            cells: [cell],
            sourceAbility: "Infest",
        };
        const error = spyOn(console, "error").mockImplementation(() => {});
        try {
            // applyTurnEngineEvents order: the corpse's unit_destroyed, then the summon.
            scene.destroyEventDeletedUnit("leprechaun", new Map(units));
            scene.syncSummonedUnit(hatch, corpse);

            expect(grid.getOccupantUnitId(cell)).toBe("server-spider");
            expect(grid.getOccupiedCells("leprechaun")).toEqual([]);
            expect(error).not.toHaveBeenCalled();
            expect(spawnInfestHatch).toHaveBeenCalledWith(spider, corpse);
        } finally {
            error.mockRestore();
        }
    });

    describe("summoned figures are loaded before the record that summons them plays", () => {
        const spiderFigure = unitToTextureName("Arachna Spider", TextureType.SMALL);
        const hatchRecord = {
            sequence: 112,
            clientTimeMs: 0,
            action: { type: "melee_attack", attackerId: "leprechaun", targetId: "queen" },
            events: [
                { type: "unit_destroyed", unitId: "leprechaun", reason: "dead_cleanup" },
                { ...summonEvent("server-spider"), unitName: "Arachna Spider", amount: 1, sourceAbility: "Infest" },
            ],
            stateAfter: { units: [] },
        };
        const sceneWith = (figure: Promise<void>, cels: Promise<unknown>) => {
            const timers: (() => void)[] = [];
            return Object.assign(Object.create(Sandbox.prototype), {
                isSceneDestroyed: () => false,
                preloadTextureKeys: mock(() => figure),
                combatVisuals: { prepareInfestHatch: mock(() => cels) },
                playReplayActionRecord: mock(async () => true),
                scheduleSceneTimeout: mock((callback: () => void) => {
                    timers.push(callback);
                    return 1;
                }),
                clearSceneTimeout: mock(() => {}),
                timers,
            });
        };
        const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

        test("live play holds an Infest hatch until the spider's figure and its hatch cels are in", async () => {
            let figureLoaded!: () => void;
            let celsLoaded!: () => void;
            const scene = sceneWith(
                new Promise<void>((resolve) => (figureLoaded = resolve)),
                new Promise((resolve) => (celsLoaded = () => resolve([]))),
            );

            const playback = scene.playSandboxReplayRecord(hatchRecord);
            await settle();
            // Live ranked had loaded no figure for a creature that only enters by summon: the board drew a team
            // token in its place and skipped the hatch and spawn animation.
            expect(scene.preloadTextureKeys).toHaveBeenCalledWith([spiderFigure], { priority: "visible" });
            expect(scene.combatVisuals.prepareInfestHatch).toHaveBeenCalledWith("Arachna Spider");
            expect(scene.playReplayActionRecord).not.toHaveBeenCalled();
            figureLoaded();
            await settle();
            expect(scene.playReplayActionRecord).not.toHaveBeenCalled();
            celsLoaded();

            expect(await playback).toBe(true);
            expect(scene.playReplayActionRecord).toHaveBeenCalledTimes(1);
            expect(scene.clearSceneTimeout).toHaveBeenCalledTimes(1);
        });

        test("a download that never finishes holds the record only until the wait runs out", async () => {
            const scene = sceneWith(new Promise<void>(() => {}), new Promise(() => {}));

            const playback = scene.playSandboxReplayRecord(hatchRecord);
            await settle();
            expect(scene.playReplayActionRecord).not.toHaveBeenCalled();
            expect(scene.scheduleSceneTimeout.mock.calls[0]?.[1]).toBe(1500);
            scene.timers[0]();

            expect(await playback).toBe(true);
            expect(scene.playReplayActionRecord).toHaveBeenCalledTimes(1);
        });

        test("records without a summon start at once", async () => {
            const scene = sceneWith(new Promise<void>(() => {}), new Promise(() => {}));

            expect(await scene.playSandboxReplayRecord({ ...hatchRecord, events: [hatchRecord.events[0]] })).toBe(true);
            expect(scene.preloadTextureKeys).not.toHaveBeenCalled();
            expect(scene.scheduleSceneTimeout).not.toHaveBeenCalled();
        });
    });
});
