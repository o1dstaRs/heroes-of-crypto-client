import { Augment, HoCConstants, TeamType, FactionType } from "@heroesofcrypto/common";
import React, { useEffect, useState } from "react";
import { Sheet, Box, Radio, Tooltip, Typography } from "@mui/joy";
import { usePixiManager } from "../../pixi/PixiGameManager";
import { t, tf, useTranslation } from "../../i18n/i18n";
import { hocFantasyRadioSx } from "../hocTheme";
import { ArtifactToggler } from "./ArtifactToggler";
import { AugmentSelections, remainingAugmentPoints } from "./augmentSelectionState";
const augmentBoardImg = new URL("../../../images/board_augment_256.webp", import.meta.url).toString();
const augmentArmorImg = new URL("../../../images/armor_augment_256.webp", import.meta.url).toString();
const augmentMightImg = new URL("../../../images/might_augment_256.webp", import.meta.url).toString();
const augmentEmpowerImg = new URL("../../../images/empower_augment_256.webp", import.meta.url).toString();
const augmentSniperImg = new URL("../../../images/sniper_augment_256.webp", import.meta.url).toString();
const augmentMovementImg = new URL("../../../images/movement_augment_256.webp", import.meta.url).toString();
type AugmentCardOption = { value: number; label: string };

const AUGMENT_DESCRIPTIONS: Record<Augment.AugmentType["type"], string> = {
    Placement: "Expands the deployment zone before battle.",
    Armor: "Raises physical Armor and adds flat Magic Armor to every unit.",
    Might: "Increases every unit's melee attack damage.",
    Empower: "Increases magic damage from spells, abilities and effects.",
    Sniper: "Increases ranged attack damage and effective shooting range.",
    Movement: "Adds movement steps to every unit.",
};

const PlacementMiniBoard: React.FC<{
    rows: number;
    partial?: boolean;
    edge?: boolean;
    label: string;
}> = ({ rows, partial = false, edge = false, label }) => (
    <Box sx={{ display: "grid", justifyItems: "center", gap: 0.5, minWidth: 82 }}>
        <Box
            aria-label={t(label)}
            sx={{
                width: 76,
                height: 56,
                p: "3px",
                display: "grid",
                gridTemplateColumns: "repeat(8, minmax(0, 1fr))",
                gridTemplateRows: "repeat(8, minmax(0, 1fr))",
                gap: "1px",
                borderRadius: "5px",
                bgcolor: "rgba(5,6,6,.92)",
                border: "1px solid rgba(151,103,52,.7)",
                boxShadow: "inset 0 0 8px rgba(0,0,0,.78)",
            }}
        >
            {Array.from({ length: 64 }, (_, index) => {
                const row = Math.floor(index / 8);
                const column = index % 8;
                const fromBottom = 7 - row;
                const withinHeight = edge ? fromBottom < rows : fromBottom >= 1 && fromBottom <= rows;
                const withinWidth = !partial || (column > 0 && column < 7);
                const active = withinHeight && withinWidth;
                const edgeCell = active && edge && fromBottom === 0;
                return (
                    <Box
                        key={index}
                        sx={{
                            minWidth: 0,
                            minHeight: 0,
                            borderRadius: "1px",
                            bgcolor: edgeCell
                                ? "rgba(239,191,91,.96)"
                                : active
                                  ? "rgba(172,113,45,.78)"
                                  : "rgba(255,255,255,.045)",
                            border: active
                                ? `1px solid ${edgeCell ? "rgba(255,224,147,.82)" : "rgba(218,162,79,.5)"}`
                                : "1px solid rgba(255,255,255,.025)",
                        }}
                    />
                );
            })}
        </Box>
        <Typography sx={{ fontSize: 11.5, lineHeight: 1.1, color: "#efe4cc", whiteSpace: "nowrap" }}>
            {t(label)}
        </Typography>
    </Box>
);

