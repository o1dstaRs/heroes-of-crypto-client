import { SYNERGY_KEY_TO_IMAGE, SYNERGY_NAME_TO_DESCRIPTION } from "./SynergiesConstants";
import { SynergyKeysToPower } from "@heroesofcrypto/common";
import Box from "@mui/joy/Box";
import Tooltip from "@mui/joy/Tooltip";
import React, { useMemo } from "react";

const SynergiesRow = ({ synergies }: { synergies: string[] }) => {
    const sortedSynergies = useMemo(
        () =>
            [...synergies].sort((a, b) => {
                const partsA = a.split(":");
                const partsB = b.split(":");

                const levelA = partsA.length >= 3 ? parseInt(partsA[2]) : 0;
                const levelB = partsB.length >= 3 ? parseInt(partsB[2]) : 0;

                return levelB - levelA;
            }),
        [synergies],
    );

    return (
        <Box
            sx={{
                display: "flex",
                gap: 1,
                height: "40px", // 32px for images + 4px padding top and bottom
                alignItems: "center",
            }}
        >
            {sortedSynergies.map((synergyKey) => {
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
                    <Box key={synergyKey} sx={{ textAlign: "center" }}>
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
                                    imageRendering: "auto",
                                    transform: "translateZ(0)",
                                    transition: "opacity 160ms ease-out, transform 160ms ease-out",
                                    willChange: "opacity, transform",
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
