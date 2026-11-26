import type { FlagPopKind } from "./CommonFlagPops";

export type FlagPopPresentation = "combat" | "preview";

const STATUS_NAMES: Partial<Record<FlagPopKind, string>> = {
    blacksmith_craft: "Craft",
    blacksmith_double_punch: "Crafted Double Punch",
    blacksmith_double_shot: "Crafted Double Shot",
    blacksmith_frozen_sword: "Crafted Frozen Sword",
    blacksmith_frozen_bow: "Crafted Frozen Bow",
    blacksmith_armor: "Armor Rune",
    blacksmith_weapon: "Weapon Rune",
    ogre_riot: "Riot",
    ogre_magic_mirror: "Magic Mirror",
    satyr_courage: "Courage",
    satyr_helping_hand: "Helping Hand",
    mage_misfortune: "Misfortune",
    mage_fireforged: "Fireforged Sword",
    hamstring: "Hamstrung",
    unicorn_blindness: "Blindness",
};

export function statusFlagName(kind: FlagPopKind): string {
    return (
        STATUS_NAMES[kind] ??
        kind
            .split("_")
            .map((word) => word[0].toUpperCase() + word.slice(1))
            .join(" ")
    );
}

// Callers supply recorded applications, successful spell outcomes, or observed buff transitions.
// Owning a passive or modifying a hit is not a status application.
const STATUS_POP_KINDS: ReadonlySet<FlagPopKind> = new Set([
    "blacksmith_double_punch",
    "blacksmith_double_shot",
    "blacksmith_frozen_sword",
    "blacksmith_frozen_bow",
    "blacksmith_armor",
    "blacksmith_weapon",
    "ogre_riot",
    "ogre_magic_mirror",
    "satyr_courage",
    "satyr_helping_hand",
    "mage_misfortune",
    "mage_fireforged",
    "aggr",
    "miner",
    "stun",
    "paralysis",
    "empower",
    "dulling_defense",
    "hamstring",
    "shatter_armor",
    "wind_flow",
    "unicorn_blindness",
    "made_of_fire",
    "absolving_arrow",
]);

export function shouldShowStatusFlagPop(kind: FlagPopKind, presentation: FlagPopPresentation): boolean {
    // Craft is an explicit cast cue. Other passive/attack badges still require a confirmed status.
    // A recorded miss is shown too: a dodged counter plays inside the simultaneous exchange, where the dodger
    // is mid-swing and skips its dodge, so a brief text was all there was (owner, game 00889997, 2026-11-26).
    return presentation === "preview" || kind === "blacksmith_craft" || kind === "miss" || STATUS_POP_KINDS.has(kind);
}
