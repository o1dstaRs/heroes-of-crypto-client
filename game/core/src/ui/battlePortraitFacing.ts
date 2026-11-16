import type { BattleUnitFacing } from "../pixi/battleUnitFacing";

/** Facing after the approved card/portrait mirroring, measured from the current art. Front poses use their body angle. */
const LEFT_FACING_PORTRAITS: ReadonlySet<string> = new Set([
    "Orc",
    "Scavenger",
    "Troglodyte",
    "Troll",
    "Medusa",
    "Beholder",
    "Goblin Knight",
    "Efreet",
    "Black Dragon",
    "Hydra",
    "Centaur",
    "Berserker",
    "Wolf Rider",
    "Harpy",
    "Nomad",
    "Hyena",
    "Cyclops",
    "Ogre Mage",
    "Thunderbird",
    "Behemoth",
    "Valkyrie",
    "Abomination",
    "Frenzied Boar",
    "Arachna Queen",
    "Arachna Spider",
    "Wandering Mage",
    "Zena",
    "Wyvern",
    "Trent",
    "Manticore",
    "Nightmare",
]);
export function battlePortraitFacingScale(name: string, facing: BattleUnitFacing | undefined): BattleUnitFacing {
    if (facing === undefined) return 1;
    const authoredFacing = LEFT_FACING_PORTRAITS.has(name) ? -1 : 1;
    return (facing * authoredFacing) as BattleUnitFacing;
}
