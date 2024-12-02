import {
    Augment,
    TeamType,
    HoCConstants,
    SynergyWithLevel,
    LifeSynergy,
    LifeSynergyNames,
    ChaosSynergyNames,
    ChaosSynergy,
    MightSynergyNames,
    MightSynergy,
    FactionType,
    NatureSynergyNames,
    NatureSynergy,
    SynergyKeysToPower,
    SpecificSynergy,
} from "@heroesofcrypto/common";
import React, { useEffect, useState } from "react";
import {
    Radio,
    RadioGroup,
    FormControl,
    FormLabel,
    Sheet,
    Box,
    Typography,
    IconButton,
    Tooltip,
    Divider,
} from "@mui/joy";
import { VisibleSynergyLevel } from "../../state/visible_state";
import { useManager } from "../../manager";
import augmentBoardImg from "../../../images/board_augment_256.webp";
import augmentArmorImg from "../../../images/armor_augment_256.webp";
import augmentMightImg from "../../../images/might_augment_256.webp";
import augmentSniperImg from "../../../images/sniper_augment_256.webp";
import augmentMovementImg from "../../../images/movement_augment_256.webp";
import synergyAbilitiesPowerImg from "../../../images/synergy_abilities_power_256.webp";
import synergyAurasRangeImg from "../../../images/synergy_auras_range_256.webp";
import synergyBreakOnAttackImg from "../../../images/synergy_break_on_attack_256.webp";
import synergyIncreaseBoardUnitsImg from "../../../images/synergy_increase_board_units_256.webp";
import synergyMoraleImg from "../../../images/synergy_morale_256.webp";
import synergyPlusFlyArmorImg from "../../../images/synergy_plus_fly_armor_256.webp";
import synergyMovementImg from "../../../images/synergy_movement_256.webp";
import synergySupplyImg from "../../../images/synergy_supply_256.webp";

const SYNERGY_NAME_TO_FACTION = {
    [LifeSynergyNames.PLUS_SUPPLY_PERCENTAGE]: "Life",
    [LifeSynergyNames.PLUS_MORALE_AND_LUCK]: "Life",
    [ChaosSynergyNames.MOVEMENT]: "Chaos",
    [ChaosSynergyNames.BREAK_ON_ATTACK]: "Chaos",
    [MightSynergyNames.PLUS_AURAS_RANGE]: "Might",
    [MightSynergyNames.PLUS_STACK_ABILITIES_POWER]: "Might",
    [NatureSynergyNames.INCREASE_BOARD_UNITS]: "Nature",
    [NatureSynergyNames.PLUS_FLY_ARMOR]: "Nature",
};

const SYNERGY_NAME_TO_DESCRIPTION = {
    [LifeSynergyNames.PLUS_SUPPLY_PERCENTAGE]: "Increase each unit's supply by {}%",
    [LifeSynergyNames.PLUS_MORALE_AND_LUCK]: "The entire army gets +{} morale and +{} luck",
    [ChaosSynergyNames.MOVEMENT]: "Improve movement steps by {} cells",
    [ChaosSynergyNames.BREAK_ON_ATTACK]: "{}% chance to apply Break on attack",
    [MightSynergyNames.PLUS_AURAS_RANGE]: "Increase auras range by {} cells",
    [MightSynergyNames.PLUS_STACK_ABILITIES_POWER]: "Increase stack abilities power by {}%",
    [NatureSynergyNames.INCREASE_BOARD_UNITS]: "Place {} more units on the board",
    [NatureSynergyNames.PLUS_FLY_ARMOR]: "Flying units get +{}% armor",
};

type SelectedSynergy = {
    faction: FactionType;
    synergyName: keyof typeof SYNERGY_NAME_TO_FACTION;
    synergyValue: SpecificSynergy;
    level: VisibleSynergyLevel;
    name: string;
};

