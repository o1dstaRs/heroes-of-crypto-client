/*
 * Ranked must run the SAME post-pick refresh sandbox runs.
 *
 * Ranked overrides propagateAugmentation to route the pick through the authoritative server, which means
 * it never executes the sandbox body — it has to re-run the refresh itself. It used to call refreshUnits
 * and stop, so the numbers moved while the left sidebar kept printing the old ones and the reachable-cell
 * highlight kept its old shape. What the refresh must DO is pinned in loadout_refresh.test.ts; this file
 * pins that ranked actually calls it, which is the half that silently rotted.
 */
import { describe, expect, test } from "bun:test";

import { Augment, FightStateManager, TeamVals } from "@heroesofcrypto/common";

import { RankedPlayScene } from "./RankedPlayScene";

const propagateAugmentation = (scene: object, team: number, augment: Augment.AugmentType): boolean =>
    (
        RankedPlayScene.prototype as unknown as {
            propagateAugmentation: (team: number, augment: Augment.AugmentType) => boolean;
        }
    ).propagateAugmentation.call(scene, team, augment);

const propagateSynergy = (scene: object, team: number): boolean =>
    (
        RankedPlayScene.prototype as unknown as {
            propagateSynergy: (team: number, faction: number, name: string, level: number) => boolean;
        }
    ).propagateSynergy.call(scene, team, 0, "Nowhere Synergy", 1);

/** Only the collaborators the two overrides touch; everything else on a real scene is irrelevant here. */
const makeRankedScene = () => {
    const sent: { type: string }[] = [];
    const calls: string[] = [];
    const scene = {
        sc_gameActionTransport: (action: { type: string }) => sent.push(action),
        viewerTeam: TeamVals.LOWER as number,
        placementManager: { rebuildFromFightProps: () => calls.push("rebuildFromFightProps") },
        refreshAfterLoadoutChange: () => calls.push("refreshAfterLoadoutChange"),
        refreshUnits: () => calls.push("refreshUnits"),
    };
    return { scene, sent, calls };
};

describe("ranked augment pick", () => {
    test("runs the shared refresh, not refreshUnits alone, before telling the server", () => {
        FightStateManager.getInstance().reset();
        const { scene, sent, calls } = makeRankedScene();

        const applied = propagateAugmentation(scene, TeamVals.LOWER, {
            type: "Movement",
            value: Augment.MovementAugment.LEVEL_1,
        });

        expect(applied).toBe(true);
        // A Movement augment changes the active unit's steps, so "refreshUnits and stop" leaves the board
        // drawing a reach the unit no longer has.
        expect(calls).toContain("refreshAfterLoadoutChange");
        expect(sent.map((action) => action.type)).toEqual(["augment"]);
    });

    test("still refuses to spend the opponent's budget", () => {
        FightStateManager.getInstance().reset();
        const { scene, sent, calls } = makeRankedScene();

        const applied = propagateAugmentation(scene, TeamVals.UPPER, {
            type: "Movement",
            value: Augment.MovementAugment.LEVEL_1,
        });

        expect(applied).toBe(false);
        expect(calls).toEqual([]);
        expect(sent).toEqual([]);
    });
});

describe("ranked synergy pick", () => {
    test("refuses the opponent's team without touching the board or the server", () => {
        FightStateManager.getInstance().reset();
        const { scene, sent, calls } = makeRankedScene();

        expect(propagateSynergy(scene, TeamVals.UPPER)).toBe(false);
        expect(calls).toEqual([]);
        expect(sent).toEqual([]);
    });
});
