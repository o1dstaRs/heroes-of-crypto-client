// Use export to silence "defined but never used" if it's meant to be a module, or just remove if truly dead.
export const SynergyKeysToPower: Record<string, number> = {};

const synergyAbilitiesPowerImg = new URL(
    "../../../images/synergy_abilities_power_256.webp",
    import.meta.url,
).toString();
const synergyAurasRangeImg = new URL("../../../images/synergy_auras_range_256.webp", import.meta.url).toString();
const synergyBreakOnAttackImg = new URL("../../../images/synergy_break_on_attack_256.webp", import.meta.url).toString();
const synergyIncreaseBoardUnitsImg = new URL(
    "../../../images/synergy_increase_board_units_256.webp",
    import.meta.url,
).toString();
const synergyMoraleImg = new URL("../../../images/synergy_morale_256.webp", import.meta.url).toString();
const synergyPlusFlyArmorImg = new URL("../../../images/synergy_plus_fly_armor_256.webp", import.meta.url).toString();
const synergyMovementImg = new URL("../../../images/synergy_movement_256.webp", import.meta.url).toString();
const synergySupplyImg = new URL("../../../images/synergy_supply_256.webp", import.meta.url).toString();

export const SYNERGY_NAME_TO_DESCRIPTION = {
    "Life:1:1": "Increases each unit's supply by {}% at the start of the battle",
    "Life:2:1": "The entire army gets +{} morale and +{} luck",
    "Life:1:2": "Increases each unit's supply by {}% at the start of the battle",
    "Life:2:2": "The entire army gets +{} morale and +{} luck",
    "Life:1:3": "Increases each unit's supply by {}% at the start of the battle",
    "Life:2:3": "The entire army gets +{} morale and +{} luck",
    "Chaos:1:1": "Improves movement steps by {} cells",
    "Chaos:2:1": "{}% chance to apply Break on attack which disables enemy abilities for 1 turn",
    "Chaos:1:2": "Improves movement steps by {} cells",
    "Chaos:2:2": "{}% chance to apply Break on attack which disables enemy abilities for 1 turn",
    "Chaos:1:3": "Improves movement steps by {} cells",
    "Chaos:2:3": "{}% chance to apply Break on attack which disables enemy abilities for 1 turn",
    "Might:1:1": "Increase auras range by {} cells",
    "Might:2:1": "Increase stack abilities power by {}%",
    "Might:1:2": "Increase auras range by {} cells",
    "Might:2:2": "Increase stack abilities power by {}%",
    "Might:1:3": "Increase auras range by {} cells",
    "Might:2:3": "Increase stack abilities power by {}%",
    "Nature:1:1": "Team can place {} more units on the board",
    "Nature:2:1": "Flying units get +{}% of additional armor",
    "Nature:1:2": "Team can place {} more units on the board",
    "Nature:2:2": "Flying units get +{}% of additional armor",
    "Nature:1:3": "Team can place {} more units on the board",
    "Nature:2:3": "Flying units get +{}% of additional armor",
};

export const SYNERGY_KEY_TO_IMAGE = {
    "Life:1:1": synergySupplyImg,
    "Life:2:1": synergyMoraleImg,
    "Life:1:2": synergySupplyImg,
    "Life:2:2": synergyMoraleImg,
    "Life:1:3": synergySupplyImg,
    "Life:2:3": synergyMoraleImg,
    "Chaos:1:1": synergyMovementImg,
    "Chaos:2:1": synergyBreakOnAttackImg,
    "Chaos:1:2": synergyMovementImg,
    "Chaos:2:2": synergyBreakOnAttackImg,
    "Chaos:1:3": synergyMovementImg,
    "Chaos:2:3": synergyBreakOnAttackImg,
    "Might:1:1": synergyAurasRangeImg,
    "Might:2:1": synergyAbilitiesPowerImg,
    "Might:1:2": synergyAurasRangeImg,
    "Might:2:2": synergyAbilitiesPowerImg,
    "Might:1:3": synergyAurasRangeImg,
    "Might:2:3": synergyAbilitiesPowerImg,
    "Nature:1:1": synergyIncreaseBoardUnitsImg,
    "Nature:2:1": synergyPlusFlyArmorImg,
    "Nature:1:2": synergyIncreaseBoardUnitsImg,
    "Nature:2:2": synergyPlusFlyArmorImg,
    "Nature:1:3": synergyIncreaseBoardUnitsImg,
    "Nature:2:3": synergyPlusFlyArmorImg,
};
