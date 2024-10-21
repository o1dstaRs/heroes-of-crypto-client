import {
    Augment,
    TeamType,
    HoCConstants,
    SynergyWithLevel,
    LifeSynergyNames,
    ChaosSynergyNames,
    MightSynergyNames,
    NatureSynergyNames,
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
import synergySlowOnShotImg from "../../../images/synergy_slow_on_shot_256.webp";
import synergySupplyImg from "../../../images/synergy_supply_256.webp";

const SYNERGY_NAME_TO_IMAGE = {
    [LifeSynergyNames.PLUS_SUPPLY_PERCENTAGE]: synergySupplyImg,
    [LifeSynergyNames.PLUS_MORALE]: synergyMoraleImg,
    [ChaosSynergyNames.SLOW_ON_SHOT]: synergySlowOnShotImg,
    [ChaosSynergyNames.BREAK_ON_ATTACK]: synergyBreakOnAttackImg,
    [MightSynergyNames.PLUS_AURAS_RANGE]: synergyAurasRangeImg,
    [MightSynergyNames.PLUS_STACK_ABILITIES_POWER]: synergyAbilitiesPowerImg,
    [NatureSynergyNames.INCREASE_BOARD_UNITS]: synergyIncreaseBoardUnitsImg,
    [NatureSynergyNames.PLUS_FLY_ARMOR]: synergyPlusFlyArmorImg,
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
                    <FormLabel>Board placements</FormLabel>
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
                    <FormLabel>Armor</FormLabel>
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
                    <FormLabel>Might</FormLabel>
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
                    <FormLabel>Sniper</FormLabel>
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
                    <FormLabel>Movement</FormLabel>
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

const SideToggleContainer = ({ side, teamType }: { side: string; teamType: TeamType }) => {
    const [totalPoints, setTotalPoints] = useState(HoCConstants.MAX_AUGMENT_POINTS);
    const [placementSelection, setPlacementSelection] = useState<number | null>(null);
    const [armorSelection, setArmorSelection] = useState<number | null>(null);
    const [mightSelection, setMightSelection] = useState<number | null>(null);
    const [sniperSelection, setSniperSelection] = useState<number | null>(null);
    const [movementSelection, setMovementSelection] = useState<number | null>(null);
    const [possibleSynergies, setPossibleSynergies] = useState<SynergyWithLevel[]>([]);
    const [togglerType, setTogglerType] = useState<"Placement" | "Armor" | "Might" | "Sniper" | "Movement">(
        "Placement",
    );
    const [synergyPair, setSynergyPairType] = useState<"Chaos" | "Might" | "Nature" | "Life" | "">("");

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

    const manager = useManager();

    useEffect(() => {
        const connection = manager.onPossibleSynergiesUpdated.connect((sArray: SynergyWithLevel[]) => {
            setPossibleSynergies(sArray);
        });

        return () => {
            connection.disconnect();
        };
    }, [manager]);

    console.log("UI possibleSynergies");
    console.log(possibleSynergies);

    return (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, paddingTop: 2 }}>
            <Box sx={{ display: "flex", justifyContent: "center", gap: 2, flexWrap: "wrap" }}>
                <Tooltip title="Augment board placements" style={{ zIndex: 1 }}>
                    <IconButton onClick={() => setTogglerType("Placement")} title="Augment board placements">
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
                    <IconButton onClick={() => setTogglerType("Armor")} title="Augment armor">
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
                    <IconButton onClick={() => setTogglerType("Might")} title="Augment melee attack">
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
                    <IconButton onClick={() => setTogglerType("Sniper")} title="Augment ranged attack">
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
                    <IconButton onClick={() => setTogglerType("Movement")} title="Augment movement">
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

            <Box sx={{ display: "flex", justifyContent: "center", gap: 2, flexWrap: "wrap" }}>
                <Box sx={{ display: "flex", justifyContent: "center", gap: 0, flexBasis: { xs: "100%", sm: "auto" } }}>
                    <Tooltip title="Pick Supply synergy" style={{ zIndex: 1 }}>
                        <IconButton onClick={() => setSynergyPairType("Life")} title="Supply synergy">
                            <img
                                src={synergySupplyImg}
                                alt="Supply Icon"
                                style={{
                                    filter: togglerType === "Placement" ? "brightness(1.2)" : "brightness(0.6)",
                                    width: 45,
                                    height: 45,
                                }}
                            />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Pick Morale synergy" style={{ zIndex: 1 }}>
                        <IconButton onClick={() => setSynergyPairType("Life")} title="Morale synergy">
                            <img
                                src={synergyMoraleImg}
                                alt="Morale Icon"
                                style={{
                                    filter: togglerType === "Placement" ? "brightness(1.2)" : "brightness(0.6)",
                                    width: 45,
                                    height: 45,
                                }}
                            />
                        </IconButton>
                    </Tooltip>
                </Box>
                <Box sx={{ display: "flex", justifyContent: "center", gap: 0, flexBasis: { xs: "100%", sm: "auto" } }}>
                    <Tooltip title="Pick Slow on Shot synergy" style={{ zIndex: 1 }}>
                        <IconButton onClick={() => setSynergyPairType("Chaos")} title="Slow on Shot synergy">
                            <img
                                src={synergySlowOnShotImg}
                                alt="Slow on Shot Icon"
                                style={{
                                    filter: togglerType === "Placement" ? "brightness(1.2)" : "brightness(0.6)",
                                    width: 45,
                                    height: 45,
                                }}
                            />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Pick Break on Attack synergy" style={{ zIndex: 1 }}>
                        <IconButton onClick={() => setSynergyPairType("Chaos")} title="Break on Attack synergy">
                            <img
                                src={synergyBreakOnAttackImg}
                                alt="Break on Attack Icon"
                                style={{
                                    filter: togglerType === "Placement" ? "brightness(1.2)" : "brightness(0.6)",
                                    width: 45,
                                    height: 45,
                                }}
                            />
                        </IconButton>
                    </Tooltip>
                </Box>
                <Box sx={{ display: "flex", justifyContent: "center", gap: 0, flexBasis: { xs: "100%", sm: "auto" } }}>
                    <Tooltip title="Pick Auras Range synergy" style={{ zIndex: 1 }}>
                        <IconButton onClick={() => setSynergyPairType("Might")} title="Auras Range synergy">
                            <img
                                src={synergyAurasRangeImg}
                                alt="Auras Range Icon"
                                style={{
                                    filter: togglerType === "Placement" ? "brightness(1.2)" : "brightness(0.6)",
                                    width: 45,
                                    height: 45,
                                }}
                            />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Pick Abilities Power synergy" style={{ zIndex: 1 }}>
                        <IconButton onClick={() => setSynergyPairType("Might")} title="Abilities Power synergy">
                            <img
                                src={synergyAbilitiesPowerImg}
                                alt="Abilities Power Icon"
                                style={{
                                    filter: togglerType === "Placement" ? "brightness(1.2)" : "brightness(0.6)",
                                    width: 45,
                                    height: 45,
                                }}
                            />
                        </IconButton>
                    </Tooltip>
                </Box>
                <Box sx={{ display: "flex", justifyContent: "center", gap: 0, flexBasis: { xs: "100%", sm: "auto" } }}>
                    <Tooltip title="Pick Board Units synergy" style={{ zIndex: 1 }}>
                        <IconButton onClick={() => setSynergyPairType("Might")} title="Board Units synergy">
                            <img
                                src={synergyIncreaseBoardUnitsImg}
                                alt="Board Units Icon"
                                style={{
                                    filter: togglerType === "Placement" ? "brightness(1.2)" : "brightness(0.6)",
                                    width: 45,
                                    height: 45,
                                }}
                            />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Pick Fly Armor synergy" style={{ zIndex: 1 }}>
                        <IconButton onClick={() => setSynergyPairType("Might")} title="Fly Armor synergy">
                            <img
                                src={synergyPlusFlyArmorImg}
                                alt="Fly Armor Icon"
                                style={{
                                    filter: togglerType === "Placement" ? "brightness(1.2)" : "brightness(0.6)",
                                    width: 45,
                                    height: 45,
                                }}
                            />
                        </IconButton>
                    </Tooltip>
                </Box>
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
        </Box>
    );
};

export default SideToggleContainer;
