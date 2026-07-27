import {
    Augment,
    HoCConstants,
    SynergyWithLevel,
    LifeSynergy,
    LifeSynergyNames,
    ChaosSynergyNames,
    ChaosSynergy,
    MightSynergyNames,
    MightSynergy,
    NatureSynergyNames,
    ToFactionName,
    NatureSynergy,
    SynergyKeysToPower,
    SpecificSynergy,
    TeamType,
    FactionType,
    FactionVals,
} from "@heroesofcrypto/common";
import React, { useEffect, useState } from "react";
import { Radio, RadioGroup, FormControl, FormLabel, Sheet, Box, Tooltip, Typography, Divider } from "@mui/joy";
import { VisibleSynergyLevel } from "../../scenes/VisibleState";
import { usePixiManager } from "../../pixi/PixiGameManager";
import { ArtifactToggler } from "./ArtifactToggler";
const augmentBoardImg = new URL("../../../images/board_augment_256.webp", import.meta.url).toString();
const augmentArmorImg = new URL("../../../images/armor_augment_256.webp", import.meta.url).toString();
const augmentMightImg = new URL("../../../images/might_augment_256.webp", import.meta.url).toString();
const augmentEmpowerImg = new URL("../../../images/empower_augment_256.webp", import.meta.url).toString();
// No dedicated Magic Defense art yet — the armour plate reads closest to "magic armour" of what ships today.
const augmentMagicDefenseImg = new URL("../../../images/armor_augment_256.webp", import.meta.url).toString();
const augmentSniperImg = new URL("../../../images/sniper_augment_256.webp", import.meta.url).toString();
const augmentMovementImg = new URL("../../../images/movement_augment_256.webp", import.meta.url).toString();
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

    const selectedSynergyFactionName = ToFactionName[selectedSynergy.faction];
    const selectedSynergyKey = `${selectedSynergyFactionName}:${selectedSynergy.synergyValue}:${selectedSynergy.level}`;

    return (
        <Box sx={{ marginBottom: 2 }}>
            <Sheet variant="outlined" sx={{ padding: 2, borderRadius: "md" }}>
                <FormControl>
                    <FormLabel>{`Picked ${selectedSynergy.name}`}</FormLabel>
                    <RadioGroup value={selectedSynergyKey}>
                        {Array.from({ length: HoCConstants.MAX_SYNERGY_LEVEL }, (_, i) => (
                            <Radio
                                key={`${selectedSynergyKey}:${i + 1}`}
                                value={`${selectedSynergyFactionName}:${selectedSynergy.synergyValue}:${i + 1}`}
                                label={`${SYNERGY_NAME_TO_DESCRIPTION[selectedSynergy.synergyName]
                                    ?.replace(
                                        "{}",
                                        SynergyKeysToPower[
                                            `${selectedSynergyFactionName}:${selectedSynergy.synergyValue}:${i + 1}`
                                        ]?.[0]?.toString() || "0",
                                    )
                                    ?.replace(
                                        "{}",
                                        SynergyKeysToPower[
                                            `${selectedSynergyFactionName}:${selectedSynergy.synergyValue}:${i + 1}`
                                        ]?.[1]?.toString() || "0",
                                    )}`}
                                disabled={
                                    selectedSynergyKey !==
                                    `${selectedSynergyFactionName}:${selectedSynergy.synergyValue}:${i + 1}`
                                }
                            />
                        ))}
                    </RadioGroup>
                </FormControl>
            </Sheet>
        </Box>
    );
};

type SynergyOption = {
    label: string;
    icon: string;
    level: number;
    synergyName: string;
    onSelect: () => void;
};

