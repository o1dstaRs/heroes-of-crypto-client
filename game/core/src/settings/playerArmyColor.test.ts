import { describe, expect, test } from "bun:test";
import { TeamVals } from "@heroesofcrypto/common";
import {
    ARMY_COLOR_PRESETS,
    TEAM_DEFAULT_ARMY_COLOR_ID,
    armyColorPresetById,
    resolvePlayerArmyColor,
} from "./playerArmyColor";

const LOWER = TeamVals.LOWER;
const UPPER = TeamVals.UPPER;
const ctx = (over: Partial<Parameters<typeof resolvePlayerArmyColor>[0]> = {}) =>
    resolvePlayerArmyColor({ team: LOWER, viewerTeam: LOWER, presetId: "azure", live: true, ...over });

/**
 * A personal army colour is a LOCAL cosmetic for the player's own units. It must never become the
 * viewer-relative palette that was introduced and reverted twice: team identity stays fixed, the opponent
 * keeps their team colour, and a replay shows the match as it actually was.
 */
describe("personal army colour", () => {
    test("tints the player's own army", () => {
        expect(ctx()?.id).toBe("azure");
    });

    test("never tints the opponent — they keep their team colour", () => {
        // This is what stops a player painting their army the enemy's colour and making the board unreadable.
        expect(ctx({ team: UPPER })).toBeUndefined();
    });

    test("is off in a replay, which must show the match as it was", () => {
        expect(ctx({ live: false })).toBeUndefined();
    });

    test("is off for an observer, who has no own army", () => {
        expect(ctx({ viewerTeam: undefined })).toBeUndefined();
        expect(ctx({ viewerTeam: TeamVals.NO_TEAM })).toBeUndefined();
    });

    test("the team default and an unknown id both fall back to the team colour", () => {
        expect(ctx({ presetId: TEAM_DEFAULT_ARMY_COLOR_ID })).toBeUndefined();
        expect(ctx({ presetId: undefined })).toBeUndefined();
        expect(ctx({ presetId: "chartreuse" })).toBeUndefined();
    });

    test("ships exactly ten presets, all distinct", () => {
        expect(ARMY_COLOR_PRESETS).toHaveLength(10);
        expect(new Set(ARMY_COLOR_PRESETS.map((p) => p.id)).size).toBe(10);
        expect(new Set(ARMY_COLOR_PRESETS.map((p) => p.color)).size).toBe(10);
    });

    test("no preset is close to either TEAM colour", () => {
        // Green 0x00d200 and red 0xff0000 belong to the sides. A preset near either would let a player
        // disguise their army as the enemy's — the one choice that could make a fight unreadable.
        const channels = (c: number) => [(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff];
        const far = (a: number, b: number) => {
            const [ar, ag, ab] = channels(a);
            const [br, bg, bb] = channels(b);
            return Math.hypot(ar - br, ag - bg, ab - bb) > 110;
        };
        for (const preset of ARMY_COLOR_PRESETS) {
            expect(far(preset.color, 0x00d200)).toBe(true);
            expect(far(preset.color, 0xff0000)).toBe(true);
        }
    });

    test("every preset carries a three-stop flag gradient", () => {
        for (const preset of ARMY_COLOR_PRESETS) {
            expect(preset.gradient).toHaveLength(3);
            // Edge/centre/edge, like the authored green and red banners: the ends match, the centre is darker.
            expect(preset.gradient[0]).toBe(preset.gradient[2]);
            expect(preset.gradient[1]).toBeLessThan(preset.gradient[0]);
        }
    });

    test("lookup by id round-trips and rejects the default sentinel", () => {
        expect(armyColorPresetById("gold")?.label).toBe("Gold");
        expect(armyColorPresetById(TEAM_DEFAULT_ARMY_COLOR_ID)).toBeUndefined();
    });
});
