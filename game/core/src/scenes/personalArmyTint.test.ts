import { afterEach, describe, expect, test } from "bun:test";

import { TeamVals } from "@heroesofcrypto/common";

import {
    CAN_RENDER_FLAG_GRADIENT,
    clearPersonalArmyTint,
    personalArmyFlagGradient,
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
        setPersonalArmyTint(TeamVals.LEFT, true);

        expect(personalArmyPresetFor(TeamVals.LEFT)?.id).toBe(AMETHYST.id);
        expect(personalArmyPresetFor(TeamVals.RIGHT)).toBe(OPPONENT_ARMY_COLOR);
    });

    test("a RIGHT seat may fight in green, because the green side opposite turns red", () => {
        const green = ARMY_COLOR_PRESETS.find((preset) => preset.id === "green")!;
        writePlayerArmyColorId(green.id);
        setPersonalArmyTint(TeamVals.RIGHT, true);

        expect(personalArmyPresetFor(TeamVals.RIGHT)?.color).toBe(green.color);
        expect(personalArmyPresetFor(TeamVals.LEFT)).toBe(OPPONENT_ARMY_COLOR);
    });

    test("a replay is watched in the true team colours", () => {
        writePlayerArmyColorId(AMETHYST.id);
        setPersonalArmyTint(TeamVals.LEFT, false);

        expect(personalArmyPresetFor(TeamVals.LEFT)).toBeUndefined();
        expect(personalArmyPresetFor(TeamVals.RIGHT)).toBeUndefined();
    });

    test("an observer has no own army to tint", () => {
        writePlayerArmyColorId(AMETHYST.id);
        setPersonalArmyTint(undefined, true);

        expect(personalArmyPresetFor(TeamVals.LEFT)).toBeUndefined();
        expect(personalArmyPresetFor(TeamVals.RIGHT)).toBeUndefined();
    });

    test("neutral bodies are nobody's own army", () => {
        writePlayerArmyColorId(AMETHYST.id);
        setPersonalArmyTint(TeamVals.NO_TEAM, true);

        expect(personalArmyPresetFor(TeamVals.NO_TEAM)).toBeUndefined();
    });

    test("unarmed scenes — the sandbox and anything before a fight — are untinted", () => {
        writePlayerArmyColorId(AMETHYST.id);
        clearPersonalArmyTint();

        expect(personalArmyPresetFor(TeamVals.LEFT)).toBeUndefined();
        expect(personalArmyPresetFor(TeamVals.RIGHT)).toBeUndefined();
    });

    test("a pick in the settings menu applies without re-arming the scene", () => {
        setPersonalArmyTint(TeamVals.RIGHT, true);
        expect(personalArmyPresetFor(TeamVals.RIGHT)).toBeUndefined();
        expect(personalArmyPresetFor(TeamVals.LEFT)).toBeUndefined();

        writePlayerArmyColorId(AMETHYST.id);
        refreshPersonalArmyTint();
        expect(personalArmyPresetFor(TeamVals.RIGHT)?.id).toBe(AMETHYST.id);
        expect(personalArmyPresetFor(TeamVals.LEFT)).toBe(OPPONENT_ARMY_COLOR);

        // Back to the default: both armies return to their own team colours, not just the viewer's.
        writePlayerArmyColorId(TEAM_DEFAULT_ARMY_COLOR_ID);
        refreshPersonalArmyTint();
        expect(personalArmyPresetFor(TeamVals.RIGHT)).toBeUndefined();
        expect(personalArmyPresetFor(TeamVals.LEFT)).toBeUndefined();
    });

    /**
     * Building a FillGradient rasterises through a real 2D canvas, so Pixi throws "document is not
     * defined" the moment one is constructed headless. This guard is the only thing standing between the
     * flag renderer and that crash, and it went wrong once: it tested `typeof FillGradient === "function"`,
     * which is TRUE headless. Nothing noticed while the lookup only matched tinted armies, because no test
     * arms a tint — then GREEN became a pickable preset, the lookup started matching every plain green
     * unit, and 53 renderer tests died at once.
     */
    test("never builds a gradient where there is no canvas to rasterise it", () => {
        expect(CAN_RENDER_FLAG_GRADIENT).toBe(false);
        // 0x00d200 is the team's green AND the "green" preset's colour, so it hits the preset lookup.
        expect(personalArmyFlagGradient(0x00d200)).toBeUndefined();
        expect(personalArmyFlagGradient(AMETHYST.color)).toBeUndefined();
    });

    test("refreshing an unarmed scene does not arm it", () => {
        writePlayerArmyColorId(AMETHYST.id);
        refreshPersonalArmyTint();

        expect(personalArmyPresetFor(TeamVals.LEFT)).toBeUndefined();
    });
});
