import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { TeamVals, type GameEvent, type UnitProperties } from "@heroesofcrypto/common";

import { getMissingReplaySummons, type SandboxSceneUnitState } from "./Sandbox";

type SummonEvent = Extract<GameEvent, { type: "unit_summoned" }>;

const unitState = (id: string, dead = false): SandboxSceneUnitState => ({
    properties: { id } as UnitProperties,
    team: TeamVals.LOWER,
    placed: true,
    dead,
    cells: [{ x: 3, y: 4 }],
    baseCell: { x: 3, y: 4 },
});

const summonEvent = (unitId = "server-wolf", merged = false): SummonEvent => ({
    type: "unit_summoned",
    casterId: "satyr",
    unitId,
    team: TeamVals.LOWER,
    unitName: "Wolf",
    amount: 3,
    position: { x: 30, y: 40 },
    cells: [{ x: 3, y: 4 }],
    merged,
});

const sandboxSource = (): string => readFileSync(join(import.meta.dir, "Sandbox.ts"), "utf8");

const sliceFrom = (source: string, anchor: string, length: number): string => {
    const start = source.indexOf(anchor);
    expect(start).toBeGreaterThan(-1);
    return source.slice(start, start + length);
};

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

    test("summon spells bypass the local random-id engine and apply authoritative cleanup", () => {
        const body = sliceFrom(sandboxSource(), "private async playReplayCastSpellAction(", 12_000);
        const summonBranch = body.indexOf("if (authoritativeSummons.length)");
        const localEngineApply = body.indexOf("const result = this.createActionEngine().apply(action)");

        expect(summonBranch).toBeGreaterThan(-1);
        expect(localEngineApply).toBeGreaterThan(summonBranch);
        expect(body).toContain("this.materializeReplaySummons(record.events, record.stateAfter)");
        expect(body).toContain("this.cleanupAfterSpell(record.events, this.snapshotRenderableUnits())");
    });

    test("Infest attack events seed the authoritative body before the existing spawn-animation route", () => {
        const source = sandboxSource();
        const attackBody = sliceFrom(source, "private async playReplayAttackRecord(", 18_000);
        const materializer = sliceFrom(source, "private materializeReplaySummons(", 3_000);
        const syncBody = sliceFrom(source, "private syncSummonedUnit(", 2_000);

        expect(attackBody).toMatch(/this\.applyReplayEvents\([\s\S]*?record\.stateAfter,[\s\S]*?\);/);
        expect(materializer).toContain("this.createRenderableUnitFromSceneState(unitState, true)");
        expect(materializer).toContain("this.unitsHolder.addUnit(unit)");
        expect(materializer).not.toContain("this.grid.occupyCells(");
        expect(syncBody).toContain("this.grid.occupyCells(event.cells");
        expect(syncBody).toContain("if (!event.merged && scale)");
        expect(syncBody).toContain("unit.startSpawnAnimation(scale)");
    });
});
