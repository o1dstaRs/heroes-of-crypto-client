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
    LifeSynergy,
    LifeSynergyNames,
    ChaosSynergy,
    ChaosSynergyNames,
    MightSynergy,
    MightSynergyNames,
    NatureSynergy,
    NatureSynergyNames,
    SpecificSynergy,
    SynergyKeysToPower,
    TeamType,
    FactionType,
    FactionVals,
} from "@heroesofcrypto/common";
import React, { useEffect, useState } from "react";
import { Radio, RadioGroup, FormControl, FormLabel, Sheet, Box, Typography, Tooltip } from "@mui/joy";
import { VisibleSynergyLevel } from "../../scenes/VisibleState";
import { usePixiManager } from "../../pixi/PixiGameManager";
import { ArtifactToggler } from "./ArtifactToggler";

// Above the board's gold edge trim (zIndex 2) and the sidebars (zIndex 1). At the old zIndex 1 the label
// rendered underneath the frame and was sliced off at the panel's edge.
const AUGMENT_TOOLTIP_Z = 10000;

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

const SYNERGY_NAME_TO_DESCRIPTION: Record<string, string> = {
    [LifeSynergyNames.PLUS_SUPPLY_PERCENTAGE]: "Increase each unit's supply by {}%",
    [LifeSynergyNames.PLUS_MORALE_AND_LUCK]: "The entire army gets +{} morale and +{} luck",
    [ChaosSynergyNames.MOVEMENT]: "Improve movement steps by {} cells",
    [ChaosSynergyNames.BREAK_ON_ATTACK]: "{}% chance to apply Break on attack",
    [MightSynergyNames.PLUS_AURAS_RANGE]: "Increase auras range by {} cells",
    [MightSynergyNames.PLUS_STACK_ABILITIES_POWER]: "Increase stack abilities power by {}%",
    [NatureSynergyNames.INCREASE_BOARD_UNITS]: "Place {} more units on the board",
    [NatureSynergyNames.PLUS_FLY_ARMOR]: "Flying units get +{}% armor",
};

/** Fill a synergy description's {} placeholders with the powers for this faction/variant/level. */
const synergyDescription = (faction: string, synergyValue: number, synergyName: string, level: number): string => {
    const template = SYNERGY_NAME_TO_DESCRIPTION[synergyName] ?? synergyName;
    const powers = SynergyKeysToPower[`${faction}:${synergyValue}:${Math.max(level, 1)}`] ?? [];
    let index = 0;
    return template.replace(/\{\}/g, () => String(powers[index++] ?? "?"));
};

/**
 * One faction's synergy pair for the NARROW sandbox sidebar: pick 1 of 2, free, unlocked at 2/4/6
 * units of the faction. The two variants stack vertically (the ranked screen's side-by-side panel
 * needs ~500px). The engine enforces the one-of-two rule — updateSynergyPerTeam strips the faction's
 * previous entry before writing the new pick — so re-picking the other variant SWITCHES, never stacks.
 */
