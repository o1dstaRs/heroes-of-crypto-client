import { describe, expect, test } from "bun:test";

import { Artifact, Augment, FightProperties, TeamVals } from "@heroesofcrypto/common";

import { captureFightSetupForHydration, restoreFightSetupAfterHydrationReset } from "./Sandbox";

describe("authoritative Sandbox setup hydration", () => {
    test("preserves both artifact tiers across the FightProperties reset", () => {
        const beforeReset = new FightProperties();
        beforeReset.setDefaultPlacementPerTeam(TeamVals.LEFT, Augment.DefaultPlacementLevel1.THREE_BY_THREE);
        beforeReset.setDefaultPlacementPerTeam(TeamVals.RIGHT, Augment.DefaultPlacementLevel1.THREE_BY_THREE);
        expect(
            beforeReset.setArtifactPerTeam(
                TeamVals.LEFT,
                Artifact.ArtifactTier.TIER_1,
                Artifact.Tier1Artifact.WINGED_BOOTS,
            ),
        ).toBe(true);
        expect(
            beforeReset.setArtifactPerTeam(
                TeamVals.LEFT,
                Artifact.ArtifactTier.TIER_2,
                Artifact.Tier2Artifact.CROWN_OF_COMMAND,
            ),
        ).toBe(true);

        const priorSetup = captureFightSetupForHydration(beforeReset);
        const afterReset = new FightProperties();
        afterReset.setDefaultPlacementPerTeam(TeamVals.LEFT, Augment.DefaultPlacementLevel1.THREE_BY_THREE);
        afterReset.setDefaultPlacementPerTeam(TeamVals.RIGHT, Augment.DefaultPlacementLevel1.THREE_BY_THREE);

        expect(afterReset.getArtifactTier1(TeamVals.LEFT)).toBe(Artifact.Tier1Artifact.NO_ARTIFACT);
        expect(afterReset.getArtifactTier2(TeamVals.LEFT)).toBe(Artifact.Tier2Artifact.NO_ARTIFACT);

        restoreFightSetupAfterHydrationReset(afterReset, priorSetup);

        expect(afterReset.getArtifactTier1(TeamVals.LEFT)).toBe(Artifact.Tier1Artifact.WINGED_BOOTS);
        expect(afterReset.getArtifactTier2(TeamVals.LEFT)).toBe(Artifact.Tier2Artifact.CROWN_OF_COMMAND);
    });
});
