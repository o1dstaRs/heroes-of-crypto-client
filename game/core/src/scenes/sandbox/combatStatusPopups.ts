import type { FlagPopKind } from "./CommonFlagPops";

export type FlagPopPresentation = "combat" | "preview";

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
    return presentation === "preview" || STATUS_POP_KINDS.has(kind);
}
