import { afterEach, describe, expect, test } from "bun:test";

import { TeamVals } from "@heroesofcrypto/common";

import { getTeamFlagBackground } from "./TeamAmountFlag";
import { clearPersonalArmyTint, setPersonalArmyTint } from "../scenes/personalArmyTint";
import { ARMY_COLOR_PRESETS, TEAM_DEFAULT_ARMY_COLOR_ID, writePlayerArmyColorId } from "../settings/playerArmyColor";

/**
 * The React chrome names a team's colour in exactly one place, and the stack-power pips and count flags in
 * the left and top bars all read it. So this helper is where a personal army colour has to be honoured, for
 * BOTH armies — otherwise a player's units would be repainted on the board while their pips stayed green,
 * or an enemy drawn red on the board kept a green flag in the queue. That split is what this pins shut.
 */
const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
        store.set(key, value);
    },
};

const AMETHYST = ARMY_COLOR_PRESETS[0];
const GREEN = "#00d200";
const RED = "#ff0000";

afterEach(() => {
    clearPersonalArmyTint();
    writePlayerArmyColorId(TEAM_DEFAULT_ARMY_COLOR_ID);
});

describe("the chrome's team colour follows the player's own choice", () => {
    test("without a choice both sides keep their team colours", () => {
        setPersonalArmyTint(TeamVals.LOWER, true);

        expect(getTeamFlagBackground(TeamVals.LOWER)).toBe(GREEN);
        expect(getTeamFlagBackground(TeamVals.UPPER)).toBe(RED);
    });

    test("the player's own side takes the chosen colour, the opponent turns red", () => {
        writePlayerArmyColorId(AMETHYST.id);
        setPersonalArmyTint(TeamVals.LOWER, true);

        expect(getTeamFlagBackground(TeamVals.LOWER)).toBe(`#${AMETHYST.color.toString(16)}`);
        expect(getTeamFlagBackground(TeamVals.UPPER)).toBe(RED);
    });

    test("it follows the viewer's side, not a fixed one — the GREEN side can be the enemy", () => {
        writePlayerArmyColorId(AMETHYST.id);
        setPersonalArmyTint(TeamVals.UPPER, true);

        expect(getTeamFlagBackground(TeamVals.UPPER)).toBe(`#${AMETHYST.color.toString(16)}`);
        // The queue has to stay readable: whoever is opposite this player reads red, LOWER included.
        expect(getTeamFlagBackground(TeamVals.LOWER)).toBe(RED);
    });

    test("an UPPER seat can fly green, and then faces a red LOWER army", () => {
        const green = ARMY_COLOR_PRESETS.find((preset) => preset.id === "green")!;
        writePlayerArmyColorId(green.id);
        setPersonalArmyTint(TeamVals.UPPER, true);

        expect(getTeamFlagBackground(TeamVals.UPPER)).toBe(GREEN);
        expect(getTeamFlagBackground(TeamVals.LOWER)).toBe(RED);
    });

    test("a replay shows the true team colours on both sides", () => {
        writePlayerArmyColorId(AMETHYST.id);
        setPersonalArmyTint(TeamVals.LOWER, false);

        expect(getTeamFlagBackground(TeamVals.LOWER)).toBe(GREEN);
        expect(getTeamFlagBackground(TeamVals.UPPER)).toBe(RED);
    });

    test("neutral rows keep the unowned colour", () => {
        writePlayerArmyColorId(AMETHYST.id);
        setPersonalArmyTint(TeamVals.LOWER, true);

        expect(getTeamFlagBackground(TeamVals.NO_TEAM)).toBe("#8b94a6");
    });
});