const AugmentTooltipContent: React.FC<{ kind: Augment.AugmentType["type"] }> = ({ kind }) => (
    <Box sx={{ width: kind === "Placement" ? 330 : 260, p: 0.4 }}>
        <Typography sx={{ fontSize: 14, lineHeight: 1.35, color: "#efe4cc" }}>
            {t(AUGMENT_DESCRIPTIONS[kind])}
        </Typography>
        {kind === "Placement" && (
            <>
                <Typography sx={{ mt: 0.35, mb: 0.8, fontSize: 11.5, color: "rgba(239,228,204,.64)" }}>
                    {t("Rectangular board — highlighted cells are available for deployment.")}
                </Typography>
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 0.45 }}>
                    <PlacementMiniBoard rows={3} partial label="3 · partial" />
                    <Typography aria-hidden sx={{ color: "#dcb158", fontSize: 17 }}>
                        →
                    </Typography>
                    <PlacementMiniBoard rows={4} label="4 · full" />
                    <Typography aria-hidden sx={{ color: "#dcb158", fontSize: 17 }}>
                        →
                    </Typography>
                    <PlacementMiniBoard rows={6} edge label="6 · edge line" />
                </Box>
            </>
        )}
    </Box>
);

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
                position: "relative",
                borderRadius: "14px",
                bgcolor: "transparent",
                border: "2px solid rgba(145,104,67,.82)",
                boxShadow:
                    "inset 0 0 0 1px rgba(12,9,7,.95), inset 0 0 0 3px rgba(79,68,58,.32), 0 3px 8px rgba(0,0,0,.58)",
                display: "flex",
                flexDirection: "column",
                minHeight: 0,
                height: "100%",
                overflow: "hidden",
                "&::before": {
                    content: '\"\"',
                    position: "absolute",
                    inset: "4px",
                    zIndex: 0,
                    pointerEvents: "none",
                    background:
                        "linear-gradient(rgba(0,0,0,.25), rgba(0,0,0,.25)), linear-gradient(160deg, rgba(30,18,7,.64) 0%, rgba(9,6,2,.70) 100%)",
                    borderRadius: "10px",
                },
                "&::after": {
                    content: '\"\"',
                    position: "absolute",
                    inset: "3px",
                    zIndex: 3,
                    pointerEvents: "none",
                    boxSizing: "border-box",
                    border: "1px solid rgba(52,44,38,.92)",
                    borderRadius: "11px",
                },
            }}
        >
            <Tooltip
                title={<AugmentTooltipContent kind={kind} />}
                placement="top"
                variant="soft"
                arrow
                enterDelay={240}
                sx={{
                    maxWidth: "none",
                    bgcolor: "#171a1c",
                    backgroundImage: "linear-gradient(145deg, rgba(31,34,36,.99), rgba(20,22,23,.99))",
                    border: "1px solid rgba(211,166,91,.18)",
                    boxShadow: "0 8px 22px rgba(0,0,0,.7)",
                    zIndex: 10000,
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
                        position: "relative",
                        zIndex: 1,
                        cursor: "help",
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
                    <Typography
                        sx={{
                            fontSize: 20.5,
                            fontWeight: 400,
                            fontSynthesis: "none",
                            lineHeight: 1.1,
                            letterSpacing: "0.055em",
                            color: "#efe4cc",
                            textTransform: "uppercase",
                            textShadow: "0 2px 2px #000, 0 0 14px rgba(210,160,90,.16)",
                        }}
                    >
                        {t(label)}
                    </Typography>
                </Box>
            </Tooltip>
            <Box
                sx={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 0.75,
                    flex: "1 1 auto",
                    minHeight: 0,
                    overflow: "hidden",
                    position: "relative",
                    zIndex: 1,
                }}
            >
                {options.map((option) => {
                    const isSelected = selected === option.value;
                    const affordable = totalPoints + selected >= option.value;
                    return (
                        <Box
                            key={option.value}
                            component="label"
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
                                ...hocFantasyRadioSx,
                            }}
                        >
                            <span>{option.label}</span>
                            <Radio
                                name={`augment-${kind}`}
                                value={option.value}
                                checked={isSelected}
                                disabled={!affordable && !isSelected}
                                onChange={() => select(option.value)}
                                sx={{
                                    ml: "auto",
                                    flex: "0 0 auto",
                                    p: 0,
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
    // Ranked snapshots own the committed build. Rehydrate from it so a refresh/remount does not show a
    // blank picker with a full budget while the server is still enforcing the already-spent points.
    authoritativeSelections,
}: {
    side: string;
    teamType: TeamType;
    unitFaction?: FactionType;
    showArtifactPicker?: boolean;
    budgetPoints?: number;
    onReadyChange?: (state: { pointsRemaining: number; allSynergiesSelected: boolean }) => void;
    authoritativeSelections?: AugmentSelections;
}) => {
    useTranslation();
    const authoritativePlacement = authoritativeSelections?.placement;
    const authoritativeArmor = authoritativeSelections?.armor;
    const authoritativeMight = authoritativeSelections?.might;
    const authoritativeEmpower = authoritativeSelections?.empower;
    const authoritativeSniper = authoritativeSelections?.sniper;
    const authoritativeMovement = authoritativeSelections?.movement;
    const [totalPoints, setTotalPoints] = useState(() =>
        authoritativeSelections ? remainingAugmentPoints(budgetPoints, authoritativeSelections) : budgetPoints,
    );
    const [placementSelection, setPlacementSelection] = useState<number | null>(authoritativePlacement ?? null);
    const [armorSelection, setArmorSelection] = useState<number | null>(authoritativeArmor ?? null);
    const [mightSelection, setMightSelection] = useState<number | null>(authoritativeMight ?? null);
    const [empowerSelection, setEmpowerSelection] = useState<number | null>(authoritativeEmpower ?? null);
    const [sniperSelection, setSniperSelection] = useState<number | null>(authoritativeSniper ?? null);
    const [movementSelection, setMovementSelection] = useState<number | null>(authoritativeMovement ?? null);

    useEffect(() => {
        if (
            authoritativePlacement === undefined ||
            authoritativeArmor === undefined ||
            authoritativeMight === undefined ||
            authoritativeEmpower === undefined ||
            authoritativeSniper === undefined ||
            authoritativeMovement === undefined
        ) {
            return;
        }

        setPlacementSelection(authoritativePlacement);
        setArmorSelection(authoritativeArmor);
        setMightSelection(authoritativeMight);
        setEmpowerSelection(authoritativeEmpower);
        setSniperSelection(authoritativeSniper);
        setMovementSelection(authoritativeMovement);
        setTotalPoints(
            remainingAugmentPoints(budgetPoints, {
                placement: authoritativePlacement,
                armor: authoritativeArmor,
                might: authoritativeMight,
                empower: authoritativeEmpower,
                sniper: authoritativeSniper,
                movement: authoritativeMovement,
            }),
        );
    }, [
        authoritativeArmor,
        authoritativeEmpower,
        authoritativeMight,
        authoritativeMovement,
        authoritativePlacement,
        authoritativeSniper,
        budgetPoints,
    ]);
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
            label: t("Board placement"),
            icon: (augmentBoardImg as unknown as { default?: string }).default ?? augmentBoardImg,
            selection: placementSelection,
            options: [
                { value: Augment.PlacementAugment.LEVEL_1, label: t("Height 3 partial") },
                { value: Augment.PlacementAugment.LEVEL_2, label: t("Height 4 full") },
                { value: Augment.PlacementAugment.LEVEL_3, label: t("Height 6 full + edge line") },
            ],
        },
        {
            kind: "Armor",
            label: t("Armor"),
            icon: (augmentArmorImg as unknown as { default?: string }).default ?? augmentArmorImg,
            selection: armorSelection,
            options: [
                { value: Augment.ArmorAugment.NO_AUGMENT, label: t("No augment") },
                ...[Augment.ArmorAugment.LEVEL_1, Augment.ArmorAugment.LEVEL_2, Augment.ArmorAugment.LEVEL_3].map(
                    // Both halves, per d0dd7c7 on main: the Armor augment raises physical armor by a PERCENTAGE and
                    // adds its points FLAT to magic armor. Saying only "% armor" would hide the magic half entirely.
                    (level) => ({
                        value: level,
                        label: tf("+{amount}% armor, +{amount} magic armor", {
                            amount: Augment.getArmorPower(level),
                        }),
                    }),
                ),
            ],
        },
        {
            kind: "Might",
            label: t("Might"),
            icon: (augmentMightImg as unknown as { default?: string }).default ?? augmentMightImg,
            selection: mightSelection,
            options: [
                { value: Augment.MightAugment.NO_AUGMENT, label: t("No augment") },
                ...[Augment.MightAugment.LEVEL_1, Augment.MightAugment.LEVEL_2, Augment.MightAugment.LEVEL_3].map(
                    (level) => ({
                        value: level,
                        label: tf("+{amount}% melee", { amount: Augment.getMightPower(level) }),
                    }),
                ),
            ],
        },
        {
            kind: "Empower",
            label: t("Magic"),
            icon: (augmentEmpowerImg as unknown as { default?: string }).default ?? augmentEmpowerImg,
            selection: empowerSelection,
            options: [
                { value: Augment.EmpowerAugment.NO_AUGMENT, label: t("No augment") },
                ...[Augment.EmpowerAugment.LEVEL_1, Augment.EmpowerAugment.LEVEL_2, Augment.EmpowerAugment.LEVEL_3].map(
                    (level) => ({
                        value: level,
                        label: tf("+{amount}% magic attack", { amount: Augment.getEmpowerPower(level) }),
                    }),
                ),
            ],
        },
        {
            kind: "Sniper",
            label: t("Sniper"),
            icon: (augmentSniperImg as unknown as { default?: string }).default ?? augmentSniperImg,
            selection: sniperSelection,
            options: [
                { value: Augment.SniperAugment.NO_AUGMENT, label: t("No augment") },
                ...[Augment.SniperAugment.LEVEL_1, Augment.SniperAugment.LEVEL_2, Augment.SniperAugment.LEVEL_3].map(
                    (level) => ({
                        value: level,
                        label: tf("+{attack}% atk / +{range}% range", {
                            attack: Augment.getSniperPower(level)[0],
                            range: Augment.getSniperPower(level)[1],
                        }),
                    }),
                ),
            ],
        },
        {
            kind: "Movement",
            label: t("Movement"),
            icon: (augmentMovementImg as unknown as { default?: string }).default ?? augmentMovementImg,
            selection: movementSelection,
            options: [
                { value: Augment.MovementAugment.NO_AUGMENT, label: t("No augment") },
                ...[Augment.MovementAugment.LEVEL_1, Augment.MovementAugment.LEVEL_2].map((level) => ({
                    value: level,
                    label: tf(
                        Augment.getMovementPower(level) > 1 ? "+{amount} movement steps" : "+{amount} movement step",
                        { amount: Augment.getMovementPower(level) },
                    ),
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