// One faction's synergy pair: pick 1 of 2, free, unlocked by how many units of that faction you drafted
// (2/4/6 -> level 1/2/3). A faction with too few units shows both options dashed and "needs 2 units".
const SynergyFactionPanel = ({
    faction,
    color,
    options,
    selectedLabel,
}: {
    faction: string;
    color: string;
    options: SynergyOption[];
    selectedLabel?: string;
}) => {
    const level = Math.max(0, ...options.map((o) => o.level));
    const locked = level < 1;
    return (
        <Sheet
            variant="outlined"
            sx={{
                p: "12px",
                borderRadius: "18px",
                bgcolor: "#12151d",
                border: "2px solid rgba(255,255,255,0.08)",
                display: "flex",
                flexDirection: "column",
                gap: 1,
            }}
        >
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <Typography
                    sx={{ fontSize: 14, letterSpacing: "0.12em", textTransform: "uppercase", color, fontWeight: 700 }}
                >
                    {faction}
                </Typography>
                <Typography sx={{ fontSize: 13, color: locked ? "#7c8290" : "#9aa0ab" }}>
                    {locked ? "needs 2 units" : `level ${level}`}
                </Typography>
            </Box>
            <Box sx={{ display: "flex", gap: 1 }}>
                {options.map((option) => {
                    const isSelected = selectedLabel === option.label;
                    return (
                        <Tooltip
                            key={option.label}
                            title={SYNERGY_NAME_TO_DESCRIPTION[option.synergyName] ?? option.label}
                            variant="soft"
                            placement="top"
                        >
                            <Box
                                component={locked ? "div" : "button"}
                                type={locked ? undefined : "button"}
                                onClick={locked ? undefined : option.onSelect}
                                sx={{
                                    flex: "1 1 0",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 1.25,
                                    p: "7px 10px",
                                    borderRadius: "14px",
                                    cursor: locked ? "default" : "pointer",
                                    opacity: locked ? 0.45 : 1,
                                    border: locked
                                        ? "2px dashed rgba(255,255,255,0.14)"
                                        : isSelected
                                          ? "2px solid #3b9b5c"
                                          : "2px solid rgba(255,255,255,0.12)",
                                    bgcolor: isSelected ? "rgba(59,155,92,0.16)" : "rgba(255,255,255,0.03)",
                                    color: isSelected ? "#8ff0b4" : "#e9e6df",
                                    fontSize: 13,
                                    textAlign: "left",
                                }}
                            >
                                <img src={option.icon} alt="" style={{ width: 26, height: 26, objectFit: "contain" }} />
                                <span>{option.label}</span>
                            </Box>
                        </Tooltip>
                    );
                })}
            </Box>
        </Sheet>
    );
};

type AugmentCardOption = { value: number; label: string };

// One augment category as a card: header + one row per level. Replaces the old icon-row + single-open
// toggler, so the whole budget is visible at once on the full-screen setup step.
const AugmentCard = ({
    label,
    icon,
    kind,
    options,
    teamType,
    totalPoints,
    currentSelection,
    onLevelChange,
}: {
    label: string;
    icon: string;
    kind: Augment.AugmentType["type"];
    options: AugmentCardOption[];
    teamType: TeamType;
    totalPoints: number;
    currentSelection: number | null;
    onLevelChange: (kind: Augment.AugmentType["type"], pointsUsed: number, previousPointsUsed: number) => void;
}) => {
    const manager = usePixiManager();
    const selected = currentSelection ?? 0;

    const select = (value: number) => {
        if (manager.PropagateAugmentation(teamType, { type: kind, value } as Augment.AugmentType)) {
            onLevelChange(kind, value, selected);
        }
    };

    return (
        <Sheet
            variant="outlined"
            sx={{ p: "12px", borderRadius: "18px", bgcolor: "#12151d", border: "1px solid rgba(255,255,255,0.12)" }}
        >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                <img src={icon} alt="" style={{ width: 36, height: 36, objectFit: "contain" }} />
                <Typography sx={{ fontSize: 17, fontWeight: 600, color: "#e9e6df" }}>{label}</Typography>
            </Box>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
                {options.map((option) => {
                    const isSelected = selected === option.value;
                    const affordable = totalPoints + selected >= option.value;
                    return (
                        <Box
                            key={option.value}
                            component="button"
                            type="button"
                            disabled={!affordable && !isSelected}
                            onClick={() => select(option.value)}
                            sx={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 1,
                                width: "100%",
                                padding: "5px 10px",
                                borderRadius: "12px",
                                cursor: affordable || isSelected ? "pointer" : "default",
                                bgcolor: isSelected ? "rgba(220,177,88,0.14)" : "rgba(255,255,255,0.03)",
                                border: `1px solid ${isSelected ? "#dcb158" : "rgba(255,255,255,0.08)"}`,
                                color: affordable || isSelected ? "#e9e6df" : "#5d636e",
                                fontSize: 13,
                                textAlign: "left",
                            }}
                        >
                            <span>{option.label}</span>
                            <span style={{ opacity: 0.75 }}>{option.value}</span>
                        </Box>
                    );
                })}
            </Box>
        </Sheet>
    );
};

