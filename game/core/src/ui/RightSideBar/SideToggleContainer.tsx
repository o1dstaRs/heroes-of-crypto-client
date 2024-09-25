import React, { useState } from "react";
import { Radio, RadioGroup, FormControl, FormLabel, Sheet, Box, Typography } from "@mui/joy";

import { useManager } from "../../manager";
import { Augment, TeamType, HoCConstants } from "@heroesofcrypto/common";

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
    onLevelChange: (pointsUsed: number) => void;
    currentSelection: number | null;
}) => {
    const manager = useManager();

    const handleSelectionChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const augmentType = Augment.ToPlacementAugment[event.target.value.toString()];
        if (manager.PropagateAugmentation(teamType, { type: "Placement", value: augmentType })) {
            onLevelChange(augmentType);
        }
    };

    return (
        <Box sx={{ marginBottom: 2 }}>
            {/* Remaining Points Text (Orange and Bold) */}
            <Typography sx={{ color: "orange", fontWeight: "bold", paddingTop: 2, paddingBottom: 2 }}>
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
                    <FormLabel>Placement Type</FormLabel>
                    <RadioGroup
                        name={`${title}-placement-type`}
                        onChange={handleSelectionChange}
                        value={currentSelection ?? Augment.PlacementAugment.LEVEL_1}
                    >
                        <Radio
                            value={Augment.PlacementAugment.LEVEL_1}
                            label="Level 1: 3x3"
                            disabled={
                                totalPoints + (currentSelection ?? 0) < 1 &&
                                currentSelection !== Augment.PlacementAugment.LEVEL_1
                            }
                        />
                        <Radio
                            value={Augment.PlacementAugment.LEVEL_2}
                            label="Level 2: 5x5"
                            disabled={
                                totalPoints + (currentSelection ?? 0) < 2 &&
                                currentSelection !== Augment.PlacementAugment.LEVEL_2
                            }
                        />
                        <Radio
                            value={Augment.PlacementAugment.LEVEL_3}
                            label="Level 3: Two placements 5x5"
                            disabled={
                                totalPoints + (currentSelection ?? 0) < 3 &&
                                currentSelection !== Augment.PlacementAugment.LEVEL_3
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
    const [currentSelection, setCurrentSelection] = useState<number | null>(null);

    const handleLevelChange = (pointsUsed: number) => {
        setCurrentSelection(pointsUsed);
        const remainingPoints = HoCConstants.MAX_AUGMENT_POINTS - pointsUsed;
        setTotalPoints(remainingPoints);
    };

    return (
        <Box sx={{ display: "flex", gap: 2 }}>
            <PlacementToggler
                key={teamType}
                teamType={teamType}
                title={side}
                totalPoints={totalPoints}
                onLevelChange={handleLevelChange}
                currentSelection={currentSelection}
            />
        </Box>
    );
};

export default SideToggleContainer;
