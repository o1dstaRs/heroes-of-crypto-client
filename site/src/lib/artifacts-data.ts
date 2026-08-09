// Army-wide artifacts chosen during the pick phase (one Tier 1 + one Tier 2 per team).
//
// DERIVED from the game, not mirrored by hand. This file used to carry its own copy of every effect string
// with the numbers already written in, and it silently went stale: a balance pass moved Rime Charm's proc
// 30% -> 60%, Helm of Focus 25% -> 35%, Giant's Maul 35% -> 40% and Iron Plate 0.7 -> 1, and the codex kept
// advertising the old figures. Reading the same ARTIFACT_POWER table the engine reads means the site cannot
// disagree with the game again, and a rebalance needs no edit here at all.

import {
    formatArtifactDescription,
    TIER1_ARTIFACT_LIST,
    TIER2_ARTIFACT_LIST,
    type ArtifactProperties,
} from "@heroesofcrypto/common/src/artifacts/artifact_properties";

export type ArtifactTier = 1 | 2;

export interface Artifact {
    tier: ArtifactTier;
    slug: string;
    name: string;
    icon: string;
    description: string;
    /** True for the "cursed" artifacts that carry a downside — surfaced as a small tag. */
    cursed?: boolean;
}

const icon = (tier: ArtifactTier, slug: string) => `/assets/images/artifacts/artifact_t${tier}_${slug}_256.webp`;

/**
 * The codex prints the effect on its own, so it drops the "Artifact." marker the in-game tooltip needs to
 * distinguish an artifact buff from a spell, and the trailing "Lasts till the end of the fight." line that
 * is true of every artifact and therefore says nothing on a page that lists only artifacts.
 */
const codexDescription = (props: ArtifactProperties): string =>
    formatArtifactDescription(props)
        .replace(/^Artifact\.\s*/, "")
        .replace(/\s*Lasts till the end of the fight\.\s*$/, "")
        .trim();

const toArtifact = (tier: ArtifactTier) => (props: ArtifactProperties) => ({
    tier,
    slug: props.slug,
    name: props.name,
    icon: icon(tier, props.slug),
    description: codexDescription(props),
    // The downside is stated by the effect text itself, so the tag follows it rather than being a second
    // fact to keep in sync.
    cursed: props.description.startsWith("Cursed:") || undefined,
});

// Both lists already exclude NO_ARTIFACT and anything disabled, so the codex shows exactly what a player
// can actually be offered in the pick phase.
export const artifacts: Artifact[] = [
    ...TIER1_ARTIFACT_LIST.map(toArtifact(1)),
    ...TIER2_ARTIFACT_LIST.map(toArtifact(2)),
];

export const artifactsCount = artifacts.length;
export const tier1Count = artifacts.filter((a) => a.tier === 1).length;
export const tier2Count = artifacts.filter((a) => a.tier === 2).length;
