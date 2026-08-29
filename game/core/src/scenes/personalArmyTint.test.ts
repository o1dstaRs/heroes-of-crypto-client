import { afterEach, describe, expect, test } from "bun:test";

import { TeamVals } from "@heroesofcrypto/common";

import {
    clearPersonalArmyTint,
    personalArmyPresetFor,
    refreshPersonalArmyTint,
    setPersonalArmyTint,
} from "./personalArmyTint";
import {
    ARMY_COLOR_PRESETS,
    OPPONENT_ARMY_COLOR,
    TEAM_DEFAULT_ARMY_COLOR_ID,
    writePlayerArmyColorId,
} from "../settings/playerArmyColor";

const AMETHYST = ARMY_COLOR_PRESETS[0];

// The preference lives in localStorage, which the test runner has no DOM to provide. A minimal stub keeps
// these cases about the TINT GATING rather than about storage.
const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
        store.set(key, value);
    },
};

afterEach(() => {
    clearPersonalArmyTint();
    writePlayerArmyColorId(TEAM_DEFAULT_ARMY_COLOR_ID);
});

describe("personal army tint", () => {
    test("paints the viewer's own army in their colour and the opponent red", () => {
        writePlayerArmyColorId(AMETHYST.id);
        setPersonalArmyTint(TeamVals.LOWER, true);

        expect(personalArmyPresetFor(TeamVals.LOWER)?.id).toBe(AMETHYST.id);
        expect(personalArmyPresetFor(TeamVals.UPPER)).toBe(OPPONENT_ARMY_COLOR);
    });

    test("an UPPER seat may fight in green, because the green side opposite turns red", () => {
        const green = ARMY_COLOR_PRESETS.find((preset) => preset.id === "green")!;
        writePlayerArmyColorId(green.id);
        setPersonalArmyTint(TeamVals.UPPER, true);

        expect(personalArmyPresetFor(TeamVals.UPPER)?.color).toBe(green.color);
        expect(personalArmyPresetFor(TeamVals.LOWER)).toBe(OPPONENT_ARMY_COLOR);
    });

    test("a replay is watched in the true team colours", () => {
        writePlayerArmyColorId(AMETHYST.id);
        setPersonalArmyTint(TeamVals.LOWER, false);

        expect(personalArmyPresetFor(TeamVals.LOWER)).toBeUndefined();
        expect(personalArmyPresetFor(TeamVals.UPPER)).toBeUndefined();
    });

    test("an observer has no own army to tint", () => {
        writePlayerArmyColorId(AMETHYST.id);
        setPersonalArmyTint(undefined, true);

        expect(personalArmyPresetFor(TeamVals.LOWER)).toBeUndefined();
        expect(personalArmyPresetFor(TeamVals.UPPER)).toBeUndefined();
    });

    test("neutral bodies are nobody's own army", () => {
        writePlayerArmyColorId(AMETHYST.id);
        setPersonalArmyTint(TeamVals.NO_TEAM, true);

        expect(personalArmyPresetFor(TeamVals.NO_TEAM)).toBeUndefined();
    });

    test("unarmed scenes — the sandbox and anything before a fight — are untinted", () => {
        writePlayerArmyColorId(AMETHYST.id);
        clearPersonalArmyTint();

        expect(personalArmyPresetFor(TeamVals.LOWER)).toBeUndefined();
        expect(personalArmyPresetFor(TeamVals.UPPER)).toBeUndefined();
    });

    test("a pick in the settings menu applies without re-arming the scene", () => {
        setPersonalArmyTint(TeamVals.UPPER, true);
        expect(personalArmyPresetFor(TeamVals.UPPER)).toBeUndefined();
        expect(personalArmyPresetFor(TeamVals.LOWER)).toBeUndefined();

        writePlayerArmyColorId(AMETHYST.id);
        refreshPersonalArmyTint();
        expect(personalArmyPresetFor(TeamVals.UPPER)?.id).toBe(AMETHYST.id);
        expect(personalArmyPresetFor(TeamVals.LOWER)).toBe(OPPONENT_ARMY_COLOR);

        // Back to the default: both armies return to their own team colours, not just the viewer's.
        writePlayerArmyColorId(TEAM_DEFAULT_ARMY_COLOR_ID);
        refreshPersonalArmyTint();
        expect(personalArmyPresetFor(TeamVals.UPPER)).toBeUndefined();
        expect(personalArmyPresetFor(TeamVals.LOWER)).toBeUndefined();
    });

    test("refreshing an unarmed scene does not arm it", () => {
        writePlayerArmyColorId(AMETHYST.id);
        refreshPersonalArmyTint();

        expect(personalArmyPresetFor(TeamVals.LOWER)).toBeUndefined();
    });
});
