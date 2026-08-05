/*
 * The Sandbox army panel: the icon row of augment/synergy togglers, the remaining-points counter, the
 * radio list for the selected toggler, and the free artifact picker.
 *
 * This is the panel as it stood before the ranked pick/ban redesign. SideToggleContainer next door was
 * rewritten into always-expanded cards for the ranked draft screen, which changed how Sandbox looked even
 * though nothing in Sandbox asked for it - the two screens shared one component and only ranked wanted the
 * new shape. Splitting them keeps Sandbox stable while the pick UI keeps moving.
 */
import { Augment, HoCConstants, TeamType } from "@heroesofcrypto/common";
import React, { useState } from "react";
import { Box, FormControl, FormLabel, IconButton, Radio, RadioGroup, Sheet, Tooltip, Typography } from "@mui/joy";
import { usePixiManager } from "../../pixi/PixiGameManager";
import { images } from "../../generated/image_imports";
import { hocColors, hocDisplayFontFamily, hocFantasyRadioSx } from "../hocTheme";
import { ArtifactToggler } from "./ArtifactToggler";

const augmentBoardImg = new URL("../../../images/board_augment_256.webp", import.meta.url).toString();
const augmentArmorImg = new URL("../../../images/armor_augment_256.webp", import.meta.url).toString();
const augmentMightImg = new URL("../../../images/might_augment_256.webp", import.meta.url).toString();
const augmentEmpowerImg = new URL("../../../images/empower_augment_256.webp", import.meta.url).toString();
const augmentSniperImg = new URL("../../../images/sniper_augment_256.webp", import.meta.url).toString();
const augmentMovementImg = new URL("../../../images/movement_augment_256.webp", import.meta.url).toString();

/** Vite may hand an image URL back wrapped in a module object; unwrap so <img src> is always a string. */
const augmentIcon = (img: string): string => (img as unknown as { default?: string }).default ?? img;

/** The augment icon row, in display order. `kind` is both the tooltip's subject and the open-panel key. */
const AUGMENT_BUTTONS: ReadonlyArray<{
    kind: "Placement" | "Armor" | "Might" | "Empower" | "Sniper" | "Movement";
    title: string;
    alt: string;
    img: string;
}> = [
    { kind: "Placement", title: "Augment board placements", alt: "Placement Icon", img: augmentIcon(augmentBoardImg) },
    { kind: "Armor", title: "Augment armor", alt: "Armor Icon", img: augmentIcon(augmentArmorImg) },
    { kind: "Might", title: "Augment melee attack", alt: "Might Icon", img: augmentIcon(augmentMightImg) },
    { kind: "Empower", title: "Augment magic damage", alt: "Empower Icon", img: augmentIcon(augmentEmpowerImg) },
    { kind: "Sniper", title: "Augment ranged attack", alt: "Sniper Icon", img: augmentIcon(augmentSniperImg) },
    { kind: "Movement", title: "Augment movement", alt: "Movement Icon", img: augmentIcon(augmentMovementImg) },
];

// Above the board's gold edge trim (zIndex 2) and the sidebars (zIndex 1). At the old zIndex 1 the label
// rendered underneath the frame and was sliced off at the panel's edge.
const AUGMENT_TOOLTIP_Z = 10000;

