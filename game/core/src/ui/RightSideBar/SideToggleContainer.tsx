import { Augment, HoCConstants, TeamType, FactionType } from "@heroesofcrypto/common";
import React, { useEffect, useState } from "react";
import { Sheet, Box, Typography } from "@mui/joy";
import { usePixiManager } from "../../pixi/PixiGameManager";
import { ArtifactToggler } from "./ArtifactToggler";
const augmentBoardImg = new URL("../../../images/board_augment_256.webp", import.meta.url).toString();
const augmentArmorImg = new URL("../../../images/armor_augment_256.webp", import.meta.url).toString();
const augmentMightImg = new URL("../../../images/might_augment_256.webp", import.meta.url).toString();
const augmentEmpowerImg = new URL("../../../images/empower_augment_256.webp", import.meta.url).toString();
const augmentSniperImg = new URL("../../../images/sniper_augment_256.webp", import.meta.url).toString();
const augmentMovementImg = new URL("../../../images/movement_augment_256.webp", import.meta.url).toString();
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
                <Typography sx={{ fontSize: 20.5, fontWeight: 600, color: "#e9e6df" }}>{label}</Typography>
            </Box>
            <Box
                sx={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 0.75,
                    flex: "1 1 auto",
                    minHeight: 0,
                    overflow: "hidden",
                }}
            >
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
                                // Share the card's spare height between the options rather than each one
                                // claiming a fixed slice — the fourth row used to hang out of the card.
                                flex: "1 1 0",
                                minHeight: 30,
                                padding: "6px 12px",
                                borderRadius: "12px",
                                cursor: affordable || isSelected ? "pointer" : "default",
                                bgcolor: isSelected ? "rgba(220,177,88,0.14)" : "rgba(255,255,255,0.03)",
                                border: `1px solid ${isSelected ? "#dcb158" : "rgba(255,255,255,0.08)"}`,
                                color: affordable || isSelected ? "#e9e6df" : "#5d636e",
                                fontSize: 15.5,
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

    // Report readiness up to ranked, stably: onReadyChange should be a stable setter so this only re-fires
    // when the remaining points actually change. Synergies are drawn per game and level themselves from the
    // drafted factions, so there is nothing here for the player to complete.
    useEffect(() => {
        onReadyChange?.({ pointsRemaining: totalPoints, allSynergiesSelected: true });
    }, [onReadyChange, totalPoints]);

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
            {showArtifactPicker && <ArtifactToggler teamType={teamType} />}
        </Box>
    );
};

export default SideToggleContainer;
