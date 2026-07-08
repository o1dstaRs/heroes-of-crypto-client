// Army-wide artifacts chosen during the pick phase (one Tier 1 + one Tier 2 per team). Mirrors the
// game's game/heroes-of-crypto-common/src/artifacts/artifact_properties.ts — names, tiers, slugs and
// images are kept in sync with it; descriptions here have the {} / [] power placeholders already filled
// with the ARTIFACT_POWER values so the codex reads cleanly.

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

const t1 = (slug: string, name: string, description: string, cursed = false): Artifact => ({
    tier: 1,
    slug,
    name,
    icon: icon(1, slug),
    description,
    cursed,
});

const t2 = (slug: string, name: string, description: string, cursed = false): Artifact => ({
    tier: 2,
    slug,
    name,
    icon: icon(2, slug),
    description,
    cursed,
});

export const artifacts: Artifact[] = [
    // Tier 1
    t1("veteran_helm", "Veteran Helm", "Boosts the entire army's attack and defense by 5%."),
    t1("amulet_of_resolve", "Amulet of Resolve", "Increases the army's status resistance by 25%."),
    t1("keen_blade", "Keen Blade", "Increases the army's attack by 1."),
    t1("iron_plate", "Iron Plate", "Increases the army's defense by 1."),
    t1("swift_boots", "Swift Boots", "Grants +1 movement to melee units."),
    t1("winged_boots", "Winged Boots", "Grants +1 movement to flying units."),
    t1("dual_strike_charm", "Dual Strike Charm", "A unit's second attack deals 50% extra damage."),
    t1("wounding_charm", "Wounding Charm", "Adds +1 Deep Wounds stack for the whole army."),
    t1("cursed_ward", "Cursed Ward", "Cursed: +5 luck but -5 morale for the whole army.", true),
    t1(
        "hunters_longbow",
        "Hunter's Longbow",
        "Ranged units gain +15% attack and -15% defense (or +30% attack with 3+ archers).",
    ),
    t1("helm_of_focus", "Helm of Focus", "Increases the army's mind resistance by 25%."),
    t1(
        "broken_aegis",
        "Broken Aegis",
        "Cursed: the wielder's attacks have a 15% chance to Break the enemy they hit (muting its abilities), at the cost of a 5% chance to miss.",
        true,
    ),
    // Tier 2
    t2("warlords_edge", "Warlord's Edge", "Increases the army's attack by 15%."),
    t2("titan_plate", "Titan Plate", "Increases the army's defense by 15%."),
    t2("holy_cross", "Holy Cross", "+50% healing and resurrection; the Troll's ability is not consumed on cast."),
    t2("clover_of_fortune", "Clover of Fortune", "Increases the army's luck by 10."),
    t2("crown_of_command", "Crown of Command", "Grants +1 movement and +2 morale to the whole army."),
    t2("giants_maul", "Giant's Maul", "Mass/area units deal +35% damage to all non-primary targets."),
    t2("pendant_of_vitality", "Pendant of Vitality", "Cursed: +25% HP but -20% attack for the whole army.", true),
    t2("farsight_quiver", "Farsight Quiver", "All allied archers shoot at full arrow (no distance penalty)."),
    t2("berserkers_bond", "Berserker's Bond", "Cursed: +3 attack but -3 defense for the whole army.", true),
    t2("tome_of_amplification", "Tome of Amplification", "Increases the power of all buffs by 50%."),
    t2("rime_charm", "Rime Charm", "30% chance for any attack to slow the target for 3 laps."),
    t2("lava_striders", "Lava Striders", "All of the army's units may move over lava."),
];

export const artifactsCount = artifacts.length;
export const tier1Count = artifacts.filter((a) => a.tier === 1).length;
export const tier2Count = artifacts.filter((a) => a.tier === 2).length;
