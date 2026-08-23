import { CreatureVals } from "@heroesofcrypto/common";
import { images } from "../generated/image_imports";

// Numeric fallbacks keep the client usable during a rolling common/client deploy (or before a local common
// rebuild refreshes dist). The generated enum is authoritative as soon as the new values are available.
const extendedCreatureVals = CreatureVals as typeof CreatureVals & {
    readonly ARACHNA_QUEEN?: number;
    readonly ARACHNA_SPIDER?: number;
    readonly MAGIC_DRAGON?: number;
};
const ARACHNA_QUEEN_CREATURE_ID = extendedCreatureVals.ARACHNA_QUEEN ?? 44;
const ARACHNA_SPIDER_CREATURE_ID = extendedCreatureVals.ARACHNA_SPIDER ?? 45;
const MAGIC_DRAGON_CREATURE_ID = extendedCreatureVals.MAGIC_DRAGON ?? 57;

export const UNIT_ID_TO_IMAGE: Record<number, string> = {
    [CreatureVals.NO_CREATURE]: images.unknown_creature_512,
    // The legacy 512px Orc portrait is a circular medallion rather than a clean creature cutout.
    // Use the transparent model source so framing remains consistent with the rest of the roster.
    [CreatureVals.ORC]: images.orc_model_full,
    [CreatureVals.SCAVENGER]: images.thief_model_full,
    [CreatureVals.TROGLODYTE]: images.troglodyte_512,
    [CreatureVals.TROLL]: images.pick_l2_legacy_troll_512,
    [CreatureVals.MEDUSA]: images.pick_l2_legacy_medusa_512,
    [CreatureVals.BEHOLDER]: images.pick_l2_legacy_beholder_512,
    [CreatureVals.GOBLIN_KNIGHT]: images.goblin_knight_512,
    [CreatureVals.EFREET]: images.efreet_512,
    [CreatureVals.BLACK_DRAGON]: images.black_dragon_512,
    [CreatureVals.HYDRA]: images.hydra_512,
    [CreatureVals.ABOMINATION]: images.abomination_512,
    [CreatureVals.CENTAUR]: images.centaur_512,
    [CreatureVals.BERSERKER]: images.berserker_512,
    [CreatureVals.WOLF_RIDER]: images.wolf_rider_512,
    [CreatureVals.MERMAID]: images.mermaid_512,
    [CreatureVals.DRYAD]: images.dryad_512,
    [CreatureVals.BLACKSMITH]: images.blacksmith_512,
    [CreatureVals.ZENA]: images.zena_512,
    [CreatureVals.TRENT]: images.pick_l2_legacy_trent_512,
    [CreatureVals.WYVERN]: images.pick_l2_legacy_wyvern_512,
    [CreatureVals.HARPY]: images.pick_l2_legacy_harpy_512,
    [CreatureVals.NOMAD]: images.pick_l2_legacy_nomad_512,
    [CreatureVals.HYENA]: images.pick_l2_legacy_hyena_512,
    [CreatureVals.CYCLOPS]: images.cyclops_512,
    [CreatureVals.OGRE_MAGE]: images.ogre_mage_512,
    [CreatureVals.THUNDERBIRD]: images.thunderbird_512_v2,
    [CreatureVals.BEHEMOTH]: images.behemoth_512,
    [CreatureVals.FRENZIED_BOAR]: images.frenzied_boar_512,
    // wolf_512 is cropped through the muzzle at its right canvas edge. That hard source edge became
    // visible when the portrait was shifted left in the framing editor.
    [CreatureVals.WOLF]: images.wolf_portrait_full,
    [CreatureVals.FAIRY]: images.fairy_512,
    [CreatureVals.LEPRECHAUN]: images.leprechaun_512,
    [CreatureVals.ELF]: images.pick_l2_legacy_elf_512,
    [CreatureVals.WHITE_TIGER]: images.pick_l2_legacy_white_tiger_512,
    [CreatureVals.SATYR]: images.pick_l2_legacy_satyr_512,
    [CreatureVals.MANTIS]: images.mantis_512,
    [CreatureVals.UNICORN]: images.unicorn_512,
    [CreatureVals.GARGANTUAN]: images.gargantuan_512,
    [CreatureVals.PEGASUS]: images.pegasus_512,
    [ARACHNA_QUEEN_CREATURE_ID]: images.arachna_queen_512,
    [ARACHNA_SPIDER_CREATURE_ID]: images.arachna_spider_512,
    [CreatureVals.PEASANT]: images.peasant_512,
    [CreatureVals.SQUIRE]: images.squire_512,
    [CreatureVals.ARBALESTER]: images.arbalester_512,
    // Keep pick portraits independent from battlefield sprites. The L2 battle-art pass intentionally
    // replaced the live *_512 files, while these reviewed snapshots preserve the approved roster cards.
    [CreatureVals.VALKYRIE]: images.pick_l2_legacy_valkyrie_512,
    [CreatureVals.PIKEMAN]: images.pick_l2_legacy_pikeman_512,
    [CreatureVals.HEALER]: images.pick_l2_legacy_healer_512,
    [CreatureVals.GRIFFIN]: images.griffin_512,
    [CreatureVals.CRUSADER]: images.crusader_512,
    [CreatureVals.TSAR_CANNON]: images.tsar_cannon_512,
    [CreatureVals.ANGEL]: images.angel_512,
    [CreatureVals.CHAMPION]: images.champion_512,
    [CreatureVals.ASH_MOTH]: images.wandering_mage_512,
    [CreatureVals.MONK]: images.monk_512,
    [CreatureVals.MANTICORE]: images.pick_l2_legacy_manticore_512,
    [CreatureVals.BATTLE_MAGE]: images.pick_l2_legacy_battle_mage_512,
    [CreatureVals.NIGHTMARE]: images.nightmare_512,
    [MAGIC_DRAGON_CREATURE_ID]: images.magic_dragon_512,
};