const SandboxSynergyFactionPanel = ({
    faction,
    color,
    options,
    selectedLabel,
}: {
    faction: string;
    color: string;
    options: Array<{ label: string; level: number; synergyName: string; synergyValue: number; onSelect: () => void }>;
    selectedLabel?: string;
}) => {
    const level = Math.max(0, ...options.map((o) => o.level));
    const locked = level < 1;
    return (
        <Box
            sx={{
                p: "8px 10px",
                borderRadius: "12px",
                bgcolor: "#12151d",
                border: "1px solid rgba(255,255,255,0.1)",
                display: "flex",
                flexDirection: "column",
                gap: 0.5,
                order: locked ? 2 : 1,
            }}
        >
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <Typography
                    sx={{
                        fontSize: 12,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        color: locked ? "#5d636e" : color,
                        fontWeight: 700,
                    }}
                >
                    {faction}
                </Typography>
                <Typography sx={{ fontSize: 11, color: locked ? "#5d636e" : "#9aa0ab" }}>
                    {locked ? "needs 2 units" : `level ${level}`}
                </Typography>
            </Box>
            {options.map((option) => {
                const isSelected = selectedLabel === option.label;
                return (
                    <Tooltip
                        key={option.label}
                        title={synergyDescription(faction, option.synergyValue, option.synergyName, option.level)}
                        variant="soft"
                        placement="top"
                        sx={{ zIndex: AUGMENT_TOOLTIP_Z }}
                    >
                        <Box
                            component={locked ? "div" : "button"}
                            type={locked ? undefined : "button"}
                            onClick={locked ? undefined : option.onSelect}
                            sx={{
                                display: "flex",
                                alignItems: "center",
                                p: "6px 9px",
                                borderRadius: "10px",
                                cursor: locked ? "default" : "pointer",
                                opacity: locked ? 0.45 : 1,
                                border: locked
                                    ? "2px dashed rgba(255,255,255,0.14)"
                                    : isSelected
                                      ? "2px solid #3b9b5c"
                                      : "2px solid rgba(255,255,255,0.12)",
                                bgcolor: isSelected ? "rgba(59,155,92,0.16)" : "rgba(255,255,255,0.03)",
                                color: isSelected ? "#8ff0b4" : "#e9e6df",
                                fontSize: 12.5,
                                textAlign: "left",
                            }}
                        >
                            {option.label}
                        </Box>
                    </Tooltip>
                );
            })}
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
    const manager = usePixiManager();

    const handleSelectionChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const augmentType = Augment.ToPlacementAugment[event.target.value.toString()];
        if (manager.PropagateAugmentation(teamType, { type: "Placement", value: augmentType })) {
            onLevelChange(augmentType, currentSelection ?? 0);
        }
    };

    return (
        <Box sx={{ marginBottom: 0.5 }}>
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
                            label="Height 6 full + edge line"
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

    // All six categories are on screen at once (the pre-#129 sidebar the owner asked back), so the
    // change handler carries its category explicitly instead of reading a single-open togglerType.
    const handleLevelChangeFor =
        (kind: "Placement" | "Armor" | "Might" | "Empower" | "Sniper" | "Movement") =>
        (pointsUsed: number, previousPointsUsed: number) => {
            if (kind === "Placement") setPlacementSelection(pointsUsed);
            else if (kind === "Armor") setArmorSelection(pointsUsed);
            else if (kind === "Might") setMightSelection(pointsUsed);
            else if (kind === "Empower") setEmpowerSelection(pointsUsed);
            else if (kind === "Sniper") setSniperSelection(pointsUsed);
            else setMovementSelection(pointsUsed);
            // Functional update: two picks landing in one render batch must not read the same stale total.
            setTotalPoints((previousTotal) => previousTotal + previousPointsUsed - pointsUsed);
        };

    const handleTierToggle = (tier: number) => {
        setOpenTier((current) => (current === tier ? null : tier));
        setTogglerType("None");
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
        }
    };

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
            {/* Every augment category on screen at once — the pre-#129 sidebar layout, restored by
                owner request: no icon row hiding five of the six behind a toggler. */}
            <Typography sx={{ color: "orange", fontWeight: "bold", paddingTop: 1 }}>
                Remaining Points: {totalPoints}
            </Typography>
            <PlacementToggler
                key={`placement-${teamType}`}
                teamType={teamType}
                title={side}
                totalPoints={totalPoints}
                onLevelChange={handleLevelChangeFor("Placement")}
                currentSelection={placementSelection}
            />
            <ArmorToggler
                key={`armor-${teamType}`}
                teamType={teamType}
                title={side}
                totalPoints={totalPoints}
                onLevelChange={handleLevelChangeFor("Armor")}
                currentSelection={armorSelection}
            />
            <MightToggler
                key={`might-${teamType}`}
                teamType={teamType}
                title={side}
                totalPoints={totalPoints}
                onLevelChange={handleLevelChangeFor("Might")}
                currentSelection={mightSelection}
            />
            <EmpowerToggler
                key={`empower-${teamType}`}
                teamType={teamType}
                title={side}
                totalPoints={totalPoints}
                onLevelChange={handleLevelChangeFor("Empower")}
                currentSelection={empowerSelection}
            />
            <SniperToggler
                key={`sniper-${teamType}`}
                teamType={teamType}
                title={side}
                totalPoints={totalPoints}
                onLevelChange={handleLevelChangeFor("Sniper")}
                currentSelection={sniperSelection}
            />
            <MovementToggler
                key={`movement-${teamType}`}
                teamType={teamType}
                title={side}
                totalPoints={totalPoints}
                onLevelChange={handleLevelChangeFor("Movement")}
                currentSelection={movementSelection}
            />

            {/* Synergies: pick exactly ONE of each drafted faction's two variants — same rule as ranked,
                stacked vertically for the narrow sidebar. */}
            {(lifeAvailable || chaosAvailable || mightAvailable || natureAvailable) && (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    <Typography
                        sx={{
                            fontSize: 12,
                            letterSpacing: "0.14em",
                            textTransform: "uppercase",
                            color: "#9aa0ab",
                            fontWeight: 700,
                            textAlign: "center",
                        }}
                    >
                        Synergies
                    </Typography>
                    {lifeAvailable && (
                        <SandboxSynergyFactionPanel
                            faction="Life"
                            color="#e0d3b0"
                            selectedLabel={synergyPairLife?.name}
                            options={[
                                {
                                    label: "Supply",
                                    level: possibleSynergiesObj[LifeSynergyNames.PLUS_SUPPLY_PERCENTAGE] ?? 0,
                                    synergyName: LifeSynergyNames.PLUS_SUPPLY_PERCENTAGE,
                                    synergyValue: LifeSynergy.PLUS_SUPPLY_PERCENTAGE,
                                    onSelect: () =>
                                        handleSynergySelect(setSynergyPairTypeLife, {
                                            faction: FactionVals.LIFE as FactionType,
                                            synergyName: LifeSynergyNames.PLUS_SUPPLY_PERCENTAGE,
                                            synergyValue: LifeSynergy.PLUS_SUPPLY_PERCENTAGE,
                                            level: possibleSynergiesObj[LifeSynergyNames.PLUS_SUPPLY_PERCENTAGE] ?? 0,
                                            name: "Supply",
                                        }),
                                },
                                {
                                    label: "Morale & luck",
                                    level: possibleSynergiesObj[LifeSynergyNames.PLUS_MORALE_AND_LUCK] ?? 0,
                                    synergyName: LifeSynergyNames.PLUS_MORALE_AND_LUCK,
                                    synergyValue: LifeSynergy.PLUS_MORALE_AND_LUCK,
                                    onSelect: () =>
                                        handleSynergySelect(setSynergyPairTypeLife, {
                                            faction: FactionVals.LIFE as FactionType,
                                            synergyName: LifeSynergyNames.PLUS_MORALE_AND_LUCK,
                                            synergyValue: LifeSynergy.PLUS_MORALE_AND_LUCK,
                                            level: possibleSynergiesObj[LifeSynergyNames.PLUS_MORALE_AND_LUCK] ?? 0,
                                            name: "Morale & luck",
                                        }),
                                },
                            ]}
                        />
                    )}
                    {chaosAvailable && (
                        <SandboxSynergyFactionPanel
                            faction="Chaos"
                            color="#d98b8b"
                            selectedLabel={synergyPairChaos?.name}
                            options={[
                                {
                                    label: "Movement",
                                    level: possibleSynergiesObj[ChaosSynergyNames.MOVEMENT] ?? 0,
                                    synergyName: ChaosSynergyNames.MOVEMENT,
                                    synergyValue: ChaosSynergy.MOVEMENT,
                                    onSelect: () =>
                                        handleSynergySelect(setSynergyPairTypeChaos, {
                                            faction: FactionVals.CHAOS as FactionType,
                                            synergyName: ChaosSynergyNames.MOVEMENT,
                                            synergyValue: ChaosSynergy.MOVEMENT,
                                            level: possibleSynergiesObj[ChaosSynergyNames.MOVEMENT] ?? 0,
                                            name: "Movement",
                                        }),
                                },
                                {
                                    label: "Break on attack",
                                    level: possibleSynergiesObj[ChaosSynergyNames.BREAK_ON_ATTACK] ?? 0,
                                    synergyName: ChaosSynergyNames.BREAK_ON_ATTACK,
                                    synergyValue: ChaosSynergy.BREAK_ON_ATTACK,
                                    onSelect: () =>
                                        handleSynergySelect(setSynergyPairTypeChaos, {
                                            faction: FactionVals.CHAOS as FactionType,
                                            synergyName: ChaosSynergyNames.BREAK_ON_ATTACK,
                                            synergyValue: ChaosSynergy.BREAK_ON_ATTACK,
                                            level: possibleSynergiesObj[ChaosSynergyNames.BREAK_ON_ATTACK] ?? 0,
                                            name: "Break on attack",
                                        }),
                                },
                            ]}
                        />
                    )}
                    {mightAvailable && (
                        <SandboxSynergyFactionPanel
                            faction="Might"
                            color="#c8a96b"
                            selectedLabel={synergyPairMight?.name}
                            options={[
                                {
                                    label: "Auras range",
                                    level: possibleSynergiesObj[MightSynergyNames.PLUS_AURAS_RANGE] ?? 0,
                                    synergyName: MightSynergyNames.PLUS_AURAS_RANGE,
                                    synergyValue: MightSynergy.PLUS_AURAS_RANGE,
                                    onSelect: () =>
                                        handleSynergySelect(setSynergyPairTypeMight, {
                                            faction: FactionVals.MIGHT as FactionType,
                                            synergyName: MightSynergyNames.PLUS_AURAS_RANGE,
                                            synergyValue: MightSynergy.PLUS_AURAS_RANGE,
                                            level: possibleSynergiesObj[MightSynergyNames.PLUS_AURAS_RANGE] ?? 0,
                                            name: "Auras range",
                                        }),
                                },
                                {
                                    label: "Abilities power",
                                    level: possibleSynergiesObj[MightSynergyNames.PLUS_STACK_ABILITIES_POWER] ?? 0,
                                    synergyName: MightSynergyNames.PLUS_STACK_ABILITIES_POWER,
                                    synergyValue: MightSynergy.PLUS_STACK_ABILITIES_POWER,
                                    onSelect: () =>
                                        handleSynergySelect(setSynergyPairTypeMight, {
                                            faction: FactionVals.MIGHT as FactionType,
                                            synergyName: MightSynergyNames.PLUS_STACK_ABILITIES_POWER,
                                            synergyValue: MightSynergy.PLUS_STACK_ABILITIES_POWER,
                                            level:
                                                possibleSynergiesObj[MightSynergyNames.PLUS_STACK_ABILITIES_POWER] ?? 0,
                                            name: "Abilities power",
                                        }),
                                },
                            ]}
                        />
                    )}
                    {natureAvailable && (
                        <SandboxSynergyFactionPanel
                            faction="Nature"
                            color="#aebf92"
                            selectedLabel={synergyPairNature?.name}
                            options={[
                                {
                                    label: "Board units",
                                    level: possibleSynergiesObj[NatureSynergyNames.INCREASE_BOARD_UNITS] ?? 0,
                                    synergyName: NatureSynergyNames.INCREASE_BOARD_UNITS,
                                    synergyValue: NatureSynergy.INCREASE_BOARD_UNITS,
                                    onSelect: () =>
                                        handleSynergySelect(setSynergyPairTypeNature, {
                                            faction: FactionVals.NATURE as FactionType,
                                            synergyName: NatureSynergyNames.INCREASE_BOARD_UNITS,
                                            synergyValue: NatureSynergy.INCREASE_BOARD_UNITS,
                                            level: possibleSynergiesObj[NatureSynergyNames.INCREASE_BOARD_UNITS] ?? 0,
                                            name: "Board units",
                                        }),
                                },
                                {
                                    label: "Fly armor",
                                    level: possibleSynergiesObj[NatureSynergyNames.PLUS_FLY_ARMOR] ?? 0,
                                    synergyName: NatureSynergyNames.PLUS_FLY_ARMOR,
                                    synergyValue: NatureSynergy.PLUS_FLY_ARMOR,
                                    onSelect: () =>
                                        handleSynergySelect(setSynergyPairTypeNature, {
                                            faction: FactionVals.NATURE as FactionType,
                                            synergyName: NatureSynergyNames.PLUS_FLY_ARMOR,
                                            synergyValue: NatureSynergy.PLUS_FLY_ARMOR,
                                            level: possibleSynergiesObj[NatureSynergyNames.PLUS_FLY_ARMOR] ?? 0,
                                            name: "Fly armor",
                                        }),
                                },
                            ]}
                        />
                    )}
                </Box>
            )}

            {showArtifactPicker && (
                <ArtifactToggler teamType={teamType} openTier={openTier} onToggleTier={handleTierToggle} />
            )}
        </Box>
    );
};

export default SandboxToggleContainer;
