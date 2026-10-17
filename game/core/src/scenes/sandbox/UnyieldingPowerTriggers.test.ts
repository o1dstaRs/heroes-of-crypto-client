import { describe, expect, test } from "bun:test";

import { UnyieldingPowerTriggers } from "./UnyieldingPowerTriggers";

describe("Unyielding Power event guards", () => {
    test("first activation only, including extra actions, waiting, and snapshot echoes", () => {
        const triggers = new UnyieldingPowerTriggers();
        expect(triggers.firstTurn("behemoth", 1, true)).toBe(true);
        expect(triggers.firstTurn("behemoth", 1, true)).toBe(false);
        expect(triggers.firstTurn("another", 1, true)).toBe(true);
        expect(triggers.firstTurn("behemoth", 2, true)).toBe(true);
        expect(triggers.firstTurn("behemoth", 1, true)).toBe(false);
    });

    test("passive gain occurs once per round, independently of turn handoff", () => {
        const triggers = new UnyieldingPowerTriggers();
        triggers.prime(["behemoth"]);
        expect(triggers.observePassive("behemoth", 1, true)).toBe(true);
        expect(triggers.observePassive("behemoth", 1, true)).toBe(false);
        expect(triggers.firstTurn("behemoth", 1, true)).toBe(true);
        expect(triggers.observePassive("behemoth", 2, true)).toBe(true);
        expect(triggers.observePassive("behemoth", 2, true)).toBe(false);
        expect(triggers.firstTurn("behemoth", 2, true)).toBe(true);
    });

    test("Break, stolen cards, and dead units do not pop or acquire a late passive proc", () => {
        const triggers = new UnyieldingPowerTriggers();
        triggers.prime(["behemoth"]);
        expect(triggers.observePassive("behemoth", 1, false)).toBe(false);
        expect(triggers.observePassive("behemoth", 1, true)).toBe(false);
        expect(triggers.firstTurn("behemoth", 1, false)).toBe(false);
        expect(triggers.firstTurn("behemoth", 1, true)).toBe(false);
        expect(triggers.observePassive("behemoth", 2, true)).toBe(true);
        expect(triggers.firstTurn("behemoth", 2, true)).toBe(true);
    });

    test("joining mid-fight seeds passive history without replaying old gains", () => {
        const triggers = new UnyieldingPowerTriggers();
        expect(triggers.observePassive("behemoth", 7, true)).toBe(false);
        expect(triggers.observePassive("behemoth", 7, true)).toBe(false);
        expect(triggers.observePassive("behemoth", 8, true)).toBe(true);
    });

    test("a new fight re-arms the initial round", () => {
        const triggers = new UnyieldingPowerTriggers();
        triggers.firstTurn("behemoth", 4, true);
        triggers.observePassive("behemoth", 4, true);
        triggers.prime(["behemoth"]);
        expect(triggers.observePassive("behemoth", 1, true)).toBe(true);
        expect(triggers.firstTurn("behemoth", 1, true)).toBe(true);
    });
});
