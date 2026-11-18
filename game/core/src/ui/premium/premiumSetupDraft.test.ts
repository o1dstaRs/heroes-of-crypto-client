import { expect, test } from "bun:test";
import { CreatureVals, GridVals, TeamVals } from "@heroesofcrypto/common";
import type { PlaySnapshot } from "../../api/play_protocol";
import { premiumSetupDraft } from "./premiumSetupDraft";
import { projectPremiumDraft } from "./premiumDraftProjection";

const snapshot = () =>
    ({
        gameId: "setup-planner",
        gridType: GridVals.NORMAL,
        placementSplit: true,
        placementStage: 0,
        leftDoctrine: 1,
        rightDoctrine: 2,
        leftArtifactTier1: 1,
        rightArtifactTier1: 2,
        leftAugmentPlacement: 0,
        rightAugmentPlacement: 2,
        units: [
            { creatureId: CreatureVals.PEASANT, team: TeamVals.LEFT, amountAlive: 100, dead: false },
            { creatureId: CreatureVals.ORC, team: TeamVals.RIGHT, amountAlive: 40, dead: false },
        ],
    }) as PlaySnapshot;

test("setup retains the viewer's army, artifacts and doctrine from either seat", () => {
    const s = snapshot();
    for (const team of [TeamVals.LEFT, TeamVals.RIGHT]) {
        const draft = premiumSetupDraft(s, team);
        const left = team === TeamVals.LEFT;
        expect(draft.picked).toEqual([left ? CreatureVals.PEASANT : CreatureVals.ORC]);
        expect(draft.doctrine).toBe(left ? 1 : 2);
        expect(draft.artifactTier1).toBe(left ? 1 : 2);
        expect(draft.isYourTurn).toBe(false);
        expect(projectPremiumDraft(draft).own[0].amount).toBe(left ? 100 : 40);
    }
});

test("the setup planner obeys the hidden-opponent policy instead of rebuilding the private army", () => {
    const s = { ...snapshot(), hideOpponentRosterDuringSetup: true };
    expect(premiumSetupDraft(s, TeamVals.LEFT).opponentPicked).toEqual([]);
    expect(projectPremiumDraft(premiumSetupDraft(s, TeamVals.LEFT)).enemy).toEqual([]);
    s.placementStage = 1;
    expect(premiumSetupDraft(s, TeamVals.LEFT).opponentPicked).toEqual([CreatureVals.ORC]);
});

test("selected placement and stack counts update the projected setup without changing the snapshot", () => {
    const s = snapshot();
    const before = JSON.stringify(s);
    const initial = projectPremiumDraft(premiumSetupDraft(s, TeamVals.LEFT));
    expect(JSON.stringify(s)).toBe(before);
    const changed = { ...s, leftAugmentPlacement: 3, units: s.units.map((unit) => ({ ...unit, amountAlive: 175 })) };
    const plan = projectPremiumDraft(premiumSetupDraft(changed, TeamVals.LEFT));
    expect(initial.own[0].amount).toBe(100);
    expect(plan.own[0].amount).toBe(175);
    expect(plan.own[0].position.x).toBeGreaterThan(initial.own[0].position.x);
    expect(plan.setup).toBe(true);
});
