import { afterEach, expect, spyOn, test } from "bun:test";
import { Sandbox } from "./Sandbox";

// Owner (2026-11-25): the final screen waits for the last death animation (or Armageddon) to finish.
let now = 1000;
const clock = spyOn(performance, "now").mockImplementation(() => now);
afterEach(() => {
    now = 1000;
});

const scene = (busy: () => boolean) =>
    Object.assign(Object.create(Sandbox.prototype), {
        sc_visibleState: { hasFinished: false },
        sc_visibleStateUpdateNeeded: false,
        hasPendingCombatPresentation: busy,
    }) as Sandbox & { sc_visibleState: { hasFinished: boolean; resultsHeld?: boolean } };

test("results wait for the board to finish, then a short beat, and never longer than the cap", () => {
    let busy = true;
    const s = scene(() => busy);
    s.updateResultsHold();
    expect(s.sc_visibleState.resultsHeld).toBeFalsy();

    s.sc_visibleState.hasFinished = true;
    s.updateResultsHold();
    expect(s.sc_visibleState.resultsHeld).toBe(true);
    expect(s.sc_visibleStateUpdateNeeded).toBe(true);

    // Frames while the last death clip plays, then it ends; the results follow a beat later.
    now += 1500;
    s.updateResultsHold();
    busy = false;
    now += 100;
    s.updateResultsHold();
    expect(s.sc_visibleState.resultsHeld).toBe(true);
    now += 350;
    s.updateResultsHold();
    expect(s.sc_visibleState.resultsHeld).toBe(false);
});

test("an idle board shows the results at once, and a stuck animation cannot hold them past the cap", () => {
    const idle = scene(() => false);
    idle.sc_visibleState.hasFinished = true;
    idle.updateResultsHold();
    expect(idle.sc_visibleState.resultsHeld).toBeFalsy();

    const stuck = scene(() => true);
    stuck.sc_visibleState.hasFinished = true;
    stuck.updateResultsHold();
    expect(stuck.sc_visibleState.resultsHeld).toBe(true);
    now += 8001;
    stuck.updateResultsHold();
    expect(stuck.sc_visibleState.resultsHeld).toBe(false);
});

test("a new fight clears the hold", () => {
    const s = scene(() => true);
    s.sc_visibleState.hasFinished = true;
    s.updateResultsHold();
    s.sc_visibleState.hasFinished = false;
    s.updateResultsHold();
    expect(s.sc_visibleState.resultsHeld).toBe(false);
    clock.mockClear();
});