// The setup deck is intentionally non-scrollable. Keep every augment choice compact enough that the
// longest panel (Sniper, with four rows) still leaves room for both team headers at laptop heights.
const compactAugmentSheetSx = {
    ...hocFantasyRadioSx,
    padding: 0.5,
    borderRadius: "md",
    borderColor: "rgba(112, 75, 42, 0.55)",
    fontWeight: 530,
    fontSynthesis: "weight",
    "& .MuiFormLabel-root": {
        marginBottom: 0.25,
        lineHeight: 1.15,
        fontWeight: 530,
        fontSynthesis: "weight",
    },
    "& .MuiRadioGroup-root": {
        gap: 0,
    },
    "& .MuiRadio-root": {
        minHeight: "26px",
        paddingBlock: 0,
        fontSize: "1.00625rem",
        lineHeight: 1.15,
        alignItems: "center",
    },
    "& .MuiRadio-label": {
        display: "flex",
        alignItems: "center",
        minHeight: "26px",
        lineHeight: 1.15,
        fontWeight: 530,
        fontSynthesis: "weight",
    },
} as const;

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
        <Box sx={{ width: "100%", mx: "auto", marginBottom: 0 }}>
            <Sheet variant="outlined" sx={compactAugmentSheetSx}>
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
        <Box sx={{ width: "100%", mx: "auto", marginBottom: 0 }}>
            {/* Remaining Points Text (Orange and Bold) */}
            {/* The Toggler Sheet */}
            <Sheet variant="outlined" sx={compactAugmentSheetSx}>
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
        <Box sx={{ width: "100%", mx: "auto", marginBottom: 0 }}>
            {/* Remaining Points Text (Orange and Bold) */}
            {/* The Toggler Sheet */}
            <Sheet variant="outlined" sx={compactAugmentSheetSx}>
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
        <Box sx={{ width: "100%", mx: "auto", marginBottom: 0 }}>
            {/* Remaining Points Text (Orange and Bold) */}
            {/* The Toggler Sheet */}
            <Sheet variant="outlined" sx={compactAugmentSheetSx}>
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
        <Box sx={{ width: "100%", mx: "auto", marginBottom: 0 }}>
            <Sheet variant="outlined" sx={compactAugmentSheetSx}>
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
        <Box sx={{ width: "100%", mx: "auto", marginBottom: 0 }}>
            <Sheet variant="outlined" sx={compactAugmentSheetSx}>
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
    // Free army-wide artifact picking (one per tier) is a SANDBOX-only tool. In ranked the artifacts are
    // drafted during the pick/ban phase and shown read-only (RankedArtifactsPanel), so the ranked view
    // passes false to hide the picker while keeping the augment/synergy togglers.
    showArtifactPicker = true,
    // Upgrade-point budget for augments. In ranked this is the perk's allotment (5/6/7 via
    // getUpgradePoints); Sandbox omits it and gets the full MAX_AUGMENT_POINTS default.
    budgetPoints = HoCConstants.MAX_AUGMENT_POINTS,
}: {
    side: string;
    teamType: TeamType;
    showArtifactPicker?: boolean;
    budgetPoints?: number;
}) => {
    const [totalPoints, setTotalPoints] = useState(budgetPoints);
    const [placementSelection, setPlacementSelection] = useState<number | null>(null);
    const [armorSelection, setArmorSelection] = useState<number | null>(null);
    const [mightSelection, setMightSelection] = useState<number | null>(null);
    const [empowerSelection, setEmpowerSelection] = useState<number | null>(null);
    const [sniperSelection, setSniperSelection] = useState<number | null>(null);
    const [movementSelection, setMovementSelection] = useState<number | null>(null);
    // Opening a team lands on Augments with Board Placement already showing — the first thing you set for a
    // side — instead of a bar of shut headers you have to click twice to get anywhere.
    const [togglerType, setTogglerType] = useState<
        "Placement" | "Armor" | "Might" | "Empower" | "Sniper" | "Movement" | "Synergy" | "None"
    >("Placement");

    // Two states in this bar and no more: the augment panel, or the artifacts block (both tiers at once).
    // Opening either closes the other, and at rest neither is open.
    const [artifactsOpen, setArtifactsOpen] = useState(false);
    const [augmentsOpen, setAugmentsOpen] = useState(true);

    const handleAugmentsToggle = () => {
        setAugmentsOpen((current) => !current);
        setArtifactsOpen(false);
    };
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

    const handleAugmentClick = (type: "Placement" | "Armor" | "Might" | "Empower" | "Sniper" | "Movement") => {
        // Second click on the open augment closes it, so the panel is never stuck open.
        setTogglerType((current) => (current === type ? "None" : type));
        setArtifactsOpen(false);
    };

    const handleArtifactsToggle = () => {
        setArtifactsOpen((current) => !current);
        setAugmentsOpen(false);
        setTogglerType("None");
    };

    return (
        <Box
            sx={{
                display: "flex",
                flexDirection: "column",
                gap: 0.5,
                paddingTop: 0.25,
                fontFamily: hocDisplayFontFamily,
                fontWeight: 460,
                fontSynthesis: "weight",
                "& .MuiTypography-root, & .MuiFormLabel-root": {
                    fontFamily: hocDisplayFontFamily,
                    fontWeight: 460,
                    fontSynthesis: "weight",
                },
            }}
        >
            {/* Header in the same shape as Artifacts below: a title and a collapse chevron, so the two
                blocks in this bar read as a pair rather than one titled section and one loose icon row. */}
            <Box
                component="button"
                type="button"
                onClick={handleAugmentsToggle}
                sx={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 1,
                    px: 0.5,
                    py: 0.25,
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    color: augmentsOpen ? "#FF8F00" : "inherit",
                    "&:hover": { backgroundColor: "rgba(255,255,255,0.05)" },
                }}
            >
                <Typography
                    level="title-sm"
                    sx={{ color: "inherit", fontSize: "1.1rem", letterSpacing: "0.06em", lineHeight: 1.25 }}
                >
                    Augments
                </Typography>
                <Box
                    component="img"
                    src={images.tr_up}
                    alt=""
                    sx={{
                        width: "12px",
                        transform: augmentsOpen ? "none" : "rotate(180deg)",
                        transition: "transform 0.2s",
                        filter: augmentsOpen
                            ? "brightness(0) saturate(100%) invert(58%) sepia(91%) saturate(3089%) hue-rotate(2deg) brightness(103%) contrast(104%)"
                            : "none",
                    }}
                />
            </Box>
            {augmentsOpen && (
                <>
                    {/* One row, always. Six 48px icons with gap 2 wrapped onto a second line in a narrow sidebar once
                    Empower made it six, so they now share the row with no gap and shrink to fit.

                    Written as a map over AUGMENT_BUTTONS rather than six near-identical Tooltip/IconButton
                    blocks: they differed only in image, label and key, and the selected-state styling had to
                    be repeated verbatim in each one. */}
                    <Box
                        sx={{
                            display: "flex",
                            justifyContent: "center",
                            gap: 0,
                            flexWrap: "nowrap",
                        }}
                    >
                        {AUGMENT_BUTTONS.map(({ kind, title, alt, img }) => {
                            const selected = togglerType === kind;
                            return (
                                <Tooltip key={kind} title={title} placement="right" sx={{ zIndex: AUGMENT_TOOLTIP_Z }}>
                                    <IconButton
                                        sx={{
                                            px: 0.25,
                                            py: 0.75,
                                            my: -0.5,
                                            minWidth: 0,
                                            flex: "1 1 0",
                                            cursor: "default !important",
                                            // The open augment used to be marked by brightness alone (1.2 vs
                                            // 0.6), which on six busy 48px illustrations was easy to miss —
                                            // several of them are bright to begin with. An amber frame in the
                                            // panel's own accent says which one is open at a glance. The
                                            // border is always present and merely transparent when idle, so
                                            // selecting an icon cannot nudge the row's layout.
                                            position: "relative",
                                            overflow: "hidden",
                                            isolation: "isolate",
                                            zIndex: selected ? 1 : 0,
                                            borderRadius: "3px",
                                            border: "1px solid transparent !important",
                                            backgroundColor: selected ? "rgba(255, 143, 0, 0.12)" : "transparent",
                                            boxShadow: selected ? "0 0 8px rgba(255, 143, 0, 0.45)" : "none",
                                            transition: "background-color 0.15s, box-shadow 0.15s",
                                            // Draw the selected ring above the artwork. A normal button border
                                            // sat underneath the full-bleed image, leaving only its side rails
                                            // visible; this overlay keeps all four sides equally clear.
                                            "&::after": {
                                                content: '""',
                                                position: "absolute",
                                                inset: 0,
                                                boxSizing: "border-box",
                                                zIndex: 10,
                                                pointerEvents: "none",
                                                borderRadius: "inherit",
                                                border: selected
                                                    ? `2px solid ${hocColors.orange}`
                                                    : "2px solid transparent",
                                                boxShadow: selected ? "inset 0 0 5px rgba(255, 194, 92, 0.28)" : "none",
                                            },
                                            // Hover deliberately paints NO frame. The frame means "this
                                            // augment's panel is the open one", and lighting one under the
                                            // cursor put that mark on two icons at once. Hover grows the art
                                            // instead — a transform, so the row does not reflow, and the
                                            // background is pinned to its resting value to stop Joy's own
                                            // plain-hover tint from standing in for the frame we just removed.
                                            "&:hover": {
                                                backgroundColor: selected ? "rgba(255, 143, 0, 0.12)" : "transparent",
                                            },
                                            "& img": { transform: selected ? "scale(1.15)" : "scale(1)" },
                                            "&:hover img": { transform: "scale(1.15)" },
                                        }}
                                        onClick={() => handleAugmentClick(kind)}
                                        title={title}
                                    >
                                        <img
                                            src={img}
                                            alt={alt}
                                            style={{
                                                filter: selected ? "brightness(1.2)" : "brightness(0.6)",
                                                width: "100%",
                                                height: "auto",
                                                maxWidth: 48,
                                                transition: "transform 0.15s",
                                            }}
                                        />
                                    </IconButton>
                                </Tooltip>
                            );
                        })}
                    </Box>
                    <Typography
                        sx={{
                            width: "93%",
                            mx: "auto",
                            color: "orange",
                            fontWeight: "bold",
                            paddingTop: 0,
                        }}
                    >
                        Remaining Points: {totalPoints}
                    </Typography>
                    {togglerType === "Placement" && (
                        <PlacementToggler
                            key={`placement-${teamType}`}
                            teamType={teamType}
                            title={side}
                            totalPoints={totalPoints}
                            onLevelChange={handleLevelChangeFor("Placement")}
                            currentSelection={placementSelection}
                        />
                    )}
                    {togglerType === "Armor" && (
                        <ArmorToggler
                            key={`armor-${teamType}`}
                            teamType={teamType}
                            title={side}
                            totalPoints={totalPoints}
                            onLevelChange={handleLevelChangeFor("Armor")}
                            currentSelection={armorSelection}
                        />
                    )}
                    {togglerType === "Might" && (
                        <MightToggler
                            key={`might-${teamType}`}
                            teamType={teamType}
                            title={side}
                            totalPoints={totalPoints}
                            onLevelChange={handleLevelChangeFor("Might")}
                            currentSelection={mightSelection}
                        />
                    )}
                    {togglerType === "Empower" && (
                        <EmpowerToggler
                            key={`empower-${teamType}`}
                            teamType={teamType}
                            title={side}
                            totalPoints={totalPoints}
                            onLevelChange={handleLevelChangeFor("Empower")}
                            currentSelection={empowerSelection}
                        />
                    )}
                    {togglerType === "Sniper" && (
                        <SniperToggler
                            key={`sniper-${teamType}`}
                            teamType={teamType}
                            title={side}
                            totalPoints={totalPoints}
                            onLevelChange={handleLevelChangeFor("Sniper")}
                            currentSelection={sniperSelection}
                        />
                    )}
                    {togglerType === "Movement" && (
                        <MovementToggler
                            key={`movement-${teamType}`}
                            teamType={teamType}
                            title={side}
                            totalPoints={totalPoints}
                            onLevelChange={handleLevelChangeFor("Movement")}
                            currentSelection={movementSelection}
                        />
                    )}
                </>
            )}
            {showArtifactPicker && (
                <ArtifactToggler teamType={teamType} isOpen={artifactsOpen} onToggle={handleArtifactsToggle} />
            )}
        </Box>
    );
};

export default SandboxToggleContainer;
