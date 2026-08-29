import { describe, expect, test } from "bun:test";
import { TeamVals } from "@heroesofcrypto/common";
import {
    ARMY_COLOR_PRESETS,
    OPPONENT_ARMY_COLOR,
    TEAM_DEFAULT_ARMY_COLOR_ID,
    armyColorPresetById,
    resolvePlayerArmyColor,
} from "./playerArmyColor";

const LEFT = TeamVals.LEFT;
const RIGHT = TeamVals.RIGHT;
const ctx = (over: Partial<Parameters<typeof resolvePlayerArmyColor>[0]> = {}) =>
    resolvePlayerArmyColor({ team: LEFT, viewerTeam: LEFT, presetId: "azure", live: true, ...over });

/**
 * A personal army colour is a LOCAL cosmetic repaint of the two armies. It must never become the
 * viewer-relative palette that was introduced and reverted twice: team identity stays fixed everywhere it
 * is NAMED — the log, the results card, match history — and a replay shows the match as it actually was.
 */
describe("personal army colour", () => {
    test("paints the player's own army in their colour", () => {
        expect(ctx()?.id).toBe("azure");
    });

    test("paints the opponent red, whichever side they are seated on", () => {
        // Red is what keeps the board readable once the player's own colour is arbitrary — including green,
        // which would otherwise be able to sit opposite the green team.
        expect(ctx({ team: RIGHT })).toBe(OPPONENT_ARMY_COLOR);
        expect(ctx({ team: LEFT, viewerTeam: RIGHT })).toBe(OPPONENT_ARMY_COLOR);
    });

    test("the opponent's red is the team's own red, and is not itself selectable", () => {
        expect(OPPONENT_ARMY_COLOR.color).toBe(0xff0000);
        expect(ARMY_COLOR_PRESETS.map((preset) => preset.id)).not.toContain(OPPONENT_ARMY_COLOR.id);
        expect(armyColorPresetById(OPPONENT_ARMY_COLOR.id)).toBeUndefined();
    });

    test("is off in a replay, which must show the match as it was", () => {
        expect(ctx({ live: false })).toBeUndefined();
        expect(ctx({ live: false, team: RIGHT })).toBeUndefined();
    });

    test("is off for an observer, who has no own army", () => {
        expect(ctx({ viewerTeam: undefined })).toBeUndefined();
        expect(ctx({ viewerTeam: TeamVals.NO_TEAM })).toBeUndefined();
        expect(ctx({ viewerTeam: undefined, team: RIGHT })).toBeUndefined();
    });

    test("neutral bodies belong to neither army", () => {
        expect(ctx({ team: TeamVals.NO_TEAM })).toBeUndefined();
    });

    test("the team default and an unknown id leave BOTH sides on their team colours", () => {
        for (const presetId of [TEAM_DEFAULT_ARMY_COLOR_ID, undefined, "chartreuse"]) {
            expect(ctx({ presetId })).toBeUndefined();
            expect(ctx({ presetId, team: RIGHT })).toBeUndefined();
        }
    });

    test("ships exactly eleven presets, all distinct", () => {
        expect(ARMY_COLOR_PRESETS).toHaveLength(11);
        expect(new Set(ARMY_COLOR_PRESETS.map((p) => p.id)).size).toBe(11);
        expect(new Set(ARMY_COLOR_PRESETS.map((p) => p.color)).size).toBe(11);
    });

    test("green is offered, red is not — red is what the opponent is painted", () => {
        // Green became safe to pick the moment the opponent turned red: a green army can only ever face a
        // red one. Wearing RED is the choice that could still make a fight unreadable, so it is not offered.
        const channels = (c: number) => [(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff];
        const far = (a: number, b: number) => {
            const [ar, ag, ab] = channels(a);
            const [br, bg, bb] = channels(b);
            return Math.hypot(ar - br, ag - bg, ab - bb) > 110;
        };
        expect(ARMY_COLOR_PRESETS.map((preset) => preset.color)).toContain(0x00d200);
        for (const preset of ARMY_COLOR_PRESETS) {
            expect(far(preset.color, 0xff0000)).toBe(true);
        }
    });

    test("every preset carries a three-stop flag gradient", () => {
        for (const preset of [...ARMY_COLOR_PRESETS, OPPONENT_ARMY_COLOR]) {
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
