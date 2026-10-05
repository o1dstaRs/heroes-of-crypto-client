import { expect, test } from "bun:test";

import { TeamVals } from "@heroesofcrypto/common";

import type { IVisibleState, IVisibleUnit } from "../../scenes/VisibleState";
import { selectUpNextVisibleState } from "./upNextVisibleState";

const unit = (overrides: Partial<IVisibleUnit> = {}): IVisibleUnit => ({
    id: "first",
    name: "Peasant",
    smallTextureName: "peasant_512",
    amount: 10,
    teamType: TeamVals.LEFT,
    stackPower: 2,
    isStackPowered: true,
    isSkipping: false,
    isOnHourglass: false,
    ...overrides,
});

const state = (upNext: IVisibleUnit[], overrides: Partial<IVisibleState> = {}): IVisibleState =>
    ({ upNext, lapNumber: 1, hasFinished: false, ...overrides }) as IVisibleState;

test("100 clock, additional-time, AI and fight-stats signals reuse the selected snapshot", () => {
    const initial = selectUpNextVisibleState(state([unit()]));
    for (let tick = 0; tick < 100; tick += 1) {
        const selected = selectUpNextVisibleState(
            state([unit()], {
                secondsRemaining: tick,
                secondsMax: tick + 100,
                hasAdditionalTime: tick % 2 === 0,
                canRequestAdditionalTime: tick % 3 === 0,
                aiToggleOn: tick % 2 === 0,
                fightStats: { totalLaps: tick } as IVisibleState["fightStats"],
            }),
            initial,
        );
        expect(selected).toBe(initial);
    }
});

test("every rendered scalar detects an in-place unit edit without changing the earlier snapshot", () => {
    const changes: Partial<IVisibleUnit>[] = [
        { id: "replacement" },
        { name: "Archer" },
        { smallTextureName: "replacement_512" },
        { amount: 20 },
        { teamType: TeamVals.RIGHT },
        { stackPower: 3 },
        { isStackPowered: false },
        { isSkipping: true },
        { isOnHourglass: true },
    ];
    for (const change of changes) {
        const source = unit();
        const input = state([source]);
        const previous = selectUpNextVisibleState(input);
        const original = unit();
        Object.assign(source, change);
        const selected = selectUpNextVisibleState(input, previous);
        expect(selected).not.toBe(previous);
        expect(selected.upNext[0]).toEqual(source);
        expect(previous.upNext[0]).toEqual(original);
        expect(selected.upNext[0]).not.toBe(source);
    }
});

test("in-place queue reordering and count changes remain observable", () => {
    const input = state([unit(), unit({ id: "second" })]);
    const first = selectUpNextVisibleState(input);
    input.upNext.reverse();
    const reversed = selectUpNextVisibleState(input, first);
    expect(reversed).not.toBe(first);
    expect(reversed.upNext.map((entry) => entry.id)).toEqual(["second", "first"]);
    expect(first.upNext.map((entry) => entry.id)).toEqual(["first", "second"]);
    input.upNext.pop();
    const shortened = selectUpNextVisibleState(input, reversed);
    expect(shortened).not.toBe(reversed);
    expect(shortened.upNext).toHaveLength(1);
    input.upNext.push(unit({ id: "third" }));
    expect(selectUpNextVisibleState(input, shortened).upNext.map((entry) => entry.id)).toEqual(["second", "third"]);
});

test("name and texture delimiters and missing names cannot collide", () => {
    const first = selectUpNextVisibleState(state([unit({ name: "A:B", smallTextureName: "C|D" })]));
    const second = selectUpNextVisibleState(state([unit({ name: "A", smallTextureName: "B:C|D" })]), first);
    expect(second).not.toBe(first);
    const unnamed = selectUpNextVisibleState(state([unit({ name: undefined })]), second);
    expect(selectUpNextVisibleState(state([unit({ name: "" })]), unnamed)).not.toBe(unnamed);
});

test("lap and finish changes preserve the copied queue while selecting a new lifecycle snapshot", () => {
    const first = selectUpNextVisibleState(state([unit()]));
    const nextLap = selectUpNextVisibleState(state([unit()], { lapNumber: 2 }), first);
    expect(nextLap).not.toBe(first);
    expect(nextLap.lapNumber).toBe(2);
    expect(nextLap.upNext).toBe(first.upNext);
    const finished = selectUpNextVisibleState(state([unit()], { lapNumber: 2, hasFinished: true }), nextLap);
    expect(finished).not.toBe(nextLap);
    expect(finished.hasFinished).toBe(true);
    expect(finished.upNext).toBe(first.upNext);
});

test("empty live handoffs, lap zero and finished state each reach the queue lifecycle", () => {
    const populated = selectUpNextVisibleState(state([unit()]));
    const handoff = selectUpNextVisibleState(state([]), populated);
    expect(handoff).not.toBe(populated);
    expect(handoff.upNext).toEqual([]);
    expect(selectUpNextVisibleState(state([]), handoff)).toBe(handoff);
    expect(selectUpNextVisibleState(state([], { lapNumber: 0 }), handoff)).not.toBe(handoff);
    expect(selectUpNextVisibleState(state([], { hasFinished: true }), handoff)).not.toBe(handoff);
    const reset = selectUpNextVisibleState({} as IVisibleState);
    expect(reset.upNext).toEqual([]);
    expect(selectUpNextVisibleState({} as IVisibleState, reset)).toBe(reset);
});
