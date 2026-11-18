import { catalogIconUrl } from "./catalog-icon";

/** The same variant artwork used by the game's synergy slots. */
const icons = {
    "Life:1": "/assets/images/synergies/synergy_supply_256.webp",
    "Life:2": "/assets/images/synergies/synergy_morale_256.webp",
    "Nature:1": "/assets/images/synergies/synergy_increase_board_units_256.webp",
    "Nature:2": "/assets/images/synergies/synergy_plus_fly_armor_256.webp",
    "Chaos:1": "/assets/images/synergies/synergy_movement_256.webp",
    "Chaos:2": "/assets/images/synergies/synergy_break_on_attack_256.webp",
    "Might:1": "/assets/images/synergies/synergy_auras_range_256.webp",
    "Might:2": "/assets/images/synergies/synergy_abilities_power_256.webp",
};

export const synergyIcons: Readonly<Record<string, string>> = Object.fromEntries(
    Object.entries(icons).map(([key, path]) => [key, catalogIconUrl(path)]),
);
