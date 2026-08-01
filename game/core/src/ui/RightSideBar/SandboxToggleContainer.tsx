/*
 * The Sandbox army panel: the icon row of augment/synergy togglers, the remaining-points counter, the
 * radio list for the selected toggler, and the free artifact picker.
 *
 * This is the panel as it stood before the ranked pick/ban redesign. SideToggleContainer next door was
 * rewritten into always-expanded cards for the ranked draft screen, which changed how Sandbox looked even
 * though nothing in Sandbox asked for it - the two screens shared one component and only ranked wanted the
 * new shape. Splitting them keeps Sandbox stable while the pick UI keeps moving.
 */
import {
    Augment,
    HoCConstants,
    SynergyWithLevel,
    LifeSynergyNames,
    ChaosSynergyNames,
    MightSynergyNames,
    NatureSynergyNames,
    SpecificSynergy,
    TeamType,
    FactionType,
    FactionVals,
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
import { VisibleSynergyLevel } from "../../scenes/VisibleState";
import { usePixiManager } from "../../pixi/PixiGameManager";
import { ArtifactToggler } from "./ArtifactToggler";

// Above the board's gold edge trim (zIndex 2) and the sidebars (zIndex 1). At the old zIndex 1 the label
// rendered underneath the frame and was sliced off at the panel's edge.
const AUGMENT_TOOLTIP_Z = 10000;
const augmentBoardImg = new URL("../../../images/board_augment_256.webp", import.meta.url).toString();
const augmentArmorImg = new URL("../../../images/armor_augment_256.webp", import.meta.url).toString();
const augmentMightImg = new URL("../../../images/might_augment_256.webp", import.meta.url).toString();
const augmentEmpowerImg = new URL("../../../images/empower_augment_256.webp", import.meta.url).toString();
const augmentSniperImg = new URL("../../../images/sniper_augment_256.webp", import.meta.url).toString();
const augmentMovementImg = new URL("../../../images/movement_augment_256.webp", import.meta.url).toString();

const SYNERGY_NAME_TO_FACTION = {
    [LifeSynergyNames.PLUS_SUPPLY_PERCENTAGE]: FactionVals.LIFE,
    [LifeSynergyNames.PLUS_MORALE_AND_LUCK]: FactionVals.LIFE,
    [ChaosSynergyNames.MOVEMENT]: FactionVals.CHAOS,
    [ChaosSynergyNames.BREAK_ON_ATTACK]: FactionVals.CHAOS,
    [MightSynergyNames.PLUS_AURAS_RANGE]: FactionVals.MIGHT,
    [MightSynergyNames.PLUS_STACK_ABILITIES_POWER]: FactionVals.MIGHT,
    [NatureSynergyNames.INCREASE_BOARD_UNITS]: FactionVals.NATURE,
    [NatureSynergyNames.PLUS_FLY_ARMOR]: FactionVals.NATURE,
};

type SelectedSynergy = {
    faction: FactionType;
    synergyName: keyof typeof SYNERGY_NAME_TO_FACTION;
    synergyValue: SpecificSynergy;
    level: VisibleSynergyLevel;
    name: string;
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
    const manager = usePixiManager();

    const handleSelectionChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const augmentType = Augment.ToPlacementAugment[event.target.value.toString()];
        if (manager.PropagateAugmentation(teamType, { type: "Placement", value: augmentType })) {
            onLevelChange(augmentType, currentSelection ?? 0);
        }
    };

    return (
        <Box sx={{ marginBottom: 0.5 }}>
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
    const manager = usePixiManager();

    const handleSelectionChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const augmentType = Augment.ToArmorAugment[event.target.value.toString()];
        if (manager.PropagateAugmentation(teamType, { type: "Armor", value: augmentType })) {
            onLevelChange(augmentType, currentSelection ?? 0);
        }
    };

    return (
        <Box sx={{ marginBottom: 0.5 }}>
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
                            label={`+${Augment.getArmorPower(Augment.ArmorAugment.LEVEL_1)}% Armor & Magic Armor`}
                            disabled={
                                totalPoints + (currentSelection ?? 0) < Augment.ArmorAugment.LEVEL_1 &&
                                currentSelection !== Augment.ArmorAugment.LEVEL_1
                            }
                        />
                        <Radio
                            value={Augment.ArmorAugment.LEVEL_2}
                            label={`+${Augment.getArmorPower(Augment.ArmorAugment.LEVEL_2)}% Armor & Magic Armor`}
                            disabled={
                                totalPoints + (currentSelection ?? 0) < Augment.ArmorAugment.LEVEL_2 &&
                                currentSelection !== Augment.ArmorAugment.LEVEL_2
                            }
                        />
                        <Radio
                            value={Augment.ArmorAugment.LEVEL_3}
                            label={`+${Augment.getArmorPower(Augment.ArmorAugment.LEVEL_3)}% Armor & Magic Armor`}
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
    const manager = usePixiManager();

    const handleSelectionChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const augmentType = Augment.ToMightAugment[event.target.value.toString()];
        if (manager.PropagateAugmentation(teamType, { type: "Might", value: augmentType })) {
            onLevelChange(augmentType, currentSelection ?? 0);
        }
    };

    return (
        <Box sx={{ marginBottom: 0.5 }}>
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

const EmpowerToggler = ({
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
    const manager = usePixiManager();

    const handleSelectionChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const augmentType = Augment.ToEmpowerAugment[event.target.value.toString()];
        if (manager.PropagateAugmentation(teamType, { type: "Empower", value: augmentType })) {
            onLevelChange(augmentType, currentSelection ?? 0);
        }
    };

    return (
        <Box sx={{ marginBottom: 0.5 }}>
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
                    <FormLabel>Augment Empower</FormLabel>
                    <RadioGroup
                        name={`${title}-empower-type`}
                        onChange={handleSelectionChange}
                        value={currentSelection ?? Augment.EmpowerAugment.NO_AUGMENT}
                    >
                        <Radio value={Augment.EmpowerAugment.NO_AUGMENT} label="No Augment" />
                        <Radio
                            value={Augment.EmpowerAugment.LEVEL_1}
                            label={`+${Augment.getEmpowerPower(Augment.EmpowerAugment.LEVEL_1)}% Magic damage`}
                            disabled={
                                totalPoints + (currentSelection ?? 0) < Augment.EmpowerAugment.LEVEL_1 &&
                                currentSelection !== Augment.EmpowerAugment.LEVEL_1
                            }
                        />
                        <Radio
                            value={Augment.EmpowerAugment.LEVEL_2}
                            label={`+${Augment.getEmpowerPower(Augment.EmpowerAugment.LEVEL_2)}% Magic damage`}
                            disabled={
                                totalPoints + (currentSelection ?? 0) < Augment.EmpowerAugment.LEVEL_2 &&
                                currentSelection !== Augment.EmpowerAugment.LEVEL_2
                            }
                        />
                        <Radio
                            value={Augment.EmpowerAugment.LEVEL_3}
                            label={`+${Augment.getEmpowerPower(Augment.EmpowerAugment.LEVEL_3)}% Magic damage`}
                            disabled={
                                totalPoints + (currentSelection ?? 0) < Augment.EmpowerAugment.LEVEL_3 &&
                                currentSelection !== Augment.EmpowerAugment.LEVEL_3
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
    const manager = usePixiManager();

    const handleSelectionChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const augmentType = Augment.ToSniperAugment[event.target.value.toString()];
        if (manager.PropagateAugmentation(teamType, { type: "Sniper", value: augmentType })) {
            onLevelChange(augmentType, currentSelection ?? 0);
        }
    };

    return (
        <Box sx={{ marginBottom: 0.5 }}>
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
    const manager = usePixiManager();

    const handleSelectionChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const augmentType = Augment.ToMovementAugment[event.target.value.toString()];
        if (manager.PropagateAugmentation(teamType, { type: "Movement", value: augmentType })) {
            onLevelChange(augmentType, currentSelection ?? 0);
        }
    };

    return (
        <Box sx={{ marginBottom: 0.5 }}>
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

const SandboxToggleContainer = ({
    side,
    teamType,
    unitFaction,
    // Free army-wide artifact picking (one per tier) is a SANDBOX-only tool. In ranked the artifacts are
    // drafted during the pick/ban phase and shown read-only (RankedArtifactsPanel), so the ranked view
    // passes false to hide the picker while keeping the augment/synergy togglers.
    showArtifactPicker = true,
    // Upgrade-point budget for augments. In ranked this is the perk's allotment (5/6/7 via
    // getUpgradePoints); Sandbox omits it and gets the full MAX_AUGMENT_POINTS default.
    budgetPoints = HoCConstants.MAX_AUGMENT_POINTS,
    // Ranked reads this to gate its "Continue to placement" button: fires whenever the remaining augment
    // points or the "every available synergy is picked" status changes. Sandbox omits it.
    onReadyChange,
}: {
    side: string;
    teamType: TeamType;
    unitFaction?: FactionType;
    showArtifactPicker?: boolean;
    budgetPoints?: number;
    onReadyChange?: (state: { pointsRemaining: number; allSynergiesSelected: boolean }) => void;
}) => {
    const [totalPoints, setTotalPoints] = useState(budgetPoints);
    const [placementSelection, setPlacementSelection] = useState<number | null>(null);
    const [armorSelection, setArmorSelection] = useState<number | null>(null);
    const [mightSelection, setMightSelection] = useState<number | null>(null);
    const [empowerSelection, setEmpowerSelection] = useState<number | null>(null);
    const [sniperSelection, setSniperSelection] = useState<number | null>(null);
    const [movementSelection, setMovementSelection] = useState<number | null>(null);
    const [possibleSynergies, setPossibleSynergies] = useState<Map<TeamType, SynergyWithLevel[]>>(new Map());
    const [togglerType, setTogglerType] = useState<
        "Placement" | "Armor" | "Might" | "Empower" | "Sniper" | "Movement" | "Synergy" | "None"
    >("None");

    // Which artifact tier is expanded, if any. It lives here rather than inside ArtifactToggler because the
    // augment panel and the two tiers are one accordion: opening any of the three closes the other two, so a
    // single owner has to see all three states.
    const [openTier, setOpenTier] = useState<number | null>(null);
    const [selectedSynergy, setSelectedSynergy] = useState<SelectedSynergy | null>(null);
    const [synergyPairLife, setSynergyPairTypeLife] = useState<SelectedSynergy | null>(null);
    const [synergyPairChaos, setSynergyPairTypeChaos] = useState<SelectedSynergy | null>(null);
    const [synergyPairMight, setSynergyPairTypeMight] = useState<SelectedSynergy | null>(null);
    const [synergyPairNature, setSynergyPairTypeNature] = useState<SelectedSynergy | null>(null);

    // Function to handle augment button clicks
    const handleAugmentClick = (type: "Placement" | "Armor" | "Might" | "Empower" | "Sniper" | "Movement") => {
        // Second click on the open augment closes it, so the panel is never stuck open.
        setTogglerType((current) => (current === type ? "None" : type));
        setOpenTier(null);
        setSelectedSynergy(null); // Clear selected synergy when switching to augment
    };

    const handleTierToggle = (tier: number) => {
        setOpenTier((current) => (current === tier ? null : tier));
        setTogglerType("None");
    };

    const handleLevelChange = (pointsUsed: number, previousPointsUsed: number) => {
        if (togglerType === "Placement") {
            setPlacementSelection(pointsUsed);
        } else if (togglerType === "Armor") {
            setArmorSelection(pointsUsed);
        } else if (togglerType === "Might") {
            setMightSelection(pointsUsed);
        } else if (togglerType === "Empower") {
            setEmpowerSelection(pointsUsed);
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
            if (SYNERGY_NAME_TO_FACTION[synergyName as keyof typeof SYNERGY_NAME_TO_FACTION] === FactionVals.LIFE) {
                if (synergyPairLife !== null) {
                    setSynergyPairTypeLife(null);
                    if (togglerType === "Synergy" && (!unitFaction || unitFaction === FactionVals.LIFE)) {
                        setTogglerType("None");
                    }
                }
            } else if (
                SYNERGY_NAME_TO_FACTION[synergyName as keyof typeof SYNERGY_NAME_TO_FACTION] === FactionVals.CHAOS
            ) {
                if (synergyPairChaos !== null) {
                    setSynergyPairTypeChaos(null);
                    if (togglerType === "Synergy" && (!unitFaction || unitFaction === FactionVals.CHAOS)) {
                        setTogglerType("None");
                    }
                }
            } else if (
                SYNERGY_NAME_TO_FACTION[synergyName as keyof typeof SYNERGY_NAME_TO_FACTION] === FactionVals.MIGHT
            ) {
                if (synergyPairMight !== null) {
                    setSynergyPairTypeMight(null);
                    if (togglerType === "Synergy" && (!unitFaction || unitFaction === FactionVals.MIGHT)) {
                        setTogglerType("None");
                    }
                }
            } else if (
                SYNERGY_NAME_TO_FACTION[synergyName as keyof typeof SYNERGY_NAME_TO_FACTION] === FactionVals.NATURE
            ) {
                if (synergyPairNature !== null) {
                    setSynergyPairTypeNature(null);
                    if (togglerType === "Synergy" && (!unitFaction || unitFaction === FactionVals.NATURE)) {
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
        }
    }

    const manager = usePixiManager();

    useEffect(() => {
        const connection = manager.onPossibleSynergiesUpdated.connect((sMap: Map<TeamType, SynergyWithLevel[]>) => {
            setPossibleSynergies(sMap);
        });

        return () => {
            connection.disconnect();
        };
    }, [manager]);

    // A faction's synergy is "done" when it isn't available for this army, or the player has picked one of
    // its two variants. All available synergies are selected once every faction is done.
    const lifeAvailable =
        possibleSynergiesObj[LifeSynergyNames.PLUS_SUPPLY_PERCENTAGE] > 0 ||
        possibleSynergiesObj[LifeSynergyNames.PLUS_MORALE_AND_LUCK] > 0;
    const chaosAvailable =
        possibleSynergiesObj[ChaosSynergyNames.MOVEMENT] > 0 ||
        possibleSynergiesObj[ChaosSynergyNames.BREAK_ON_ATTACK] > 0;
    const mightAvailable =
        possibleSynergiesObj[MightSynergyNames.PLUS_AURAS_RANGE] > 0 ||
        possibleSynergiesObj[MightSynergyNames.PLUS_STACK_ABILITIES_POWER] > 0;
    const natureAvailable =
        possibleSynergiesObj[NatureSynergyNames.INCREASE_BOARD_UNITS] > 0 ||
        possibleSynergiesObj[NatureSynergyNames.PLUS_FLY_ARMOR] > 0;
    const allSynergiesSelected =
        (!lifeAvailable || synergyPairLife !== null) &&
        (!chaosAvailable || synergyPairChaos !== null) &&
        (!mightAvailable || synergyPairMight !== null) &&
        (!natureAvailable || synergyPairNature !== null);

    // Report readiness up to ranked (points + synergies), stably: onReadyChange should be a stable setter
    // so this only re-fires when the remaining points or synergy-completion actually change.
    useEffect(() => {
        onReadyChange?.({ pointsRemaining: totalPoints, allSynergiesSelected });
    }, [onReadyChange, totalPoints, allSynergiesSelected]);

    return (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, paddingTop: 2 }}>
            {/* One row, always. Six 48px icons with gap 2 wrapped onto a second line in a narrow sidebar once
                Empower made it six, so they now share the row with no gap and shrink to fit. */}
            <Box sx={{ display: "flex", justifyContent: "center", gap: 0, flexWrap: "nowrap" }}>
                <Tooltip title="Augment board placements" sx={{ zIndex: AUGMENT_TOOLTIP_Z }}>
                    <IconButton
                        sx={{ p: 0.25, minWidth: 0, flex: "1 1 0" }}
                        onClick={() => handleAugmentClick("Placement")}
                        title="Augment board placements"
                    >
                        <img
                            src={(augmentBoardImg as unknown as { default?: string }).default ?? augmentBoardImg}
                            alt="Placement Icon"
                            style={{
                                filter: togglerType === "Placement" ? "brightness(1.2)" : "brightness(0.6)",
                                width: "100%",
                                height: "auto",
                                maxWidth: 48,
                            }}
                        />
                    </IconButton>
                </Tooltip>
                <Tooltip title="Augment armor" sx={{ zIndex: AUGMENT_TOOLTIP_Z }}>
                    <IconButton
                        sx={{ p: 0.25, minWidth: 0, flex: "1 1 0" }}
                        onClick={() => handleAugmentClick("Armor")}
                        title="Augment armor"
                    >
                        <img
                            src={(augmentArmorImg as unknown as { default?: string }).default ?? augmentArmorImg}
                            alt="Armor Icon"
                            style={{
                                filter: togglerType === "Armor" ? "brightness(1.2)" : "brightness(0.6)",
                                width: "100%",
                                height: "auto",
                                maxWidth: 48,
                            }}
                        />
                    </IconButton>
                </Tooltip>
                <Tooltip title="Augment melee attack" sx={{ zIndex: AUGMENT_TOOLTIP_Z }}>
                    <IconButton
                        sx={{ p: 0.25, minWidth: 0, flex: "1 1 0" }}
                        onClick={() => handleAugmentClick("Might")}
                        title="Augment melee attack"
                    >
                        <img
                            src={(augmentMightImg as unknown as { default?: string }).default ?? augmentMightImg}
                            alt="Might Icon"
                            style={{
                                filter: togglerType === "Might" ? "brightness(1.2)" : "brightness(0.6)",
                                width: "100%",
                                height: "auto",
                                maxWidth: 48,
                            }}
                        />
                    </IconButton>
                </Tooltip>
                <Tooltip title="Augment magic damage" sx={{ zIndex: AUGMENT_TOOLTIP_Z }}>
                    <IconButton
                        sx={{ p: 0.25, minWidth: 0, flex: "1 1 0" }}
                        onClick={() => handleAugmentClick("Empower")}
                        title="Augment magic damage"
                    >
                        <img
                            src={(augmentEmpowerImg as unknown as { default?: string }).default ?? augmentEmpowerImg}
                            alt="Empower Icon"
                            style={{
                                filter: togglerType === "Empower" ? "brightness(1.2)" : "brightness(0.6)",
                                width: "100%",
                                height: "auto",
                                maxWidth: 48,
                            }}
                        />
                    </IconButton>
                </Tooltip>
                <Tooltip title="Augment ranged attack" sx={{ zIndex: AUGMENT_TOOLTIP_Z }}>
                    <IconButton
                        sx={{ p: 0.25, minWidth: 0, flex: "1 1 0" }}
                        onClick={() => handleAugmentClick("Sniper")}
                        title="Augment ranged attack"
                    >
                        <img
                            src={(augmentSniperImg as unknown as { default?: string }).default ?? augmentSniperImg}
                            alt="Sniper Icon"
                            style={{
                                filter: togglerType === "Sniper" ? "brightness(1.2)" : "brightness(0.6)",
                                width: "100%",
                                height: "auto",
                                maxWidth: 48,
                            }}
                        />
                    </IconButton>
                </Tooltip>
                <Tooltip title="Augment movement" sx={{ zIndex: AUGMENT_TOOLTIP_Z }}>
                    <IconButton
                        sx={{ p: 0.25, minWidth: 0, flex: "1 1 0" }}
                        onClick={() => handleAugmentClick("Movement")}
                        title="Augment movement"
                    >
                        <img
                            src={(augmentMovementImg as unknown as { default?: string }).default ?? augmentMovementImg}
                            alt="Movement Icon"
                            style={{
                                filter: togglerType === "Movement" ? "brightness(1.2)" : "brightness(0.6)",
                                width: "100%",
                                height: "auto",
                                maxWidth: 48,
                            }}
                        />
                    </IconButton>
                </Tooltip>
            </Box>
            <Divider />

            {togglerType !== "None" && (
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
                    ) : togglerType === "Empower" ? (
                        <EmpowerToggler
                            key={teamType}
                            teamType={teamType}
                            title={side}
                            totalPoints={totalPoints}
                            onLevelChange={handleLevelChange}
                            currentSelection={empowerSelection}
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
            )}

            {showArtifactPicker && (
                <ArtifactToggler teamType={teamType} openTier={openTier} onToggleTier={handleTierToggle} />
            )}
        </Box>
    );
};

export default SandboxToggleContainer;
