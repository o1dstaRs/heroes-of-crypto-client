import { SynergyKeysToPower } from "@heroesofcrypto/common";
import Box from "@mui/joy/Box";
import Tooltip from "@mui/joy/Tooltip";
import React from "react";
import synergyAbilitiesPowerImg from "../../../images/synergy_abilities_power_256.webp";
import synergyAurasRangeImg from "../../../images/synergy_auras_range_256.webp";
import synergyBreakOnAttackImg from "../../../images/synergy_break_on_attack_256.webp";
import synergyIncreaseBoardUnitsImg from "../../../images/synergy_increase_board_units_256.webp";
import synergyMoraleImg from "../../../images/synergy_morale_256.webp";
import synergyPlusFlyArmorImg from "../../../images/synergy_plus_fly_armor_256.webp";
import synergyMovementImg from "../../../images/synergy_movement_256.webp";
import synergySupplyImg from "../../../images/synergy_supply_256.webp";

const SYNERGY_NAME_TO_DESCRIPTION = {
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

const SynergiesRow = ({ synergies }: { synergies: string[] }) => {
    // Sort synergies by level in descending order
    const sortedSynergies = [...synergies].sort((a, b) => {
        const partsA = a.split(":");
        const partsB = b.split(":");

        const levelA = partsA.length >= 3 ? parseInt(partsA[2]) : 0;
        const levelB = partsB.length >= 3 ? parseInt(partsB[2]) : 0;

        return levelB - levelA;
    });

    return (
        <Box
            sx={{
                display: "flex",
                gap: 1,
                height: "40px", // 32px for images + 4px padding top and bottom
                alignItems: "center",
            }}
        >
            {sortedSynergies.map((synergyKey, index) => {
                const level = synergyKey.split(":").length < 3 ? 0 : parseInt(synergyKey.split(":")[2]);
                let dotColor: string;

                if (synergyKey.startsWith("Nature:")) {
                    dotColor = "green";
                } else if (synergyKey.startsWith("Life:")) {
                    dotColor = "rgb(213, 167, 74)";
                } else if (synergyKey.startsWith("Chaos:")) {
                    dotColor = "rgb(216, 92, 40)";
                } else if (synergyKey.startsWith("Might:")) {
                    dotColor = "rgb(211, 38, 31)";
                } else {
                    dotColor = "gray";
                }

                return (
                    <Box key={index} sx={{ textAlign: "center" }}>
                        <Tooltip
                            title={`Level ${level}: ${(
                                SYNERGY_NAME_TO_DESCRIPTION[synergyKey as keyof typeof SYNERGY_NAME_TO_DESCRIPTION] ||
                                "Unknown Synergy"
                            )
                                .replace(/\{\}/, SynergyKeysToPower[synergyKey]?.[0]?.toString() || "0")
                                .replace(/\{\}/, SynergyKeysToPower[synergyKey]?.[1]?.toString() || "0")}`}
                            placement="bottom"
                        >
                            <Box
                                component="img"
                                src={SYNERGY_KEY_TO_IMAGE[synergyKey as keyof typeof SYNERGY_KEY_TO_IMAGE]}
                                sx={{
                                    width: "36px",
                                    height: "36px",
                                    display: "block", // Prevents any extra space from inline display
                                }}
                            />
                        </Tooltip>
                        <Box sx={{ display: "flex", justifyContent: "center", mt: 0.5 }}>
                            {Array.from({ length: level }, (_, dotIndex) => (
                                <Box
                                    key={dotIndex}
                                    sx={{
                                        width: "4px",
                                        height: "4px",
                                        backgroundColor: dotColor,
                                        borderRadius: "50%",
                                        margin: "0 2px",
                                    }}
                                />
                            ))}
                        </Box>
                    </Box>
                );
            })}
        </Box>
    );
};

export default SynergiesRow;