export const UNIT_ID_TO_NAME: Readonly<Record<number, string>> = {
    [CreatureVals.NO_CREATURE]: "Unknown",
    [CreatureVals.ORC]: "Orc",
    [CreatureVals.SCAVENGER]: "Scavenger",
    [CreatureVals.TROGLODYTE]: "Troglodyte",
    [CreatureVals.TROLL]: "Troll",
    [CreatureVals.MEDUSA]: "Medusa",
    [CreatureVals.BEHOLDER]: "Beholder",
    [CreatureVals.GOBLIN_KNIGHT]: "Goblin Knight",
    [CreatureVals.EFREET]: "Efreet",
    [CreatureVals.BLACK_DRAGON]: "Black Dragon",
    [CreatureVals.HYDRA]: "Hydra",
    [CreatureVals.ABOMINATION]: "Abomination",
    [CreatureVals.CENTAUR]: "Centaur",
    [CreatureVals.BERSERKER]: "Berserker",
    [CreatureVals.WOLF_RIDER]: "Wolf Rider",
    [CreatureVals.MERMAID]: "Mermaid",
    [CreatureVals.DRYAD]: "Dryad",
    [CreatureVals.BLACKSMITH]: "Blacksmith",
    [CreatureVals.ZENA]: "Zena",
    [CreatureVals.TRENT]: "Trent",
    [CreatureVals.WYVERN]: "Wyvern",
    [CreatureVals.HARPY]: "Harpy",
    [CreatureVals.NOMAD]: "Nomad",
    [CreatureVals.HYENA]: "Hyena",
    [CreatureVals.CYCLOPS]: "Cyclops",
    [CreatureVals.OGRE_MAGE]: "Ogre Mage",
    [CreatureVals.THUNDERBIRD]: "Thunderbird",
    [CreatureVals.BEHEMOTH]: "Behemoth",
    [CreatureVals.FRENZIED_BOAR]: "Frenzied Boar",
    [CreatureVals.WOLF]: "Wolf",
    [CreatureVals.FAIRY]: "Fairy",
    [CreatureVals.LEPRECHAUN]: "Leprechaun",
    [CreatureVals.ELF]: "Elf",
    [CreatureVals.WHITE_TIGER]: "White Tiger",
    [CreatureVals.SATYR]: "Satyr",
    [CreatureVals.MANTIS]: "Mantis",
    [CreatureVals.UNICORN]: "Unicorn",
    [CreatureVals.GARGANTUAN]: "Gargantuan",
    [CreatureVals.PEGASUS]: "Pegasus",
    [ARACHNA_QUEEN_CREATURE_ID]: "Arachna Queen",
    [ARACHNA_SPIDER_CREATURE_ID]: "Arachna Spider",
    [CreatureVals.PEASANT]: "Peasant",
    [CreatureVals.SQUIRE]: "Squire",
    [CreatureVals.ARBALESTER]: "Arbalester",
    [CreatureVals.VALKYRIE]: "Valkyrie",
    [CreatureVals.PIKEMAN]: "Pikeman",
    [CreatureVals.HEALER]: "Healer",
    [CreatureVals.GRIFFIN]: "Griffin",
    [CreatureVals.CRUSADER]: "Crusader",
    [CreatureVals.TSAR_CANNON]: "Tsar Cannon",
    [CreatureVals.ANGEL]: "Angel",
    [CreatureVals.CHAMPION]: "Champion",
    [CreatureVals.ASH_MOTH]: "Wandering Mage",
    [CreatureVals.MONK]: "Monk",
    [CreatureVals.MANTICORE]: "Manticore",
    [CreatureVals.BATTLE_MAGE]: "Battle Mage",
    [CreatureVals.NIGHTMARE]: "Nightmare",
    [MAGIC_DRAGON_CREATURE_ID]: "Magic Dragon",
};

/** Reverse lookup for UI payloads that still carry a creature name instead of its numeric id. */
export const UNIT_NAME_TO_ID: Readonly<Record<string, number>> = Object.freeze(
    Object.fromEntries(Object.entries(UNIT_ID_TO_NAME).map(([creatureId, name]) => [name, Number(creatureId)])),
);

const generatedImageMap = images as Readonly<Record<string, string | undefined>>;

/**
 * Uncropped artwork for portrait framing. Most sources are promoted from the reviewed full-body feed;
 * the three authored exceptions already had a production-ready full-height model under another key.
 */
export const fullBodyCreatureImage = (creatureId: number): string | undefined => {
    if (creatureId === CreatureVals.ORC) return images.orc_model_full;
    if (creatureId === CreatureVals.SCAVENGER) return images.thief_model_full;
    if (creatureId === CreatureVals.ASH_MOTH) return images.wandering_mage_portrait_full;
    if (creatureId === CreatureVals.EFREET) return images.efreet_portrait_full_v7;
    if (creatureId === CreatureVals.MANTIS) return images.mantis_portrait_full_v3;
    if (creatureId === CreatureVals.THUNDERBIRD) return images.thunderbird_portrait_full_v2;
    const slug = UNIT_ID_TO_NAME[creatureId]?.toLowerCase().replaceAll(" ", "_");
    return slug ? generatedImageMap[`${slug}_portrait_full`] : undefined;
};
