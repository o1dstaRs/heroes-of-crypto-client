import React, { useState } from "react";
import { Radio, RadioGroup, FormControl, FormLabel, Sheet, Box, Typography, IconButton, Tooltip } from "@mui/joy";
import { useManager } from "../../manager";
import { Augment, TeamType, HoCConstants } from "@heroesofcrypto/common";
import augmentBoard from "../../../images/board_augment_256.webp"; // Assuming you have these images
import augmentArmor from "../../../images/armor_augment_256.webp"; // Assuming you have these images
import augmentMight from "../../../images/might_augment_256.webp"; // Assuming you have these images

const PlacementToggler = ({
    title,
    teamType,
    totalPoints,
    onLevelChange,
    currentSelection,
}: {
    title: string;
    teamType: TeamType;
    totalPoints: number;
    onLevelChange: (pointsUsed: number, previousPointsUsed: number) => void;
    currentSelection: number | null;
}) => {
    const manager = useManager();

    const handleSelectionChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const augmentType = Augment.ToPlacementAugment[event.target.value.toString()];
        if (manager.PropagateAugmentation(teamType, { type: "Placement", value: augmentType })) {
            onLevelChange(augmentType, currentSelection ?? 0);
        }
    };

    return (
        <Box sx={{ marginBottom: 2 }}>
            <Typography sx={{ color: "orange", fontWeight: "bold", paddingTop: 1, paddingBottom: 2 }}>
                Remaining Points: {totalPoints}
            </Typography>

            <Sheet
                variant="outlined"
                sx={{
                    padding: 2,
                    borderRadius: "md",
                }}
            >
                <FormControl>
                    <FormLabel>Board placements</FormLabel>
                    <RadioGroup
                        name={`${title}-placement-type`}
                        onChange={handleSelectionChange}
                        value={currentSelection ?? Augment.PlacementAugment.LEVEL_1}
                    >
                        <Radio
                            value={Augment.PlacementAugment.LEVEL_1}
                            label="3x3"
                            disabled={
                                totalPoints + (currentSelection ?? 0) < Augment.PlacementAugment.LEVEL_1 &&
                                currentSelection !== Augment.PlacementAugment.LEVEL_1
                            }
                        />
                        <Radio
                            value={Augment.PlacementAugment.LEVEL_2}
                            label="5x5"
                            disabled={
                                totalPoints + (currentSelection ?? 0) < Augment.PlacementAugment.LEVEL_2 &&
                                currentSelection !== Augment.PlacementAugment.LEVEL_2
                            }
                        />
                        <Radio
                            value={Augment.PlacementAugment.LEVEL_3}
                            label="Two placements 5x5"
                            disabled={
                                totalPoints + (currentSelection ?? 0) < Augment.PlacementAugment.LEVEL_3 &&
                                currentSelection !== Augment.PlacementAugment.LEVEL_3
                            }
                        />
                    </RadioGroup>
                </FormControl>
            </Sheet>
        </Box>
    );
};

