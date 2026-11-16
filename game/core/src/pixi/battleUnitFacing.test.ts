import { afterEach, expect, test } from "bun:test";
import {
    getBattleUnitFacing,
    publishBattleUnitFacings,
    releaseBattleUnitFacings,
    subscribeBattleUnitFacing,
} from "./battleUnitFacing";
const scene = {};
const replacement = {};
afterEach(() => {
    releaseBattleUnitFacings(scene);
    releaseBattleUnitFacings(replacement);
});
const unit = (id: string, facing: -1 | 1) => ({ getId: () => id, getBoardFacingDirection: () => facing });
test("movement or an attack updates only the changed stack's portrait subscribers", () => {
    let active = 0;
    let other = 0;
    const stop = subscribeBattleUnitFacing("active", () => active++);
    const stopOther = subscribeBattleUnitFacing("other", () => other++);
    publishBattleUnitFacings(scene, [unit("active", 1), unit("other", -1)]);
    expect([active, other]).toEqual([1, 1]);
    publishBattleUnitFacings(scene, [unit("active", 1), unit("other", -1)]);
    expect([active, other]).toEqual([1, 1]);
    publishBattleUnitFacings(scene, [unit("active", -1), unit("other", -1)]);
    expect(getBattleUnitFacing("active")).toBe(-1);
    expect([active, other]).toEqual([2, 1]);
    stop();
    stopOther();
});
test("a fallen stack keeps its inspected pose until the scene ends", () => {
    publishBattleUnitFacings(scene, [unit("fallen", -1)]);
    publishBattleUnitFacings(scene, []);
    expect(getBattleUnitFacing("fallen")).toBe(-1);
    releaseBattleUnitFacings(scene);
    expect(getBattleUnitFacing("fallen")).toBeUndefined();
});
test("a retired scene cannot clear the replacement scene's facing", () => {
    publishBattleUnitFacings(scene, [unit("old", -1)]);
    publishBattleUnitFacings(replacement, [unit("new", 1)]);
    releaseBattleUnitFacings(scene);
    expect(getBattleUnitFacing("old")).toBeUndefined();
    expect(getBattleUnitFacing("new")).toBe(1);
});