const SynergyToggler = ({ selectedSynergy }: { selectedSynergy: SelectedSynergy | null }) => {
    if (!selectedSynergy) {
        return null;
    }

    const selectedSynergyKey = `${selectedSynergy.faction}:${selectedSynergy.synergyValue}:${selectedSynergy.level}`;

    return (
        <Box sx={{ marginBottom: 2 }}>
            <Sheet variant="outlined" sx={{ padding: 2, borderRadius: "md" }}>
                <FormControl>
                    <FormLabel>{`Picked ${selectedSynergy.name}`}</FormLabel>
                    <RadioGroup value={selectedSynergyKey}>
                        {Array.from({ length: HoCConstants.MAX_SYNERGY_LEVEL }, (_, i) => (
                            <Radio
                                key={`${selectedSynergyKey}:${i + 1}`}
                                value={`${selectedSynergy.faction}:${selectedSynergy.synergyValue}:${i + 1}`}
                                label={`${SYNERGY_NAME_TO_DESCRIPTION[selectedSynergy.synergyName]
                                    ?.replace(
                                        "{}",
                                        SynergyKeysToPower[
                                            `${selectedSynergy.faction}:${selectedSynergy.synergyValue}:${i + 1}`
                                        ]?.[0]?.toString() || "0",
                                    )
                                    ?.replace(
                                        "{}",
                                        SynergyKeysToPower[
                                            `${selectedSynergy.faction}:${selectedSynergy.synergyValue}:${i + 1}`
                                        ]?.[1]?.toString() || "0",
                                    )}`}
                                disabled={
                                    selectedSynergyKey !==
                                    `${selectedSynergy.faction}:${selectedSynergy.synergyValue}:${i + 1}`
                                }
                            />
                        ))}
                    </RadioGroup>
                </FormControl>
            </Sheet>
        </Box>
    );
};

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
                    <FormLabel>Augment Board Placement</FormLabel>
                    <RadioGroup
                        name={`${title}-placement-type`}
                        onChange={handleSelectionChange}
                        value={currentSelection ?? Augment.PlacementAugment.LEVEL_1}
                    >
                        <Radio
                            value={Augment.PlacementAugment.LEVEL_1}
                            label="Height 3 partial"
                            disabled={
                                totalPoints + (currentSelection ?? 0) < Augment.PlacementAugment.LEVEL_1 &&
                                currentSelection !== Augment.PlacementAugment.LEVEL_1
                            }
                        />
                        <Radio
                            value={Augment.PlacementAugment.LEVEL_2}
                            label="Height 4 full"
                            disabled={
                                totalPoints + (currentSelection ?? 0) < Augment.PlacementAugment.LEVEL_2 &&
                                currentSelection !== Augment.PlacementAugment.LEVEL_2
                            }
                        />
                        <Radio
                            value={Augment.PlacementAugment.LEVEL_3}
                            label="Height 5 full"
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
                    <FormLabel>Augment Armor</FormLabel>
                    <RadioGroup
                        name={`${title}-armor-type`}
                        onChange={handleSelectionChange}
                        value={currentSelection ?? Augment.ArmorAugment.NO_AUGMENT}
                    >
                        <Radio value={Augment.ArmorAugment.NO_AUGMENT} label="No Augment" />
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
                    <FormLabel>Augment Might</FormLabel>
                    <RadioGroup
                        name={`${title}-might-type`}
                        onChange={handleSelectionChange}
                        value={currentSelection ?? Augment.MightAugment.NO_AUGMENT}
                    >
                        <Radio value={Augment.MightAugment.NO_AUGMENT} label="No Augment" />
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

