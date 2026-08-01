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
    NatureSynergy,
    SpecificSynergy,
    SynergyKeysToPower,
    TeamType,
    FactionType,
    FactionVals,
} from "@heroesofcrypto/common";
import React, { useEffect, useState } from "react";
import { Sheet, Box, Divider, Tooltip, Typography } from "@mui/joy";
import { VisibleSynergyLevel } from "../../scenes/VisibleState";
import { usePixiManager } from "../../pixi/PixiGameManager";
import { ArtifactToggler } from "./ArtifactToggler";
const augmentBoardImg = new URL("../../../images/board_augment_256.webp", import.meta.url).toString();
const augmentArmorImg = new URL("../../../images/armor_augment_256.webp", import.meta.url).toString();
const augmentMightImg = new URL("../../../images/might_augment_256.webp", import.meta.url).toString();
const augmentEmpowerImg = new URL("../../../images/empower_augment_256.webp", import.meta.url).toString();
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
    synergyName: string;
    synergyValue: SpecificSynergy;
    level: VisibleSynergyLevel;
    name: string;
};

type SynergyOption = {
    label: string;
    icon: string;
    level: number;
    synergyName: string;
    synergyValue: number;
    onSelect: () => void;
};

/**
 * Fill a synergy description's {} placeholders with the actual powers for this faction/variant/level
 * (SynergyKeysToPower is keyed `Faction:variant:level`; "Morale & luck" carries two values). Without
 * this the tooltip showed the raw template braces. A locked/unformed synergy previews level 1.
 */
