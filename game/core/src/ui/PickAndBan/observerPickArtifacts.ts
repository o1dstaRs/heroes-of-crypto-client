import { Artifact } from "@heroesofcrypto/common";

export type ObservedDraftArtifactTier = 1 | 2;

export interface ObservedDraftArtifactSlot {
    tier: ObservedDraftArtifactTier;
    artifactId: number;
    artifact?: Artifact.ArtifactProperties;
}

interface PickObserveArtifactTeam {
    artifactTier1?: number;
    artifactTier2?: number;
}

const artifactForTier = (
    tier: ObservedDraftArtifactTier,
    artifactId: number,
): Artifact.ArtifactProperties | undefined => {
    if (!Number.isInteger(artifactId) || artifactId <= 0) {
        return undefined;
    }
    return tier === 1
        ? Artifact.TIER1_ARTIFACTS[artifactId as Artifact.Tier1Artifact]
        : Artifact.TIER2_ARTIFACTS[artifactId as Artifact.Tier2Artifact];
};

/** Stable Tier-1/Tier-2 observer slots; missing and legacy-server values remain visibly unselected. */
export const observedDraftArtifactSlots = (
    team?: PickObserveArtifactTeam,
): [ObservedDraftArtifactSlot, ObservedDraftArtifactSlot] => {
    const tier1Id = team?.artifactTier1 ?? 0;
    const tier2Id = team?.artifactTier2 ?? 0;
    return [
        { tier: 1, artifactId: tier1Id, artifact: artifactForTier(1, tier1Id) },
        { tier: 2, artifactId: tier2Id, artifact: artifactForTier(2, tier2Id) },
    ];
};