const SniperToggler = ({
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
        const augmentType = Augment.ToSniperAugment[event.target.value.toString()];
        if (manager.PropagateAugmentation(teamType, { type: "Sniper", value: augmentType })) {
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
                    <FormLabel>Augment Sniper</FormLabel>
                    <RadioGroup
                        name={`${title}-sniper-type`}
                        onChange={handleSelectionChange}
                        value={currentSelection ?? Augment.SniperAugment.NO_AUGMENT}
                    >
                        <Radio value={Augment.SniperAugment.NO_AUGMENT} label="No Augment" />
                        <Radio
                            value={Augment.SniperAugment.LEVEL_1}
                            label={`+${Augment.getSniperPower(Augment.SniperAugment.LEVEL_1)[0]}% attack/+${
                                Augment.getSniperPower(Augment.SniperAugment.LEVEL_1)[1]
                            }% distance`}
                            disabled={
                                totalPoints + (currentSelection ?? 0) < Augment.SniperAugment.LEVEL_1 &&
                                currentSelection !== Augment.SniperAugment.LEVEL_1
                            }
                        />
                        <Radio
                            value={Augment.SniperAugment.LEVEL_2}
                            label={`+${Augment.getSniperPower(Augment.SniperAugment.LEVEL_2)[0]}% attack/+${
                                Augment.getSniperPower(Augment.SniperAugment.LEVEL_2)[1]
                            }% distance`}
                            disabled={
                                totalPoints + (currentSelection ?? 0) < Augment.SniperAugment.LEVEL_2 &&
                                currentSelection !== Augment.SniperAugment.LEVEL_2
                            }
                        />
                        <Radio
                            value={Augment.SniperAugment.LEVEL_3}
                            label={`+${Augment.getSniperPower(Augment.SniperAugment.LEVEL_3)[0]}% attack/+${
                                Augment.getSniperPower(Augment.SniperAugment.LEVEL_3)[1]
                            }% distance`}
                            disabled={
                                totalPoints + (currentSelection ?? 0) < Augment.SniperAugment.LEVEL_3 &&
                                currentSelection !== Augment.SniperAugment.LEVEL_3
                            }
                        />
                    </RadioGroup>
                </FormControl>
            </Sheet>
        </Box>
    );
};

const MovementToggler = ({
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
        const augmentType = Augment.ToMovementAugment[event.target.value.toString()];
        if (manager.PropagateAugmentation(teamType, { type: "Movement", value: augmentType })) {
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
                    <FormLabel>Augment Movement</FormLabel>
                    <RadioGroup
                        name={`${title}-movement-type`}
                        onChange={handleSelectionChange}
                        value={currentSelection ?? Augment.MovementAugment.NO_AUGMENT}
                    >
                        <Radio value={Augment.MovementAugment.NO_AUGMENT} label="No Augment" />
                        <Radio
                            value={Augment.MovementAugment.LEVEL_1}
                            label={`+${Augment.getMovementPower(Augment.MovementAugment.LEVEL_1)} Movement steps`}
                            disabled={
                                totalPoints + (currentSelection ?? 0) < Augment.MovementAugment.LEVEL_1 &&
                                currentSelection !== Augment.MovementAugment.LEVEL_1
                            }
                        />
                        <Radio
                            value={Augment.MovementAugment.LEVEL_2}
                            label={`+${Augment.getMovementPower(Augment.MovementAugment.LEVEL_2)} Movement steps`}
                            disabled={
                                totalPoints + (currentSelection ?? 0) < Augment.MovementAugment.LEVEL_2 &&
                                currentSelection !== Augment.MovementAugment.LEVEL_2
                            }
                        />
                    </RadioGroup>
                </FormControl>
            </Sheet>
        </Box>
    );
};

const SideToggleContainer = ({
    side,
    teamType,
    unitFaction,
}: {
    side: string;
    teamType: TeamType;
    unitFaction?: FactionType;
}) => {
    const [totalPoints, setTotalPoints] = useState(HoCConstants.MAX_AUGMENT_POINTS);
    const [placementSelection, setPlacementSelection] = useState<number | null>(null);
    const [armorSelection, setArmorSelection] = useState<number | null>(null);
    const [mightSelection, setMightSelection] = useState<number | null>(null);
    const [sniperSelection, setSniperSelection] = useState<number | null>(null);
    const [movementSelection, setMovementSelection] = useState<number | null>(null);
    const [possibleSynergies, setPossibleSynergies] = useState<Map<TeamType, SynergyWithLevel[]>>(new Map());
    const [togglerType, setTogglerType] = useState<
        "Placement" | "Armor" | "Might" | "Sniper" | "Movement" | "Synergy" | "None"
    >("Placement");
    const [selectedSynergy, setSelectedSynergy] = useState<SelectedSynergy | null>(null);
    const [synergyPairLife, setSynergyPairTypeLife] = useState<SelectedSynergy | null>(null);
    const [synergyPairChaos, setSynergyPairTypeChaos] = useState<SelectedSynergy | null>(null);
    const [synergyPairMight, setSynergyPairTypeMight] = useState<SelectedSynergy | null>(null);
    const [synergyPairNature, setSynergyPairTypeNature] = useState<SelectedSynergy | null>(null);
    const [synergyTogglerKey, setSynergyTogglerKey] = useState(0);

    // Function to handle augment button clicks
    const handleAugmentClick = (type: "Placement" | "Armor" | "Might" | "Sniper" | "Movement") => {
        setTogglerType(type);
        setSelectedSynergy(null); // Clear selected synergy when switching to augment
    };

    const handleLevelChange = (pointsUsed: number, previousPointsUsed: number) => {
        if (togglerType === "Placement") {
            setPlacementSelection(pointsUsed);
        } else if (togglerType === "Armor") {
            setArmorSelection(pointsUsed);
        } else if (togglerType === "Might") {
            setMightSelection(pointsUsed);
        } else if (togglerType === "Sniper") {
            setSniperSelection(pointsUsed);
        } else {
            setMovementSelection(pointsUsed);
        }
        const remainingPoints = totalPoints + previousPointsUsed - pointsUsed;
        setTotalPoints(remainingPoints);
    };

    const possibleSynergiesObj: Record<string, VisibleSynergyLevel> = {};
    const possibleSynergiesPerTeam = possibleSynergies.get(teamType);
    if (possibleSynergiesPerTeam) {
        for (const ps of possibleSynergiesPerTeam) {
            if (ps.synergy in possibleSynergiesObj) {
                const elem = possibleSynergiesObj[ps.synergy];
                possibleSynergiesObj[ps.synergy] = Math.max(ps.level, elem) as VisibleSynergyLevel;
            } else {
                possibleSynergiesObj[ps.synergy] = ps.level as VisibleSynergyLevel;
            }
        }
    }

    for (const [synergyName, synergyLevel] of Object.entries(possibleSynergiesObj)) {
        if (synergyLevel <= 0) {
            if (SYNERGY_NAME_TO_FACTION[synergyName as keyof typeof SYNERGY_NAME_TO_FACTION] === "Life") {
                if (synergyPairLife !== null) {
                    setSynergyPairTypeLife(null);
                    if (togglerType === "Synergy" && (!unitFaction || unitFaction === FactionType.LIFE)) {
                        setTogglerType("None");
                    }
                }
            } else if (SYNERGY_NAME_TO_FACTION[synergyName as keyof typeof SYNERGY_NAME_TO_FACTION] === "Chaos") {
                if (synergyPairChaos !== null) {
                    setSynergyPairTypeChaos(null);
                    if (togglerType === "Synergy" && (!unitFaction || unitFaction === FactionType.CHAOS)) {
                        setTogglerType("None");
                    }
                }
            } else if (SYNERGY_NAME_TO_FACTION[synergyName as keyof typeof SYNERGY_NAME_TO_FACTION] === "Might") {
                if (synergyPairMight !== null) {
                    setSynergyPairTypeMight(null);
                    if (togglerType === "Synergy" && (!unitFaction || unitFaction === FactionType.MIGHT)) {
                        setTogglerType("None");
                    }
                }
            } else if (SYNERGY_NAME_TO_FACTION[synergyName as keyof typeof SYNERGY_NAME_TO_FACTION] === "Nature") {
                if (synergyPairNature !== null) {
                    setSynergyPairTypeNature(null);
                    if (togglerType === "Synergy" && (!unitFaction || unitFaction === FactionType.NATURE)) {
                        setTogglerType("None");
                    }
                }
            }
        } else if (
            togglerType === "Synergy" &&
            selectedSynergy &&
            synergyName === selectedSynergy.synergyName &&
            selectedSynergy.level &&
            selectedSynergy.level !== synergyLevel
        ) {
            setSelectedSynergy({
                faction: selectedSynergy.faction,
                synergyName: selectedSynergy.synergyName,
                synergyValue: selectedSynergy.synergyValue,
                level: synergyLevel,
                name: selectedSynergy.name,
            });
            // Force a re-render of the SynergyToggler by updating its key
            setSynergyTogglerKey((prev) => prev + 1);
        }
    }

    const manager = useManager();

    useEffect(() => {
        const connection = manager.onPossibleSynergiesUpdated.connect((sMap: Map<TeamType, SynergyWithLevel[]>) => {
            setPossibleSynergies(sMap);
        });

        return () => {
            connection.disconnect();
        };
    }, [manager]);

    const handleSynergySelect = (
        setSynergy: React.Dispatch<React.SetStateAction<SelectedSynergy | null>>,
        synergy: SelectedSynergy,
    ) => {
        if (
            synergy.level >= 1 &&
            manager.PropagateSynergy(teamType, synergy.faction, synergy.synergyName, synergy.level)
        ) {
            setSynergy(synergy);
            setSelectedSynergy(synergy);
            setTogglerType("Synergy");
        }
    };

    const hasAnySynergies =
        possibleSynergiesObj[LifeSynergyNames.PLUS_SUPPLY_PERCENTAGE] > 0 ||
        possibleSynergiesObj[LifeSynergyNames.PLUS_MORALE_AND_LUCK] > 0 ||
        possibleSynergiesObj[ChaosSynergyNames.MOVEMENT] > 0 ||
        possibleSynergiesObj[ChaosSynergyNames.BREAK_ON_ATTACK] > 0 ||
        possibleSynergiesObj[MightSynergyNames.PLUS_AURAS_RANGE] > 0 ||
        possibleSynergiesObj[MightSynergyNames.PLUS_STACK_ABILITIES_POWER] > 0 ||
        possibleSynergiesObj[NatureSynergyNames.INCREASE_BOARD_UNITS] > 0 ||
        possibleSynergiesObj[NatureSynergyNames.PLUS_FLY_ARMOR] > 0;

    return (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, paddingTop: 2 }}>
            <Box sx={{ display: "flex", justifyContent: "center", gap: 2, flexWrap: "wrap" }}>
                <Tooltip title="Augment board placements" style={{ zIndex: 1 }}>
                    <IconButton onClick={() => handleAugmentClick("Placement")} title="Augment board placements">
                        <img
                            src={augmentBoardImg}
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
                <Tooltip title="Augment armor" style={{ zIndex: 1 }}>
                    <IconButton onClick={() => handleAugmentClick("Armor")} title="Augment armor">
                        <img
                            src={augmentArmorImg}
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
                <Tooltip title="Augment melee attack" style={{ zIndex: 1 }}>
                    <IconButton onClick={() => handleAugmentClick("Might")} title="Augment melee attack">
                        <img
                            src={augmentMightImg}
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
                <Tooltip title="Augment ranged attack" style={{ zIndex: 1 }}>
                    <IconButton onClick={() => handleAugmentClick("Sniper")} title="Augment ranged attack">
                        <img
                            src={augmentSniperImg}
                            alt="Sniper Icon"
                            style={{
                                filter: togglerType === "Sniper" ? "brightness(1.2)" : "brightness(0.6)",
                                width: 48,
                                height: 48,
                                transform: "rotate(180deg)",
                            }}
                        />
                    </IconButton>
                </Tooltip>
                <Tooltip title="Augment movement" style={{ zIndex: 1 }}>
                    <IconButton onClick={() => handleAugmentClick("Movement")} title="Augment movement">
                        <img
                            src={augmentMovementImg}
                            alt="Movement Icon"
                            style={{
                                filter: togglerType === "Movement" ? "brightness(1.2)" : "brightness(0.6)",
                                width: 48,
                                height: 48,
                                transform: "rotate(180deg)",
                            }}
                        />
                    </IconButton>
                </Tooltip>
            </Box>
            <Divider />

            {hasAnySynergies && (
                <Box sx={{ display: "flex", justifyContent: "center", gap: 2, flexWrap: "wrap" }}>
                    {possibleSynergiesObj[LifeSynergyNames.PLUS_SUPPLY_PERCENTAGE] > 0 &&
                        possibleSynergiesObj[LifeSynergyNames.PLUS_MORALE_AND_LUCK] > 0 && (
                            <Box
                                sx={{
                                    display: "flex",
                                    justifyContent: "center",
                                    gap: 0,
                                    flexBasis: { xs: "100%", sm: "auto" },
                                }}
                            >
                                <Tooltip title="Pick Supply synergy" style={{ zIndex: 1 }}>
                                    <IconButton
                                        onClick={() =>
                                            handleSynergySelect(setSynergyPairTypeLife, {
                                                faction: "Life" as FactionType,
                                                synergyName: LifeSynergyNames.PLUS_SUPPLY_PERCENTAGE,
                                                synergyValue: LifeSynergy.PLUS_SUPPLY_PERCENTAGE,
                                                level:
                                                    possibleSynergiesObj[LifeSynergyNames.PLUS_SUPPLY_PERCENTAGE] ?? 0,
                                                name: "Supply Synergy",
                                            })
                                        }
                                        title="Supply synergy"
                                    >
                                        <img
                                            src={synergySupplyImg}
                                            alt="Supply Icon"
                                            style={{
                                                filter:
                                                    synergyPairLife?.synergyName ===
                                                    LifeSynergyNames.PLUS_SUPPLY_PERCENTAGE
                                                        ? "brightness(1.2)"
                                                        : "brightness(0.6)",
                                                width: 45,
                                                height: 45,
                                            }}
                                        />
                                    </IconButton>
                                </Tooltip>
                                <Tooltip title="Pick Morale & Luck synergy" style={{ zIndex: 1 }}>
                                    <IconButton
                                        onClick={() =>
                                            handleSynergySelect(setSynergyPairTypeLife, {
                                                faction: "Life" as FactionType,
                                                synergyName: LifeSynergyNames.PLUS_MORALE_AND_LUCK,
                                                synergyValue: LifeSynergy.PLUS_MORALE_AND_LUCK,
                                                level: possibleSynergiesObj[LifeSynergyNames.PLUS_MORALE_AND_LUCK] ?? 0,
                                                name: "Morale Synergy",
                                            })
                                        }
                                        title="Morale synergy"
                                    >
                                        <img
                                            src={synergyMoraleImg}
                                            alt="Morale Icon"
                                            style={{
                                                filter:
                                                    synergyPairLife?.synergyName ===
                                                    LifeSynergyNames.PLUS_MORALE_AND_LUCK
                                                        ? "brightness(1.2)"
                                                        : "brightness(0.6)",
                                                width: 45,
                                                height: 45,
                                            }}
                                        />
                                    </IconButton>
                                </Tooltip>
                            </Box>
                        )}
                    {possibleSynergiesObj[ChaosSynergyNames.MOVEMENT] > 0 &&
                        possibleSynergiesObj[ChaosSynergyNames.BREAK_ON_ATTACK] > 0 && (
                            <Box
                                sx={{
                                    display: "flex",
                                    justifyContent: "center",
                                    gap: 0,
                                    flexBasis: { xs: "100%", sm: "auto" },
                                }}
                            >
                                <Tooltip title="Pick Movement synergy" style={{ zIndex: 1 }}>
                                    <IconButton
                                        onClick={() =>
                                            handleSynergySelect(setSynergyPairTypeChaos, {
                                                faction: "Chaos" as FactionType,
                                                synergyName: ChaosSynergyNames.MOVEMENT,
                                                synergyValue: ChaosSynergy.MOVEMENT,
                                                level: possibleSynergiesObj[ChaosSynergyNames.MOVEMENT] ?? 0,
                                                name: "Movement Synergy",
                                            })
                                        }
                                        title="Movement synergy"
                                    >
                                        <img
                                            src={synergyMovementImg}
                                            alt="Movement Icon"
                                            style={{
                                                filter:
                                                    synergyPairChaos?.synergyName === ChaosSynergyNames.MOVEMENT
                                                        ? "brightness(1.2)"
                                                        : "brightness(0.6)",
                                                width: 45,
                                                height: 45,
                                            }}
                                        />
                                    </IconButton>
                                </Tooltip>
                                <Tooltip title="Pick Break on Attack synergy" style={{ zIndex: 1 }}>
                                    <IconButton
                                        onClick={() =>
                                            handleSynergySelect(setSynergyPairTypeChaos, {
                                                faction: "Chaos" as FactionType,
                                                synergyName: ChaosSynergyNames.BREAK_ON_ATTACK,
                                                synergyValue: ChaosSynergy.BREAK_ON_ATTACK,
                                                level: possibleSynergiesObj[ChaosSynergyNames.BREAK_ON_ATTACK] ?? 0,
                                                name: "Break on Attack Synergy",
                                            })
                                        }
                                        title="Break on Attack synergy"
                                    >
                                        <img
                                            src={synergyBreakOnAttackImg}
                                            alt="Break on Attack Icon"
                                            style={{
                                                filter:
                                                    synergyPairChaos?.synergyName === ChaosSynergyNames.BREAK_ON_ATTACK
                                                        ? "brightness(1.2)"
                                                        : "brightness(0.6)",
                                                width: 45,
                                                height: 45,
                                            }}
                                        />
                                    </IconButton>
                                </Tooltip>
                            </Box>
                        )}
                    {possibleSynergiesObj[MightSynergyNames.PLUS_AURAS_RANGE] > 0 &&
                        possibleSynergiesObj[MightSynergyNames.PLUS_STACK_ABILITIES_POWER] > 0 && (
                            <Box
                                sx={{
                                    display: "flex",
                                    justifyContent: "center",
                                    gap: 0,
                                    flexBasis: { xs: "100%", sm: "auto" },
                                }}
                            >
                                <Tooltip title="Pick Auras Range synergy" style={{ zIndex: 1 }}>
                                    <IconButton
                                        onClick={() =>
                                            handleSynergySelect(setSynergyPairTypeMight, {
                                                faction: "Might" as FactionType,
                                                synergyName: MightSynergyNames.PLUS_AURAS_RANGE,
                                                synergyValue: MightSynergy.PLUS_AURAS_RANGE,
                                                level: possibleSynergiesObj[MightSynergyNames.PLUS_AURAS_RANGE] ?? 0,
                                                name: "Aura Range Synergy",
                                            })
                                        }
                                        title="Auras Range synergy"
                                    >
                                        <img
                                            src={synergyAurasRangeImg}
                                            alt="Auras Range Icon"
                                            style={{
                                                filter:
                                                    synergyPairMight?.synergyName === MightSynergyNames.PLUS_AURAS_RANGE
                                                        ? "brightness(1.2)"
                                                        : "brightness(0.6)",
                                                width: 45,
                                                height: 45,
                                            }}
                                        />
                                    </IconButton>
                                </Tooltip>
                                <Tooltip title="Pick Abilities Power synergy" style={{ zIndex: 1 }}>
                                    <IconButton
                                        onClick={() =>
                                            handleSynergySelect(setSynergyPairTypeMight, {
                                                faction: "Might" as FactionType,
                                                synergyName: MightSynergyNames.PLUS_STACK_ABILITIES_POWER,
                                                synergyValue: MightSynergy.PLUS_STACK_ABILITIES_POWER,
                                                level:
                                                    possibleSynergiesObj[
                                                        MightSynergyNames.PLUS_STACK_ABILITIES_POWER
                                                    ] ?? 0,
                                                name: "Abilities Power Synergy",
                                            })
                                        }
                                        title="Abilities Power synergy"
                                    >
                                        <img
                                            src={synergyAbilitiesPowerImg}
                                            alt="Abilities Power Icon"
                                            style={{
                                                filter:
                                                    synergyPairMight?.synergyName ===
                                                    MightSynergyNames.PLUS_STACK_ABILITIES_POWER
                                                        ? "brightness(1.2)"
                                                        : "brightness(0.6)",
                                                width: 45,
                                                height: 45,
                                            }}
                                        />
                                    </IconButton>
                                </Tooltip>
                            </Box>
                        )}
                    {possibleSynergiesObj[NatureSynergyNames.INCREASE_BOARD_UNITS] > 0 &&
                        possibleSynergiesObj[NatureSynergyNames.PLUS_FLY_ARMOR] > 0 && (
                            <Box
                                sx={{
                                    display: "flex",
                                    justifyContent: "center",
                                    gap: 0,
                                    flexBasis: { xs: "100%", sm: "auto" },
                                }}
                            >
                                <Tooltip title="Pick Board Units synergy" style={{ zIndex: 1 }}>
                                    <IconButton
                                        onClick={() =>
                                            handleSynergySelect(setSynergyPairTypeNature, {
                                                faction: "Nature" as FactionType,
                                                synergyName: NatureSynergyNames.INCREASE_BOARD_UNITS,
                                                synergyValue: NatureSynergy.INCREASE_BOARD_UNITS,
                                                level:
                                                    possibleSynergiesObj[NatureSynergyNames.INCREASE_BOARD_UNITS] ?? 0,
                                                name: "Board Units Synergy",
                                            })
                                        }
                                        title="Board Units synergy"
                                    >
                                        <img
                                            src={synergyIncreaseBoardUnitsImg}
                                            alt="Board Units Icon"
                                            style={{
                                                filter:
                                                    synergyPairNature?.synergyName ===
                                                    NatureSynergyNames.INCREASE_BOARD_UNITS
                                                        ? "brightness(1.2)"
                                                        : "brightness(0.6)",
                                                width: 45,
                                                height: 45,
                                            }}
                                        />
                                    </IconButton>
                                </Tooltip>
                                <Tooltip title="Pick Fly Armor synergy" style={{ zIndex: 1 }}>
                                    <IconButton
                                        onClick={() =>
                                            handleSynergySelect(setSynergyPairTypeNature, {
                                                faction: "Nature" as FactionType,
                                                synergyName: NatureSynergyNames.PLUS_FLY_ARMOR,
                                                synergyValue: NatureSynergy.PLUS_FLY_ARMOR,
                                                level: possibleSynergiesObj[NatureSynergyNames.PLUS_FLY_ARMOR] ?? 0,
                                                name: "Fly Armor Synergy",
                                            })
                                        }
                                        title="Fly Armor synergy"
                                    >
                                        <img
                                            src={synergyPlusFlyArmorImg}
                                            alt="Fly Armor Icon"
                                            style={{
                                                filter:
                                                    synergyPairNature?.synergyName === NatureSynergyNames.PLUS_FLY_ARMOR
                                                        ? "brightness(1.2)"
                                                        : "brightness(0.6)",
                                                width: 45,
                                                height: 45,
                                            }}
                                        />
                                    </IconButton>
                                </Tooltip>
                            </Box>
                        )}
                </Box>
            )}
            {togglerType === "Synergy" ? (
                <SynergyToggler key={synergyTogglerKey} selectedSynergy={selectedSynergy} />
            ) : (
                togglerType !== "None" && (
                    <>
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
                        ) : togglerType === "Might" ? (
                            <MightToggler
                                key={teamType}
                                teamType={teamType}
                                title={side}
                                totalPoints={totalPoints}
                                onLevelChange={handleLevelChange}
                                currentSelection={mightSelection}
                            />
                        ) : togglerType === "Sniper" ? (
                            <SniperToggler
                                key={teamType}
                                teamType={teamType}
                                title={side}
                                totalPoints={totalPoints}
                                onLevelChange={handleLevelChange}
                                currentSelection={sniperSelection}
                            />
                        ) : (
                            <MovementToggler
                                key={teamType}
                                teamType={teamType}
                                title={side}
                                totalPoints={totalPoints}
                                onLevelChange={handleLevelChange}
                                currentSelection={movementSelection}
                            />
                        )}
                    </>
                )
            )}
        </Box>
    );
};

export default SideToggleContainer;