const ArmorToggler = ({
    title,
    teamType,
    totalPoints,
    onLevelChange,
    currentSelection,
}: {
    title: string;
    teamType: TeamType;
    totalPoints: number;
    onLevelChange: (pointsUsed: number, previousPointsUsed: number) => void;
    currentSelection: number | null;
}) => {
    const manager = useManager();

    const handleSelectionChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const augmentType = Augment.ToArmorAugment[event.target.value.toString()];
        if (manager.PropagateAugmentation(teamType, { type: "Armor", value: augmentType })) {
            onLevelChange(augmentType, currentSelection ?? 0);
        }
    };

    return (
        <Box sx={{ marginBottom: 2 }}>
            {/* Remaining Points Text (Orange and Bold) */}
            <Typography sx={{ color: "orange", fontWeight: "bold", paddingTop: 1, paddingBottom: 2 }}>
                Remaining Points: {totalPoints}
            </Typography>

            {/* The Toggler Sheet */}
            <Sheet
                variant="outlined"
                sx={{
                    padding: 2,
                    borderRadius: "md",
                }}
            >
                <FormControl>
                    <FormLabel>Armor</FormLabel>
                    <RadioGroup
                        name={`${title}-armor-type`}
                        onChange={handleSelectionChange}
                        value={currentSelection ?? 0}
                    >
                        <Radio
                            value={Augment.ArmorAugment.LEVEL_1}
                            label={`+${Augment.getArmorPower(Augment.ArmorAugment.LEVEL_1)}% Armor`}
                            disabled={
                                totalPoints + (currentSelection ?? 0) < Augment.ArmorAugment.LEVEL_1 &&
                                currentSelection !== Augment.ArmorAugment.LEVEL_1
                            }
                        />
                        <Radio
                            value={Augment.ArmorAugment.LEVEL_2}
                            label={`+${Augment.getArmorPower(Augment.ArmorAugment.LEVEL_2)}% Armor`}
                            disabled={
                                totalPoints + (currentSelection ?? 0) < Augment.ArmorAugment.LEVEL_2 &&
                                currentSelection !== Augment.ArmorAugment.LEVEL_2
                            }
                        />
                        <Radio
                            value={Augment.ArmorAugment.LEVEL_3}
                            label={`+${Augment.getArmorPower(Augment.ArmorAugment.LEVEL_3)}% Armor`}
                            disabled={
                                totalPoints + (currentSelection ?? 0) < Augment.ArmorAugment.LEVEL_3 &&
                                currentSelection !== Augment.ArmorAugment.LEVEL_3
                            }
                        />
                    </RadioGroup>
                </FormControl>
            </Sheet>
        </Box>
    );
};

const MightToggler = ({
    title,
    teamType,
    totalPoints,
    onLevelChange,
    currentSelection,
}: {
    title: string;
    teamType: TeamType;
    totalPoints: number;
    onLevelChange: (pointsUsed: number, previousPointsUsed: number) => void;
    currentSelection: number | null;
}) => {
    const manager = useManager();

    const handleSelectionChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const augmentType = Augment.ToMightAugment[event.target.value.toString()];
        if (manager.PropagateAugmentation(teamType, { type: "Might", value: augmentType })) {
            onLevelChange(augmentType, currentSelection ?? 0);
        }
    };

    return (
        <Box sx={{ marginBottom: 2 }}>
            {/* Remaining Points Text (Orange and Bold) */}
            <Typography sx={{ color: "orange", fontWeight: "bold", paddingTop: 1, paddingBottom: 2 }}>
                Remaining Points: {totalPoints}
            </Typography>

            {/* The Toggler Sheet */}
            <Sheet
                variant="outlined"
                sx={{
                    padding: 2,
                    borderRadius: "md",
                }}
            >
                <FormControl>
                    <FormLabel>Might</FormLabel>
                    <RadioGroup
                        name={`${title}-might-type`}
                        onChange={handleSelectionChange}
                        value={currentSelection ?? 0}
                    >
                        <Radio
                            value={Augment.MightAugment.LEVEL_1}
                            label={`+${Augment.getMightPower(Augment.MightAugment.LEVEL_1)}% Melee attack`}
                            disabled={
                                totalPoints + (currentSelection ?? 0) < Augment.MightAugment.LEVEL_1 &&
                                currentSelection !== Augment.MightAugment.LEVEL_1
                            }
                        />
                        <Radio
                            value={Augment.MightAugment.LEVEL_2}
                            label={`+${Augment.getMightPower(Augment.MightAugment.LEVEL_2)}% Melee attack`}
                            disabled={
                                totalPoints + (currentSelection ?? 0) < Augment.MightAugment.LEVEL_2 &&
                                currentSelection !== Augment.MightAugment.LEVEL_2
                            }
                        />
                        <Radio
                            value={Augment.MightAugment.LEVEL_3}
                            label={`+${Augment.getMightPower(Augment.MightAugment.LEVEL_3)}% Melee attack`}
                            disabled={
                                totalPoints + (currentSelection ?? 0) < Augment.MightAugment.LEVEL_3 &&
                                currentSelection !== Augment.MightAugment.LEVEL_3
                            }
                        />
                    </RadioGroup>
                </FormControl>
            </Sheet>
        </Box>
    );
};

