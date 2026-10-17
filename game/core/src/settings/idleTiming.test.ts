import { afterEach, expect, test } from "bun:test";
import {
    duplicateIdleOffsetMs,
    duplicateIdleOrdinal,
    getStaggerDuplicateIdle,
    setStaggerDuplicateIdle,
    subscribeStaggerDuplicateIdle,
} from "./idleTiming";

afterEach(() => setStaggerDuplicateIdle(true));

test("groups duplicates by creature and board and retains slots after recreation", () => {
    const board = {};
    expect(duplicateIdleOrdinal(board, "Dryad", "a")).toBe(0);
    expect(duplicateIdleOrdinal(board, "Dryad", "b")).toBe(1);
    expect(duplicateIdleOrdinal(board, "Dryad", "c")).toBe(2);
    expect(duplicateIdleOrdinal(board, "Dryad", "b")).toBe(1);
    expect(duplicateIdleOrdinal(board, "Monk", "d")).toBe(0);
    expect(duplicateIdleOrdinal({}, "Dryad", "a")).toBe(0);
});

test("switch changes only duplicate clocks and notifies the settings panel", () => {
    let notifications = 0;
    const unsubscribe = subscribeStaggerDuplicateIdle(() => notifications++);
    expect(duplicateIdleOffsetMs(0)).toBe(0);
    expect(duplicateIdleOffsetMs(1)).toBe(733);
    expect(duplicateIdleOffsetMs(2)).toBe(1466);
    setStaggerDuplicateIdle(false);
    expect(getStaggerDuplicateIdle()).toBe(false);
    expect(duplicateIdleOffsetMs(2)).toBe(0);
    expect(notifications).toBe(1);
    unsubscribe();
});

test("reusing a cleared board starts a fresh group without shifting surviving units", () => {
    const board = {};
    let alive = true;
    expect(duplicateIdleOrdinal(board, "Dryad", "a", () => alive)).toBe(0);
    expect(duplicateIdleOrdinal(board, "Dryad", "b", () => alive)).toBe(1);
    alive = false;
    expect(duplicateIdleOrdinal(board, "Dryad", "new", () => true)).toBe(0);
    expect(duplicateIdleOrdinal(board, "Dryad", "other", () => true)).toBe(1);
});