const synergyDescription = (faction: string, synergyValue: number, synergyName: string, level: number): string => {
    const template = SYNERGY_NAME_TO_DESCRIPTION[synergyName] ?? synergyName;
    const powers = SynergyKeysToPower[`${faction}:${synergyValue}:${Math.max(level, 1)}`] ?? [];
    let index = 0;
    return template.replace(/\{\}/g, () => String(powers[index++] ?? "?"));
};

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
                flexDirection: "row",
                alignItems: "center",
                gap: 1,
                height: "100%",
                overflow: "hidden",
                // Fielded factions sort to the front; "needs 2 units" ones drop to the end.
                order: locked ? 2 : 1,
                // The side-by-side layout needs ~500px; in a narrow host (the sandbox/ranked sidebar,
                // via the augframe container on the component root) everything stacks vertically instead.
                "@container augframe (max-width: 520px)": {
                    flexDirection: "column",
                    alignItems: "stretch",
                    gap: 0.75,
                },
            }}
        >
            <Box
                sx={{
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    flex: "0 0 auto",
                    minWidth: 96,
                    // Narrow host: the label becomes a one-line header — faction left, level right.
                    "@container augframe (max-width: 520px)": {
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "baseline",
                        minWidth: 0,
                    },
                }}
            >
                <Typography
                    sx={{
                        fontSize: 13,
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                        color: locked ? "#5d636e" : color,
                        fontWeight: 700,
                    }}
                >
                    {faction}
                </Typography>
                <Typography sx={{ fontSize: 12, color: locked ? "#5d636e" : "#9aa0ab" }}>
                    {locked ? "needs 2 units" : `level ${level}`}
                </Typography>
            </Box>
            <Box
                sx={{
                    display: "flex",
                    gap: 1,
                    flex: "1 1 auto",
                    minWidth: 0,
                    // Narrow host: the two variant pills stack instead of sharing one cramped row.
                    "@container augframe (max-width: 520px)": { flexDirection: "column" },
                }}
            >
                {options.map((option) => {
                    const isSelected = selectedLabel === option.label;
                    return (
                        <Tooltip
                            key={option.label}
                            title={synergyDescription(faction, option.synergyValue, option.synergyName, option.level)}
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
                                <img src={option.icon} alt="" style={{ width: 22, height: 22, objectFit: "contain" }} />
                                <span
                                    style={{
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                        minWidth: 0,
                                    }}
                                >
                                    {option.label}
                                </span>
                                <span style={{ marginLeft: "auto", opacity: 0.7, fontSize: 12 }}>
                                    {option.level > 0 ? `lvl ${option.level}` : ""}
                                </span>
                            </Box>
                        </Tooltip>
                    );
                })}
            </Box>
        </Sheet>
    );
};
type AugmentCardOption = { value: number; label: string };

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
            sx={{
                p: "9px 12px",
                borderRadius: "18px",
                bgcolor: "#12151d",
                border: "1px solid rgba(255,255,255,0.12)",
                display: "flex",
                flexDirection: "column",
                minHeight: 0,
                height: "100%",
                overflow: "hidden",
            }}
        >
            <Box
                sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 1,
                    mb: 0.75,
                    flex: "0 0 auto",
                }}
            >
                {icon ? (
                    <img src={icon} alt="" style={{ width: 30, height: 30, objectFit: "contain" }} />
                ) : (
                    <Box
                        sx={{
                            width: 30,
                            height: 30,
                            borderRadius: "10px",
                            display: "grid",
                            placeItems: "center",
                            bgcolor: "rgba(255,255,255,0.06)",
                            border: "1px solid rgba(255,255,255,0.12)",
                            color: "#7c8290",
                            fontSize: 20,
                            fontWeight: 700,
                        }}
                    >
                        ?
                    </Box>
                )}
                <Typography sx={{ fontSize: 16, fontWeight: 600, color: "#e9e6df" }}>{label}</Typography>
            </Box>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75, flex: "1 1 auto", minHeight: 0 }}>
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
                                padding: "7px 12px",
                                borderRadius: "12px",
                                cursor: affordable || isSelected ? "pointer" : "default",
                                bgcolor: isSelected ? "rgba(220,177,88,0.14)" : "rgba(255,255,255,0.03)",
                                border: `1px solid ${isSelected ? "#dcb158" : "rgba(255,255,255,0.08)"}`,
                                color: affordable || isSelected ? "#e9e6df" : "#5d636e",
                                fontSize: 14,
                                textAlign: "left",
                            }}
                        >
                            <span>{option.label}</span>
                            <Box
                                component="span"
                                sx={{
                                    width: 16,
                                    height: 16,
                                    ml: "auto",
                                    borderRadius: "50%",
                                    flex: "0 0 auto",
                                    border: `2px solid ${isSelected ? "#4b90e2" : "rgba(255,255,255,0.35)"}`,
                                    boxShadow: isSelected ? "inset 0 0 0 3px #4b90e2" : "none",
                                }}
                            />
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
    unitFaction: _unitFaction,
    // Free army-wide artifact picking (one per tier) is a SANDBOX-only tool. In ranked the artifacts are
    // drafted during the pick/ban phase and shown read-only (RankedArtifactsPanel), so the ranked view
    // passes false to hide the picker while keeping the augment togglers.
    showArtifactPicker = true,
    // Upgrade-point budget for augments. In ranked this is the perk's allotment (5/6/7 via
    // getUpgradePoints); Sandbox omits it and gets the full MAX_AUGMENT_POINTS default.
    budgetPoints = HoCConstants.MAX_AUGMENT_POINTS,
    // Ranked reads this to gate its commit button: fires whenever the remaining augment points change.
    // Sandbox omits it.
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
    const [synergyPairLife, setSynergyPairTypeLife] = useState<SelectedSynergy | null>(null);
    const [synergyPairChaos, setSynergyPairTypeChaos] = useState<SelectedSynergy | null>(null);
    const [synergyPairMight, setSynergyPairTypeMight] = useState<SelectedSynergy | null>(null);
    const [synergyPairNature, setSynergyPairTypeNature] = useState<SelectedSynergy | null>(null);
    const handleLevelChange = (kind: Augment.AugmentType["type"], pointsUsed: number, previousPointsUsed: number) => {
        if (kind === "Placement") {
            setPlacementSelection(pointsUsed);
        } else if (kind === "Armor") {
            setArmorSelection(pointsUsed);
        } else if (kind === "Might") {
            setMightSelection(pointsUsed);
        } else if (kind === "Empower") {
            setEmpowerSelection(pointsUsed);
        } else if (kind === "Sniper") {
            setSniperSelection(pointsUsed);
        } else {
            setMovementSelection(pointsUsed);
        }
        // Functional update: two picks landing in the same render batch both read the same stale
        // totalPoints and the first one's spend was lost.
        setTotalPoints((previousTotal) => previousTotal + previousPointsUsed - pointsUsed);
    };

    const manager = usePixiManager();

    useEffect(() => {
        const connection = manager.onPossibleSynergiesUpdated.connect((sMap: Map<TeamType, SynergyWithLevel[]>) => {
            setPossibleSynergies(sMap);
        });

        return () => {
            connection.disconnect();
        };
    }, [manager]);

    // The possible synergies for THIS team, folded to the highest visible level per synergy name.
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

    const handleSynergySelect = (
        setSynergy: React.Dispatch<React.SetStateAction<SelectedSynergy | null>>,
        synergy: SelectedSynergy,
    ) => {
        if (
            synergy.level >= 1 &&
            manager.PropagateSynergy(teamType, synergy.faction, synergy.synergyName, synergy.level)
        ) {
            setSynergy(synergy);
        }
    };

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
    useEffect(() => {
        if (synergyPairLife && (possibleSynergiesObj[synergyPairLife.synergyName] ?? 0) < 1) {
            setSynergyPairTypeLife(null);
        }
        if (synergyPairChaos && (possibleSynergiesObj[synergyPairChaos.synergyName] ?? 0) < 1) {
            setSynergyPairTypeChaos(null);
        }
        if (synergyPairMight && (possibleSynergiesObj[synergyPairMight.synergyName] ?? 0) < 1) {
            setSynergyPairTypeMight(null);
        }
        if (synergyPairNature && (possibleSynergiesObj[synergyPairNature.synergyName] ?? 0) < 1) {
            setSynergyPairTypeNature(null);
        }
    }, [
        possibleSynergiesPerTeam,
        synergyPairLife,
        synergyPairChaos,
        synergyPairMight,
        synergyPairNature,
        possibleSynergiesObj,
    ]);
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
                { value: Augment.PlacementAugment.LEVEL_3, label: "Height 6 full + edge line" },
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
                    // Both halves, per d0dd7c7 on main: the Armor augment raises physical armor by a PERCENTAGE and
                    // adds its points FLAT to magic armor. Saying only "% armor" would hide the magic half entirely.
                    (level) => ({
                        value: level,
                        label: `+${Augment.getArmorPower(level)}% armor, +${Augment.getArmorPower(level)} magic armor`,
                    }),
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
        // Fill the PARENT, never the viewport: the ranked overlay already sizes itself to
        // min(1340px, 97vw), so 100% matches it exactly there — while in the sandbox right
        // sidebar a viewport-relative width escaped the panel and clipped the right column.
        // (Comment sits OUTSIDE the JSX tag: vite 8's oxc transform rejects `//` between attributes.)
        <Box
            sx={{
                display: "flex",
                flexDirection: "column",
                gap: 1.5,
                width: "min(1340px, 100%)",
                height: "100%",
                minHeight: 0,
                mx: "auto",
                // The card grid below queries "@container augframe" to fall to one card per row in a
                // narrow host (the sandbox/ranked sidebar). The declaration lives here on the root —
                // without it the query never matches and six cards squeeze into three columns.
                containerType: "inline-size",
                containerName: "augframe",
            }}
        >
            {/* Every category on screen at once: 4 columns, one card per augment, levels priced inline. */}
            <Box
                sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(3, minmax(0, 1fr))" },
                    gap: "10px",
                    width: "100%",
                    height: "100%",
                    minHeight: 0,
                    gridAutoRows: "minmax(0, 1fr)",
                    alignItems: "stretch",
                    // Narrow host (sandbox sidebar / squeezed ranked window): one card per row.
                    "@container augframe (max-width: 520px)": { gridTemplateColumns: "minmax(0, 1fr)" },
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

            <Box
                sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(2, minmax(0, 1fr))" },
                    width: "87%",
                    mx: "auto",
                    gap: "8px",
                    p: "8px",
                    borderRadius: "30px",
                    bgcolor: "rgba(255,255,255,0.025)",
                    border: "2px solid rgba(255,255,255,0.1)",
                    // Narrow host (sandbox/ranked sidebar): one faction panel per row, full width —
                    // two-across left each panel ~90px and clipped the labels.
                    "@container augframe (max-width: 520px)": {
                        gridTemplateColumns: "minmax(0, 1fr)",
                        width: "100%",
                        borderRadius: "18px",
                    },
                }}
            >
                {lifeAvailable && (
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
                                icon: (synergyMoraleImg as unknown as { default?: string }).default ?? synergyMoraleImg,
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
                {natureAvailable && (
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
                                icon:
                                    (synergyPlusFlyArmorImg as unknown as { default?: string }).default ??
                                    synergyPlusFlyArmorImg,
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
                {chaosAvailable && (
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
                                icon:
                                    (synergyBreakOnAttackImg as unknown as { default?: string }).default ??
                                    synergyBreakOnAttackImg,
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
                                icon:
                                    (synergyAbilitiesPowerImg as unknown as { default?: string }).default ??
                                    synergyAbilitiesPowerImg,
                                level: possibleSynergiesObj[MightSynergyNames.PLUS_STACK_ABILITIES_POWER] ?? 0,
                                synergyName: MightSynergyNames.PLUS_STACK_ABILITIES_POWER,
                                synergyValue: MightSynergy.PLUS_STACK_ABILITIES_POWER,
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
                )}
            </Box>

            {showArtifactPicker && <ArtifactToggler teamType={teamType} />}
        </Box>
    );
};

export default SideToggleContainer;
