import { Artifact } from "@heroesofcrypto/common";
import { describe, expect, test } from "bun:test";

import { observedDraftArtifactSlots } from "./observerPickArtifacts";

describe("spectator draft artifact slots", () => {
    test("shows both selected artifacts in their stable tiers", () => {
        const slots = observedDraftArtifactSlots({
            artifactTier1: Artifact.Tier1Artifact.IRON_PLATE,
            artifactTier2: Artifact.Tier2Artifact.CROWN_OF_COMMAND,
        });

        expect(slots.map(({ tier, artifactId }) => ({ tier, artifactId }))).toEqual([
            { tier: 1, artifactId: Artifact.Tier1Artifact.IRON_PLATE },
            { tier: 2, artifactId: Artifact.Tier2Artifact.CROWN_OF_COMMAND },
        ]);
        expect(slots[0].artifact?.name).toBe("Iron Plate");
        expect(slots[1].artifact?.name).toBe("Crown of Command");
    });

    test("keeps the Tier-2 slot empty until that artifact is selected", () => {
        const slots = observedDraftArtifactSlots({ artifactTier1: Artifact.Tier1Artifact.SWIFT_BOOTS });

        expect(slots[0].artifact?.name).toBe("Swift Boots");
        expect(slots[1]).toEqual({ tier: 2, artifactId: 0, artifact: undefined });
    });

    test("renders legacy, absent, and unknown values as unselected slots", () => {
        expect(observedDraftArtifactSlots()).toEqual([
            { tier: 1, artifactId: 0, artifact: undefined },
            { tier: 2, artifactId: 0, artifact: undefined },
        ]);
        expect(observedDraftArtifactSlots({ artifactTier1: 999, artifactTier2: -1 })).toEqual([
            { tier: 1, artifactId: 999, artifact: undefined },
            { tier: 2, artifactId: -1, artifact: undefined },
        ]);
    });
});