const SideToggleContainer = ({
    side: _side,
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
    const [magicDefenseSelection, setMagicDefenseSelection] = useState<number | null>(null);
    const [sniperSelection, setSniperSelection] = useState<number | null>(null);
    const [movementSelection, setMovementSelection] = useState<number | null>(null);
    const [possibleSynergies, setPossibleSynergies] = useState<Map<TeamType, SynergyWithLevel[]>>(new Map());
    const [togglerType, setTogglerType] = useState<
        "Placement" | "Armor" | "Might" | "Empower" | "MagicDefense" | "Sniper" | "Movement" | "Synergy" | "None"
    >("Placement");
    const [selectedSynergy, setSelectedSynergy] = useState<SelectedSynergy | null>(null);
    const [synergyPairLife, setSynergyPairTypeLife] = useState<SelectedSynergy | null>(null);
    const [synergyPairChaos, setSynergyPairTypeChaos] = useState<SelectedSynergy | null>(null);
    const [synergyPairMight, setSynergyPairTypeMight] = useState<SelectedSynergy | null>(null);
    const [synergyPairNature, setSynergyPairTypeNature] = useState<SelectedSynergy | null>(null);
    const [synergyTogglerKey, setSynergyTogglerKey] = useState(0);

    const handleLevelChange = (kind: Augment.AugmentType["type"], pointsUsed: number, previousPointsUsed: number) => {
        if (kind === "Placement") {
            setPlacementSelection(pointsUsed);
        } else if (kind === "Armor") {
            setArmorSelection(pointsUsed);
        } else if (kind === "Might") {
            setMightSelection(pointsUsed);
        } else if (kind === "Empower") {
            setEmpowerSelection(pointsUsed);
        } else if (kind === "MagicDefense") {
            setMagicDefenseSelection(pointsUsed);
        } else if (kind === "Sniper") {
            setSniperSelection(pointsUsed);
        } else {
            setMovementSelection(pointsUsed);
        }
        setTotalPoints(totalPoints + previousPointsUsed - pointsUsed);
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
            // Force a re-render of the SynergyToggler by updating its key
            setSynergyTogglerKey((prev) => prev + 1);
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

    // One entry per augment category. The level value IS its point cost, which is why the option value can
    // double as the price shown on the right of each row.
    const augmentCards: Array<{
        kind: Augment.AugmentType["type"];
        label: string;
        icon: string;
        selection: number | null;
        options: AugmentCardOption[];
    }> = [
        {
            kind: "Placement",
            label: "Board placement",
            icon: (augmentBoardImg as unknown as { default?: string }).default ?? augmentBoardImg,
            selection: placementSelection,
            options: [
                { value: Augment.PlacementAugment.LEVEL_1, label: "Height 3 partial" },
                { value: Augment.PlacementAugment.LEVEL_2, label: "Height 4 full" },
                { value: Augment.PlacementAugment.LEVEL_3, label: "Height 5 full" },
            ],
        },
        {
            kind: "Armor",
            label: "Armor",
            icon: (augmentArmorImg as unknown as { default?: string }).default ?? augmentArmorImg,
            selection: armorSelection,
            options: [
                { value: Augment.ArmorAugment.NO_AUGMENT, label: "No augment" },
                ...[Augment.ArmorAugment.LEVEL_1, Augment.ArmorAugment.LEVEL_2, Augment.ArmorAugment.LEVEL_3].map(
                    (level) => ({ value: level, label: `+${Augment.getArmorPower(level)}% armor` }),
                ),
            ],
        },
        {
            kind: "Might",
            label: "Might",
            icon: (augmentMightImg as unknown as { default?: string }).default ?? augmentMightImg,
            selection: mightSelection,
            options: [
                { value: Augment.MightAugment.NO_AUGMENT, label: "No augment" },
                ...[Augment.MightAugment.LEVEL_1, Augment.MightAugment.LEVEL_2, Augment.MightAugment.LEVEL_3].map(
                    (level) => ({ value: level, label: `+${Augment.getMightPower(level)}% melee` }),
                ),
            ],
        },
        {
            kind: "Empower",
            label: "Magic",
            icon: (augmentEmpowerImg as unknown as { default?: string }).default ?? augmentEmpowerImg,
            selection: empowerSelection,
            options: [
                { value: Augment.EmpowerAugment.NO_AUGMENT, label: "No augment" },
                ...[Augment.EmpowerAugment.LEVEL_1, Augment.EmpowerAugment.LEVEL_2, Augment.EmpowerAugment.LEVEL_3].map(
                    (level) => ({ value: level, label: `+${Augment.getEmpowerPower(level)}% magic attack` }),
                ),
            ],
        },
        {
            kind: "MagicDefense",
            label: "Magic defense",
            icon: (augmentMagicDefenseImg as unknown as { default?: string }).default ?? augmentMagicDefenseImg,
            selection: magicDefenseSelection,
            options: [
                { value: Augment.MagicDefenseAugment.NO_AUGMENT, label: "No augment" },
                ...[
                    Augment.MagicDefenseAugment.LEVEL_1,
                    Augment.MagicDefenseAugment.LEVEL_2,
                    Augment.MagicDefenseAugment.LEVEL_3,
                ].map((level) => ({ value: level, label: `+${Augment.getMagicDefensePower(level)}% magic defense` })),
            ],
        },
        {
            kind: "Sniper",
            label: "Sniper",
            icon: (augmentSniperImg as unknown as { default?: string }).default ?? augmentSniperImg,
            selection: sniperSelection,
            options: [
                { value: Augment.SniperAugment.NO_AUGMENT, label: "No augment" },
                ...[Augment.SniperAugment.LEVEL_1, Augment.SniperAugment.LEVEL_2, Augment.SniperAugment.LEVEL_3].map(
                    (level) => ({
                        value: level,
                        label: `+${Augment.getSniperPower(level)[0]}% atk / +${Augment.getSniperPower(level)[1]}% range`,
                    }),
                ),
            ],
        },
        {
            kind: "Movement",
            label: "Movement",
            icon: (augmentMovementImg as unknown as { default?: string }).default ?? augmentMovementImg,
            selection: movementSelection,
            options: [
                { value: Augment.MovementAugment.NO_AUGMENT, label: "No augment" },
                ...[Augment.MovementAugment.LEVEL_1, Augment.MovementAugment.LEVEL_2].map((level) => ({
                    value: level,
                    label: `+${Augment.getMovementPower(level)} movement step${Augment.getMovementPower(level) > 1 ? "s" : ""}`,
                })),
            ],
        },
    ];

    return (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, paddingTop: 2 }}>
            {/* Every category on screen at once: 4 columns, one card per augment, levels priced inline. */}
            <Box
                sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(4, minmax(0, 1fr))" },
                    gap: "10px",
                }}
            >
                {augmentCards.map((card) => (
                    <AugmentCard
                        key={card.kind}
                        label={card.label}
                        icon={card.icon}
                        kind={card.kind}
                        options={card.options}
                        teamType={teamType}
                        totalPoints={totalPoints}
                        currentSelection={card.selection}
                        onLevelChange={handleLevelChange}
                    />
                ))}
            </Box>
            <Divider />

            {hasAnySynergies && (
                <Box
                    sx={{
                        display: "grid",
                        gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(4, minmax(0, 1fr))" },
                        gap: "14px",
                        p: "16px",
                        borderRadius: "30px",
                        bgcolor: "rgba(255,255,255,0.025)",
                        border: "2px solid rgba(255,255,255,0.1)",
                    }}
                >
                    <SynergyFactionPanel
                        faction="Life"
                        color="#e0d3b0"
                        selectedLabel={synergyPairLife?.name}
                        options={[
                            {
                                label: "Supply",
                                icon: (synergySupplyImg as unknown as { default?: string }).default ?? synergySupplyImg,
                                level: possibleSynergiesObj[LifeSynergyNames.PLUS_SUPPLY_PERCENTAGE] ?? 0,
                                synergyName: LifeSynergyNames.PLUS_SUPPLY_PERCENTAGE,
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
                                icon: (synergyMoraleImg as unknown as { default?: string }).default ?? synergyMoraleImg,
                                level: possibleSynergiesObj[LifeSynergyNames.PLUS_MORALE_AND_LUCK] ?? 0,
                                synergyName: LifeSynergyNames.PLUS_MORALE_AND_LUCK,
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
                    <SynergyFactionPanel
                        faction="Nature"
                        color="#aebf92"
                        selectedLabel={synergyPairNature?.name}
                        options={[
                            {
                                label: "Board units",
                                icon:
                                    (synergyIncreaseBoardUnitsImg as unknown as { default?: string }).default ??
                                    synergyIncreaseBoardUnitsImg,
                                level: possibleSynergiesObj[NatureSynergyNames.INCREASE_BOARD_UNITS] ?? 0,
                                synergyName: NatureSynergyNames.INCREASE_BOARD_UNITS,
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
                                icon:
                                    (synergyPlusFlyArmorImg as unknown as { default?: string }).default ??
                                    synergyPlusFlyArmorImg,
                                level: possibleSynergiesObj[NatureSynergyNames.PLUS_FLY_ARMOR] ?? 0,
                                synergyName: NatureSynergyNames.PLUS_FLY_ARMOR,
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
                    <SynergyFactionPanel
                        faction="Chaos"
                        color="#e0a06a"
                        selectedLabel={synergyPairChaos?.name}
                        options={[
                            {
                                label: "Movement",
                                icon:
                                    (synergyMovementImg as unknown as { default?: string }).default ??
                                    synergyMovementImg,
                                level: possibleSynergiesObj[ChaosSynergyNames.MOVEMENT] ?? 0,
                                synergyName: ChaosSynergyNames.MOVEMENT,
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
                                icon:
                                    (synergyBreakOnAttackImg as unknown as { default?: string }).default ??
                                    synergyBreakOnAttackImg,
                                level: possibleSynergiesObj[ChaosSynergyNames.BREAK_ON_ATTACK] ?? 0,
                                synergyName: ChaosSynergyNames.BREAK_ON_ATTACK,
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
                    <SynergyFactionPanel
                        faction="Might"
                        color="#9fb6d4"
                        selectedLabel={synergyPairMight?.name}
                        options={[
                            {
                                label: "Auras range",
                                icon:
                                    (synergyAurasRangeImg as unknown as { default?: string }).default ??
                                    synergyAurasRangeImg,
                                level: possibleSynergiesObj[MightSynergyNames.PLUS_AURAS_RANGE] ?? 0,
                                synergyName: MightSynergyNames.PLUS_AURAS_RANGE,
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
                                icon:
                                    (synergyAbilitiesPowerImg as unknown as { default?: string }).default ??
                                    synergyAbilitiesPowerImg,
                                level: possibleSynergiesObj[MightSynergyNames.PLUS_STACK_ABILITIES_POWER] ?? 0,
                                synergyName: MightSynergyNames.PLUS_STACK_ABILITIES_POWER,
                                onSelect: () =>
                                    handleSynergySelect(setSynergyPairTypeMight, {
                                        faction: FactionVals.MIGHT as FactionType,
                                        synergyName: MightSynergyNames.PLUS_STACK_ABILITIES_POWER,
                                        synergyValue: MightSynergy.PLUS_STACK_ABILITIES_POWER,
                                        level: possibleSynergiesObj[MightSynergyNames.PLUS_STACK_ABILITIES_POWER] ?? 0,
                                        name: "Abilities power",
                                    }),
                            },
                        ]}
                    />
                </Box>
            )}

            {togglerType === "Synergy" && <SynergyToggler key={synergyTogglerKey} selectedSynergy={selectedSynergy} />}

            {showArtifactPicker && <ArtifactToggler teamType={teamType} />}
        </Box>
    );
};

export default SideToggleContainer;