const SideToggleContainer = ({ side, teamType }: { side: string; teamType: TeamType }) => {
    const [totalPoints, setTotalPoints] = useState(HoCConstants.MAX_AUGMENT_POINTS);
    const [placementSelection, setPlacementSelection] = useState<number | null>(null);
    const [armorSelection, setArmorSelection] = useState<number | null>(null);
    const [mightSelection, setMightSelection] = useState<number | null>(null);
    const [togglerType, setTogglerType] = useState<"Placement" | "Armor" | "Might">("Placement");

    const handleLevelChange = (pointsUsed: number, previousPointsUsed: number) => {
        if (togglerType === "Placement") {
            setPlacementSelection(pointsUsed);
        } else if (togglerType === "Armor") {
            setArmorSelection(pointsUsed);
        } else {
            setMightSelection(pointsUsed);
        }
        const remainingPoints = totalPoints + previousPointsUsed - pointsUsed;
        setTotalPoints(remainingPoints);
    };

    return (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, paddingTop: 2 }}>
            <Box sx={{ display: "flex", justifyContent: "center", gap: 2 }}>
                <Tooltip title="Augment board placements" style={{ zIndex: 3 }}>
                    <IconButton onClick={() => setTogglerType("Placement")} title="Augment board placements">
                        <img
                            src={augmentBoard}
                            alt="Placement Icon"
                            style={{
                                filter: togglerType === "Placement" ? "brightness(1.2)" : "brightness(0.6)",
                                width: 48,
                                height: 48,
                                transform: "rotate(180deg)",
                            }}
                        />
                    </IconButton>
                </Tooltip>
                <Tooltip title="Augment armor" style={{ zIndex: 3 }}>
                    <IconButton onClick={() => setTogglerType("Armor")} title="Augment armor">
                        <img
                            src={augmentArmor}
                            alt="Armor Icon"
                            style={{
                                filter: togglerType === "Armor" ? "brightness(1.2)" : "brightness(0.6)",
                                width: 48,
                                height: 48,
                                transform: "rotate(180deg)",
                            }}
                        />
                    </IconButton>
                </Tooltip>
                <Tooltip title="Augment melee attack" style={{ zIndex: 3 }}>
                    <IconButton onClick={() => setTogglerType("Might")} title="Augment melee attack">
                        <img
                            src={augmentMight}
                            alt="Might Icon"
                            style={{
                                filter: togglerType === "Might" ? "brightness(1.2)" : "brightness(0.6)",
                                width: 48,
                                height: 48,
                                transform: "rotate(180deg)",
                            }}
                        />
                    </IconButton>
                </Tooltip>
            </Box>
            {togglerType === "Placement" ? (
                <PlacementToggler
                    key={teamType}
                    teamType={teamType}
                    title={side}
                    totalPoints={totalPoints}
                    onLevelChange={handleLevelChange}
                    currentSelection={placementSelection}
                />
            ) : togglerType === "Armor" ? (
                <ArmorToggler
                    key={teamType}
                    teamType={teamType}
                    title={side}
                    totalPoints={totalPoints}
                    onLevelChange={handleLevelChange}
                    currentSelection={armorSelection}
                />
            ) : (
                <MightToggler
                    key={teamType}
                    teamType={teamType}
                    title={side}
                    totalPoints={totalPoints}
                    onLevelChange={handleLevelChange}
                    currentSelection={mightSelection}
                />
            )}
        </Box>
    );
};

export default SideToggleContainer;
