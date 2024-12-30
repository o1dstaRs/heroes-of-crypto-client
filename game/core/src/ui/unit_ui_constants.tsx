import { Creature } from "@heroesofcrypto/common/src/generated/protobuf/v1/types_pb";
import { images } from "../generated/image_imports";

export const UNIT_ID_TO_IMAGE: Record<number, string> = {
    [Creature.NO_CREATURE]: images.unknown_creature_512,
    [Creature.ORC]: images.orc_512,
    [Creature.SCAVENGER]: images.scavenger_512,
    [Creature.TROGLODYTE]: images.troglodyte_512,
    [Creature.TROLL]: images.troll_512,
    [Creature.MEDUSA]: images.medusa_512,
    [Creature.BEHOLDER]: images.beholder_512,
    [Creature.GOBLIN_KNIGHT]: images.goblin_knight_512,
    [Creature.EFREET]: images.efreet_512,
    [Creature.BLACK_DRAGON]: images.black_dragon_512,
    [Creature.HYDRA]: images.hydra_512,
    [Creature.CENTAUR]: images.centaur_512,
    [Creature.BERSERKER]: images.berserker_512,
    [Creature.WOLF_RIDER]: images.wolf_rider_512,
    [Creature.HARPY]: images.harpy_512,
    [Creature.NOMAD]: images.nomad_512,
    [Creature.HYENA]: images.hyena_512,
    [Creature.CYCLOPS]: images.cyclops_512,
    [Creature.OGRE_MAGE]: images.ogre_mage_512,
    [Creature.THUNDERBIRD]: images.thunderbird_512,
    [Creature.BEHEMOTH]: images.behemoth_512,
    [Creature.WOLF]: images.wolf_512,
    [Creature.FAIRY]: images.fairy_512,
    [Creature.LEPRECHAUN]: images.leprechaun_512,
    [Creature.ELF]: images.elf_512,
    [Creature.WHITE_TIGER]: images.white_tiger_512,
    [Creature.SATYR]: images.satyr_512,
    [Creature.MANTIS]: images.mantis_512,
    [Creature.UNICORN]: images.unicorn_512,
    [Creature.GARGANTUAN]: images.gargantuan_512,
    [Creature.PEGASUS]: images.pegasus_512,
    [Creature.PEASANT]: images.peasant_512,
    [Creature.SQUIRE]: images.squire_512,
    [Creature.ARBALESTER]: images.arbalester_512,
    [Creature.VALKYRIE]: images.valkyrie_512,
    [Creature.PIKEMAN]: images.pikeman_512,
    [Creature.HEALER]: images.healer_512,
    [Creature.GRIFFIN]: images.griffin_512,
    [Creature.CRUSADER]: images.crusader_512,
    [Creature.TSAR_CANNON]: images.tsar_cannon_512,
    [Creature.ANGEL]: images.angel_512,
};

export const UNIT_ID_TO_NAME: Record<number, string> = {
    [Creature.NO_CREATURE]: "Unknown",
    [Creature.ORC]: "Orc",
    [Creature.SCAVENGER]: "Scavenger",
    [Creature.TROGLODYTE]: "Troglodyte",
    [Creature.TROLL]: "Troll",
    [Creature.MEDUSA]: "Medusa",
    [Creature.BEHOLDER]: "Beholder",
    [Creature.GOBLIN_KNIGHT]: "Goblin Knight",
    [Creature.EFREET]: "Efreet",
    [Creature.BLACK_DRAGON]: "Black Dragon",
    [Creature.HYDRA]: "Hydra",
    [Creature.CENTAUR]: "Centaur",
    [Creature.BERSERKER]: "Berserker",
    [Creature.WOLF_RIDER]: "Wolf Rider",
    [Creature.HARPY]: "Harpy",
    [Creature.NOMAD]: "Nomad",
    [Creature.HYENA]: "Hyena",
    [Creature.CYCLOPS]: "Cyclops",
    [Creature.OGRE_MAGE]: "Ogre Mage",
    [Creature.THUNDERBIRD]: "Thunderbird",
    [Creature.BEHEMOTH]: "Behemoth",
    [Creature.WOLF]: "Wolf",
    [Creature.FAIRY]: "Fairy",
    [Creature.LEPRECHAUN]: "Leprechaun",
    [Creature.ELF]: "Elf",
    [Creature.WHITE_TIGER]: "White Tiger",
    [Creature.SATYR]: "Satyr",
    [Creature.MANTIS]: "Mantis",
    [Creature.UNICORN]: "Unicorn",
    [Creature.GARGANTUAN]: "Gargantuan",
    [Creature.PEGASUS]: "Pegasus",
    [Creature.PEASANT]: "Peasant",
    [Creature.SQUIRE]: "Squire",
    [Creature.ARBALESTER]: "Arbalester",
    [Creature.VALKYRIE]: "Valkyrie",
    [Creature.PIKEMAN]: "Pikeman",
    [Creature.HEALER]: "Healer",
    [Creature.GRIFFIN]: "Griffin",
    [Creature.CRUSADER]: "Crusader",
    [Creature.TSAR_CANNON]: "Tsar Cannon",
    [Creature.ANGEL]: "Angel",
};