import {
    HoCConstants,
    UnitProperties,
    AttackVals,
    MovementVals,
    TeamVals,
    HoCLib,
    AttackType,
    FactionType,
    TeamType,
} from "@heroesofcrypto/common";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import { Box, Badge } from "@mui/joy";
import Avatar from "@mui/joy/Avatar";
import List from "@mui/joy/List";
import ListItem from "@mui/joy/ListItem";
import ListItemButton from "@mui/joy/ListItemButton";
import ListItemContent from "@mui/joy/ListItemContent";
import Stack from "@mui/joy/Stack";
import { useTheme } from "@mui/joy/styles";
import Tooltip from "@mui/joy/Tooltip";
import Typography from "@mui/joy/Typography";
import React, { useCallback } from "react";

import { animationAtlases, AnimationUnitName, AnimationStateName } from "../../generated/animation_atlases";
import { images, type ImageKey } from "../../generated/image_imports";
import { IVisibleImpact, IVisibleOverallImpact } from "../../scenes/VisibleState";
import { ArrowShieldIcon } from "../svg/arrow_shield";
import { BootIcon } from "../svg/boot";
import { BowIcon } from "../svg/bow";
import { FistIcon } from "../svg/fist";
import { HeartIcon } from "../svg/heart";
import { LuckIcon } from "../svg/luck";
import { MagicShieldIcon } from "../svg/magic_shield";
import { MoraleIcon } from "../svg/morale";
import { QuiverIcon } from "../svg/quiver";
import { ScrollIcon } from "../svg/scroll";
import { ShieldIcon } from "../svg/shield";
import { ShotRangeIcon } from "../svg/shot_range";
import { SpeedIcon } from "../svg/speed";
import { SwordIcon } from "../svg/sword";
import { GreenUserIcon } from "../svg/user_green";
import { RedUserIcon } from "../svg/user_red";
import { GrayUserIcon } from "../svg/user_gray";
import { WingIcon } from "../svg/wing";
import Toggler from "../Toggler";

interface IAbilityStackProps {
    abilities: IVisibleImpact[];
    teamType: TeamType;
}

const ABILITIES_FIT_IN_ONE_ROW = 3;

// --- Custom Style for "Heroes" Aesthetic Tooltips ---
const commonTooltipSx = {
    backgroundColor: "#2d1606", // Deep dark brown/wood
    border: "2px solid #dcb158", // Metallic gold/bronze border
    color: "#efe4cc", // Parchment/Cream text for contrast
    borderRadius: "8px",
    boxShadow: "0 6px 12px rgba(0,0,0,0.8)",
    fontSize: "0.85rem",
    fontWeight: 500,
    maxWidth: "280px",
    zIndex: 10000,
};

// Normalize "Angel", "Wolf Rider" etc. to the keys in animationAtlases
function normalizeUnitNameForAtlas(name?: string | null): AnimationUnitName | null {
    if (!name) return null;
    const trimmed = name.trim();
    if (!trimmed) return null;
    if (trimmed in animationAtlases) return trimmed as AnimationUnitName;
    return null;
}

// Turn "Wolf Rider" + "default" -> "wolf_rider_default_atlas"
function atlasImageKeyFromUnitAndState(unitName: string, state: string): ImageKey | null {
    const base = unitName.toLowerCase().replace(/\s+/g, "_");
    const stateLower = state.toLowerCase();

    const key = `${base}_${stateLower}_atlas` as ImageKey;

    if (key in images) {
        return key;
    }

    if (process.env.NODE_ENV === "development") {
        console.warn(`[atlas] Missing atlas image for unit "${unitName}", state "${state}". Expected key: ${key}`);
    }

    return null;
}

type AtlasMeta = (typeof animationAtlases)[AnimationUnitName][AnimationStateName];

// Pick the "default" state if present, otherwise first available
function getDefaultAnimationConfig(unitName?: string | null): { meta: AtlasMeta; imageSrc: string } | null {
    const normalized = normalizeUnitNameForAtlas(unitName);
    if (!normalized) return null;

    const unitStates = animationAtlases[normalized];
    const stateNames = Object.keys(unitStates) as AnimationStateName[];

    if (!stateNames.length) return null;

    const preferredState = (stateNames as string[]).includes("default")
        ? ("default" as AnimationStateName)
        : stateNames[0];

    const meta = unitStates[preferredState];

    const imageKey = atlasImageKeyFromUnitAndState(normalized, preferredState as string);
    if (!imageKey) return null;

    const imageSrc = images[imageKey];
    if (!imageSrc) return null;

    return { meta, imageSrc };
}

const AtlasAnimation: React.FC<{
    meta: AtlasMeta;
    src: string;
    onLoaded: () => void;
}> = ({ meta, src, onLoaded }) => {
    const [frameIndex, setFrameIndex] = React.useState(0);
    const [isImageLoaded, setIsImageLoaded] = React.useState(false);

    React.useEffect(() => {
        const img = new Image();
        img.src = src;

        const handleLoaded = () => {
            setIsImageLoaded(true);
            onLoaded();
        };

        img.onload = handleLoaded;
        img.onerror = handleLoaded;

        const frameCount = meta.frameCount ?? 1;

        const fallbackTotalSec =
            typeof meta.totalDurationSec === "number" && Number.isFinite(meta.totalDurationSec)
                ? meta.totalDurationSec
                : frameCount / (meta.fps || 12);

        const baseTotalMs = fallbackTotalSec * 1000;
        const loopDurationMs = meta.loopDurationMs ?? Math.round(baseTotalMs * 0.8);
        const pauseMs = meta.pauseMs ?? Math.round(loopDurationMs * 0.4);

        const stepDuration = loopDurationMs / Math.max(1, frameCount - 1);

        let cancelled = false;
        let timer: number | undefined;

        const runForward = (idx: number) => {
            if (cancelled) return;

            setFrameIndex(idx);

            if (idx >= frameCount - 1) {
                timer = window.setTimeout(() => runBackward(frameCount - 1), pauseMs);
            } else {
                timer = window.setTimeout(() => runForward(idx + 1), stepDuration);
            }
        };

        const runBackward = (idx: number) => {
            if (cancelled) return;

            setFrameIndex(idx);

            if (idx <= 0) {
                timer = window.setTimeout(() => runForward(0), pauseMs);
            } else {
                timer = window.setTimeout(() => runBackward(idx - 1), stepDuration);
            }
        };

        // start at the beginning, going forward
        runForward(0);

        return () => {
            cancelled = true;
            if (timer !== undefined) {
                window.clearTimeout(timer);
            }
        };
    }, [isImageLoaded, meta]);

    const frameWidth = meta.frameWidth ?? 512;
    const frameHeight = meta.frameHeight ?? 512;
    const cols = meta.layout?.cols ?? 1;
    const rows = meta.layout?.rows ?? 1;

    const col = frameIndex % cols;
    const row = Math.floor(frameIndex / cols);

    const bgSizeX = cols * 100;
    const bgSizeY = rows * 100;

    const bgPosX = cols > 1 ? (col / (cols - 1)) * 100 : 0;
    const bgPosY = rows > 1 ? (row / (rows - 1)) * 100 : 0;

    return (
        <Box
            sx={{
                position: "relative",
                width: "100%",
                aspectRatio: `${frameWidth} / ${frameHeight}`,
                backgroundImage: `url(${src})`,
                backgroundRepeat: "no-repeat",
                backgroundSize: `${bgSizeX}% ${bgSizeY}%`,
                backgroundPosition: `${bgPosX}% ${bgPosY}%`,
                imageRendering: "pixelated",
                overflow: "visible",
                zIndex: 5,
            }}
        />
    );
};

const StackPowerOverlay: React.FC<{ stackPower: number; teamType: TeamType; isAura: boolean }> = ({
    stackPower,
    teamType,
    isAura,
}) => {
    if (stackPower === 0) return null;

    const backgroundColor = teamType === TeamVals.LOWER ? "rgba(76, 175, 80, 0.6)" : "rgba(244, 67, 54, 0.4)";
    const borderColor = teamType === TeamVals.LOWER ? "rgba(76, 175, 80, 0.6)" : "rgba(244, 67, 54, 0.4)";

    if (isAura) {
        const tileSize = 22;
        const margin = 2;
        const radius = 50 - tileSize / 2 - margin;

        const count = stackPower;
        const startAngle = 135;
        const endAngle = 225;
        const span = endAngle - startAngle;
        const step = count > 1 ? span / (count - 1) : 0;

        const minAlpha = 0.18;
        const maxAlpha = 0.86;
        const [baseR, baseG, baseB] = teamType === TeamVals.LOWER ? [76, 175, 80] : [244, 67, 54];

        return (
            <Box
                sx={{
                    position: "absolute",
                    inset: 0,
                    zIndex: 3,
                    pointerEvents: "none",
                }}
            >
                {Array.from({ length: count }).map((_, index) => {
                    const angleDeg = endAngle - step * index;
                    const angleRad = (angleDeg * Math.PI) / 180;

                    const cx = 50 + radius * Math.cos(angleRad);
                    const cy = 50 + radius * Math.sin(angleRad);

                    const t = count > 1 ? index / (count - 1) : 0.5;
                    const opacity = minAlpha + t * (maxAlpha - minAlpha);
                    const tileBackground = `rgba(${baseR}, ${baseG}, ${baseB}, ${opacity})`;
                    const tileBorder = `rgba(${baseR}, ${baseG}, ${baseB}, ${Math.min(1, opacity + 0.08)})`;

                    return (
                        <Box
                            key={`stack_aura_${index}`}
                            sx={{
                                position: "absolute",
                                left: `${cx - tileSize / 2}%`,
                                top: `${cy - tileSize / 2}%`,
                                width: `${tileSize + 4}%`,
                                height: `${tileSize}%`,
                                backgroundColor: tileBackground,
                                border: `1px solid ${tileBorder}`,
                                borderRadius: "6px",
                                transform: `rotate(${angleDeg - 90}deg)`,
                                transformOrigin: "center center",
                                zIndex: index + 1,
                            }}
                        />
                    );
                })}
            </Box>
        );
    }

    return (
        <Box
            sx={{
                position: "absolute",
                bottom: 0,
                left: 0,
                width: "20%",
                height: "100%",
                zIndex: 3,
            }}
        >
            {[...Array(stackPower)].map((_, index) => (
                <Box
                    key={`stack_${index}`}
                    sx={{
                        position: "absolute",
                        bottom: 0,
                        left: 0,
                        width: "100%",
                        height: `${((index + 1) / HoCConstants.MAX_UNIT_STACK_POWER) * 100}%`,
                        clipPath: "polygon(20% 100%, 100% 100%, 100% 20%, 0 0)",
                        backgroundColor,
                        border: `1px solid ${borderColor}`,
                        zIndex: stackPower - index,
                    }}
                />
            ))}
        </Box>
    );
};

const AbilityStack: React.FC<IAbilityStackProps & { isWidescreen: boolean; hasBreakApplied: boolean }> = ({
    abilities,
    teamType,
    isWidescreen,
    hasBreakApplied,
}) => {
    const theme = useTheme();
    const isDarkMode = theme.palette.mode === "dark";
    const auraColor = isDarkMode ? "rgba(255, 255, 255, 0.75)" : "rgba(0, 0, 0, 0.75)";

    const filtered = abilities.filter((ability) => ability.laps > 0);
    const rowsCount = Math.ceil(filtered.length / ABILITIES_FIT_IN_ONE_ROW);

    return (
        <Stack spacing={2} sx={{ marginTop: 1 }}>
            {Array.from({ length: rowsCount }).map((_, rowIndex) => (
                <Stack key={`row_${rowIndex}`} direction="row" spacing={2} sx={{ width: "100%" }}>
                    {filtered
                        .slice(rowIndex * ABILITIES_FIT_IN_ONE_ROW, (rowIndex + 1) * ABILITIES_FIT_IN_ONE_ROW)
                        .map((ability, index) => (
                            <Tooltip
                                title={
                                    <>
                                        {hasBreakApplied && "BREAK APPLIED!\n"}
                                        {ability.name}:&nbsp;
                                        {ability.description.split("\n").map((line, idx) => (
                                            <React.Fragment key={idx}>
                                                {line}
                                                <br />
                                            </React.Fragment>
                                        ))}
                                    </>
                                }
                                key={`tooltip_${rowIndex}_${index}`}
                                sx={commonTooltipSx}
                            >
                                <Box
                                    sx={{
                                        position: "relative",
                                        width: isWidescreen ? "22%" : "30%",
                                        paddingBottom: isWidescreen ? "22%" : "30%",
                                        overflow: "hidden",
                                        borderRadius: ability.isAura ? "50%" : "15%",
                                        "&::before": {
                                            content: '""',
                                            position: "absolute",
                                            top: "50%",
                                            left: "50%",
                                            width: "100%",
                                            height: "100%",
                                            transform: "translate(-50%, -50%)",
                                            borderRadius: ability.isAura ? "50%" : "20%",
                                            boxShadow: ability.isAura ? `-20px 0 -20px 60px ${auraColor}` : "none",
                                            zIndex: 0,
                                        },
                                        "&::after": {
                                            content: '""',
                                            position: "absolute",
                                            top: 0,
                                            left: 0,
                                            right: 0,
                                            bottom: 0,
                                            borderRadius: ability.isAura ? "50%" : "15%",
                                            border: ability.isAura ? `2px solid ${auraColor}` : "none",
                                            zIndex: 2,
                                            pointerEvents: "none",
                                        },
                                    }}
                                >
                                    <Box
                                        component="img"
                                        // @ts-ignore: src params
                                        src={images[ability.smallTextureName]}
                                        sx={{
                                            position: "absolute",
                                            top: 0,
                                            left: 0,
                                            width: "100%",
                                            height: "100%",
                                            objectFit: "cover",
                                            zIndex: 1,
                                        }}
                                    />
                                    {hasBreakApplied && <BreakOverlay />}
                                    <StackPowerOverlay
                                        stackPower={ability.isStackPowered ? ability.stackPower : 0}
                                        teamType={teamType}
                                        isAura={ability.isAura}
                                    />
                                </Box>
                            </Tooltip>
                        ))}
                </Stack>
            ))}
        </Stack>
    );
};

const EffectColumnOrRow: React.FC<{
    effects: IVisibleImpact[];
    title: string;
    isHorizontalLayout?: boolean;
}> = ({ effects, title, isHorizontalLayout = false }) => {
    if (!effects.length) return <Box sx={{ marginBottom: 2 }} />;

    return (
        <Box
            sx={{
                display: "flex",
                flexDirection: "column",
                width: "100%",
                alignItems: isHorizontalLayout ? "left" : "center",
                marginBottom: title === "Debuffs" ? 2 : 0,
                ...(isHorizontalLayout ? {} : { paddingLeft: "2px" }),
            }}
        >
            <Typography
                level="title-sm"
                sx={{
                    textAlign: isHorizontalLayout ? "left" : "center",
                    ...(isHorizontalLayout ? {} : { fontSize: 9 }),
                    width: "8ch",
                    marginBottom: isHorizontalLayout ? 1 : 0,
                    ...(isHorizontalLayout ? { marginTop: 2 } : {}),
                }}
            >
                {title}
            </Typography>
            <Box
                sx={{
                    flex: 1,
                    overflow: "auto",
                    display: "flex",
                    flexDirection: isHorizontalLayout ? "row" : "column",
                    flexWrap: isHorizontalLayout ? "wrap" : "nowrap",
                    "&::-webkit-scrollbar": { width: "4px" },
                    "&::-webkit-scrollbar-track": { background: "#f1f1f1" },
                    "&::-webkit-scrollbar-thumb": { background: "#888" },
                    "&::-webkit-scrollbar-thumb:hover": { background: "#555" },
                }}
            >
                {effects.map((effect, index) => (
                    <Tooltip
                        key={index}
                        title={`${effect.name}: ${effect.description.substring(0, effect.description.length - 1)}${
                            effect.laps > 0 &&
                            effect.laps !== Number.MAX_SAFE_INTEGER &&
                            effect.laps !== HoCConstants.NUMBER_OF_LAPS_TOTAL
                                ? ` (remaining ${HoCLib.getLapString(effect.laps)})`
                                : ""
                        }`}
                        sx={commonTooltipSx}
                    >
                        <Box
                            component="img"
                            // @ts-ignore: src params
                            src={images[effect.smallTextureName]}
                            sx={{
                                width: isHorizontalLayout ? "13%" : "auto",
                                maxWidth: "100%",
                                height: "auto",
                                aspectRatio: "1",
                                objectFit: "contain",
                                zIndex: 3,
                                margin: isHorizontalLayout && index !== 0 ? "0 2px" : "1px",
                            }}
                        />
                    </Tooltip>
                ))}
            </Box>
        </Box>
    );
};

const StatGroup: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <Box sx={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-start", gap: 0.5, mb: 1 }}>{children}</Box>
);

const StatItem: React.FC<{
    icon: React.ReactElement;
    value: string | number;
    tooltip: string;
    color: string;
    badgeContent?: string;
    badgeColor?: string;
    positiveFrame?: boolean;
    negativeFrame?: boolean;
}> = ({ icon, value, tooltip, color, badgeContent, badgeColor, positiveFrame, negativeFrame }) => (
    <Tooltip title={tooltip} sx={commonTooltipSx}>
        <Box
            sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.25,
                minWidth: "45%",
                backgroundColor: positiveFrame
                    ? "rgba(0, 255, 0, 0.3)"
                    : negativeFrame
                      ? "rgba(255, 0, 0, 0.3)"
                      : "transparent",
                ...(positiveFrame
                    ? { boxShadow: "0 0 5px 5px green", borderRadius: "20px" }
                    : negativeFrame
                      ? { boxShadow: "0 0 5px 5px red", borderRadius: "20px" }
                      : {}),
            }}
        >
            {React.cloneElement(icon, { sx: { color, fontSize: "1.25rem", pr: "4px" } })}
            {badgeContent ? (
                <Box sx={{ position: "relative", display: "inline-flex" }}>
                    <Typography
                        fontSize="0.75rem"
                        sx={{
                            ...(positiveFrame || negativeFrame ? { fontWeight: "bold", fontSize: "0.75rem" } : {}),
                        }}
                    >
                        {value}
                    </Typography>
                    <Badge
                        badgeContent={badgeContent}
                        // @ts-ignore: style params
                        color={badgeColor}
                        sx={{
                            position: "absolute",
                            bottom: 8.5,
                            right: -15 - 2.5 * value.toString().length,
                            transform: "scale(0.8) translate(50%, 50%)",
                            opacity: 0.75,
                        }}
                    />
                </Box>
            ) : (
                <Typography
                    fontSize="0.75rem"
                    sx={{
                        ...(positiveFrame || negativeFrame ? { fontWeight: "bold", fontSize: "0.75rem" } : {}),
                    }}
                >
                    {value}
                </Typography>
            )}
        </Box>
    </Tooltip>
);

const UnitStatsLayout: React.FC<{
    unitProperties: UnitProperties;
    damageRange: string;
    attackTypeSelected: AttackType;
    attackDamage: number;
    attackMod: number;
    meleeArmor: number;
    rangeArmor: number;
    armorMod: number;
    stepsMod: number;
    hasDifferentRangeArmor: boolean;
    isDarkMode: boolean;
    columnize: boolean;
    largeTextureName: string;
    images: { [key: string]: string };
    showStats: boolean;
    showAbilities: boolean;
    onImageLoaded: () => void;
    abilities: IVisibleImpact[];
    hasBreakApplied: boolean;
    team: TeamType;
}> = ({
    unitProperties,
    damageRange,
    attackTypeSelected,
    attackDamage,
    attackMod,
    meleeArmor,
    rangeArmor,
    armorMod,
    stepsMod,
    hasDifferentRangeArmor,
    isDarkMode,
    columnize,
    largeTextureName,
    images,
    showStats,
    showAbilities,
    onImageLoaded,
    abilities,
    hasBreakApplied,
    team,
}) => {
    const statsVisible = showStats;
    const abilitiesVisible = showAbilities;

    const attackSign = attackMod > 0 ? "+" : "";
    const attackModBadgeValue = `${attackMod ? `${attackSign}${unitProperties.attack_mod}` : ""}${
        unitProperties.attack_multiplier !== 1 ? ` x${unitProperties.attack_multiplier}` : ""
    }`;
    const armorSign = armorMod > 0 ? "+" : "";
    const armorModBadgeValue = armorMod ? `${armorSign}${armorMod}` : "";
    const stepsSign = stepsMod > 0 ? "+" : "";
    const stepsModBadgeValue = stepsMod ? `${stepsSign}${stepsMod}` : "";
    const luckSign = unitProperties.luck_mod > 0 ? "+" : "";
    const luckBadgeValue = unitProperties.luck_mod ? `${luckSign}${unitProperties.luck_mod}` : "";

    let attackColor: "success" | "danger" | "primary" | "neutral" | "warning" = "success";
    if (unitProperties.attack_multiplier < 1) {
        attackColor = "danger";
    } else if (unitProperties.attack_multiplier === 1 && unitProperties.attack_mod < 0) {
        attackColor = "danger";
    }

    const animationConfig = getDefaultAnimationConfig(unitProperties.name);
    const hasAnimation = !!animationConfig;

    const statsContent = (
        <>
            <StatGroup>
                <StatItem
                    icon={<HeartIcon />}
                    value={`${unitProperties.hp}/${unitProperties.max_hp}`}
                    tooltip="Current/max Health Points"
                    color="#ff4d4d"
                />
                {unitProperties.can_cast_spells && (
                    <StatItem
                        icon={<ScrollIcon />}
                        value={unitProperties.spells.length}
                        tooltip="Number of magic scrolls"
                        color="#add8e6"
                    />
                )}
            </StatGroup>
            <StatGroup>
                <StatItem icon={<FistIcon />} value={damageRange} tooltip="Attack spread" color="#c0c0c0" />
                <StatItem
                    icon={attackTypeSelected === AttackVals.RANGE ? <BowIcon /> : <SwordIcon />}
                    value={Number(attackDamage.toFixed(2))}
                    tooltip="Attack type and multiplier"
                    color={attackTypeSelected === AttackVals.RANGE ? "#ffd700" : "#a52a2a"}
                    badgeContent={attackModBadgeValue}
                    badgeColor={attackColor}
                    positiveFrame={unitProperties.attack_multiplier > 1}
                    negativeFrame={unitProperties.attack_multiplier < 1}
                />
            </StatGroup>
            {unitProperties.attack_type === AttackVals.RANGE && (
                <StatGroup>
                    <StatItem
                        icon={<ShotRangeIcon />}
                        value={unitProperties.shot_distance}
                        tooltip="Ranged shot distance in cells"
                        color="#ffff00"
                    />
                    {(unitProperties.range_shots_mod || unitProperties.range_shots) && (
                        <StatItem
                            icon={<QuiverIcon />}
                            value={unitProperties.range_shots_mod || unitProperties.range_shots}
                            tooltip="Number of ranged shots"
                            color="#cd5c5c"
                        />
                    )}
                </StatGroup>
            )}
            <StatGroup>
                <StatItem
                    icon={<ShieldIcon />}
                    value={Number(meleeArmor.toFixed(2))}
                    tooltip="Armor"
                    color="#4682b4"
                    badgeContent={armorModBadgeValue}
                    badgeColor={unitProperties.armor_mod > 0 ? "success" : "danger"}
                    positiveFrame={unitProperties.armor_mod > 0}
                    negativeFrame={unitProperties.armor_mod < 0}
                />
                <StatItem
                    icon={<MagicShieldIcon />}
                    value={`${unitProperties.magic_resist_mod || unitProperties.magic_resist}%`}
                    tooltip="Magic resist in %"
                    color="#8a2be2"
                />
                {hasDifferentRangeArmor && (
                    <StatItem
                        icon={<ArrowShieldIcon />}
                        value={Number(rangeArmor.toFixed(2))}
                        tooltip="Range armor"
                        color="#f4a460"
                        badgeContent={armorModBadgeValue}
                        badgeColor={unitProperties.armor_mod > 0 ? "success" : "danger"}
                    />
                )}
            </StatGroup>
            <StatGroup>
                <StatItem
                    icon={unitProperties.movement_type === MovementVals.FLY ? <WingIcon /> : <BootIcon />}
                    value={Number((unitProperties.steps + stepsMod).toFixed(1))}
                    tooltip="Movement type and number of steps in cells"
                    color={unitProperties.movement_type === MovementVals.FLY ? "#00ff7f" : "#8b4513"}
                    badgeContent={stepsModBadgeValue}
                    badgeColor={stepsMod > 0 ? "success" : "danger"}
                    positiveFrame={stepsMod > 0}
                    negativeFrame={stepsMod < 0}
                />
                <StatItem
                    icon={<SpeedIcon />}
                    value={unitProperties.speed}
                    tooltip="Units with higher speed turn first on the battlefield"
                    color={isDarkMode ? "#f5fefd" : "#000000"}
                />
            </StatGroup>
            <StatGroup>
                <StatItem
                    icon={<MoraleIcon />}
                    value={unitProperties.morale}
                    tooltip="The morale parameter affects the chance of an out of regular order action depending on whether it is positive or negative"
                    color={isDarkMode ? "#ffff00" : "#DC4D01"}
                    positiveFrame={
                        unitProperties.morale >= HoCConstants.MORALE_MAX_VALUE_TOTAL &&
                        unitProperties.attack_multiplier > 1
                    }
                    negativeFrame={
                        unitProperties.morale <= -HoCConstants.MORALE_MAX_VALUE_TOTAL &&
                        unitProperties.attack_multiplier < 1
                    }
                />
                <StatItem
                    icon={<LuckIcon />}
                    value={unitProperties.luck + unitProperties.luck_mod}
                    tooltip="Luck increases or decreases damage received in combat, while also affecting the probability or power of abilities"
                    color="#ff4040"
                    badgeContent={luckBadgeValue}
                    badgeColor={unitProperties.luck_mod > 0 ? "success" : "danger"}
                    positiveFrame={unitProperties.luck + unitProperties.luck_mod >= HoCConstants.LUCK_MAX_VALUE_TOTAL}
                    negativeFrame={unitProperties.luck + unitProperties.luck_mod <= -HoCConstants.LUCK_MAX_VALUE_TOTAL}
                />
            </StatGroup>
        </>
    );

    const abilitiesBlock = (
        <Box
            sx={{
                opacity: abilitiesVisible ? 1 : 0,
                transition: "opacity 150ms ease-out",
            }}
        >
            <Typography level="title-sm" sx={{ marginTop: columnize ? 1.5 : 0 }}>
                Abilities
            </Typography>
            <AbilityStack
                abilities={abilities}
                teamType={team}
                isWidescreen={columnize}
                hasBreakApplied={hasBreakApplied}
            />
        </Box>
    );

    if (columnize) {
        return (
            <>
                <Box sx={{ display: "flex", width: "100%", overflow: "hidden", flexWrap: "wrap" }}>
                    <Box sx={{ width: "60%", position: "relative" }}>
                        {hasAnimation && animationConfig ? (
                            <AtlasAnimation
                                meta={animationConfig.meta}
                                src={animationConfig.imageSrc}
                                onLoaded={onImageLoaded}
                            />
                        ) : (
                            <Avatar
                                // @ts-ignore: src params
                                src={images[largeTextureName]}
                                variant="plain"
                                sx={{
                                    width: "100%",
                                    zIndex: 5,
                                    height: "auto",
                                    objectFit: "contain",
                                    overflow: "visible",
                                    transition: "opacity 120ms ease-out",
                                }}
                                onLoad={onImageLoaded}
                                onError={onImageLoaded}
                            />
                        )}
                    </Box>
                    <Box
                        sx={{
                            width: "38%",
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "center",
                            pl: 3,
                            pt: 1,
                            pb: 1,
                            transformOrigin: "top left",
                            opacity: statsVisible ? 1 : 0,
                            transition: "opacity 140ms ease-out, transform 140ms ease-out",
                            transform: statsVisible ? "scale(1.2)" : "scale(1.2) translateY(4px)",
                            pointerEvents: statsVisible ? "auto" : "none",
                        }}
                    >
                        {statsContent}
                    </Box>
                </Box>
                <Box sx={{ width: "100%" }}>{abilitiesBlock}</Box>
            </>
        );
    } else {
        return (
            <Box
                sx={{
                    position: "relative",
                    marginBottom: 1.5,
                    width: "100%",
                }}
            >
                <Box sx={{ width: "100%" }}>
                    {hasAnimation && animationConfig ? (
                        <AtlasAnimation
                            meta={animationConfig.meta}
                            src={animationConfig.imageSrc}
                            onLoaded={onImageLoaded}
                        />
                    ) : (
                        <Avatar
                            // @ts-ignore: src params
                            src={images[largeTextureName]}
                            variant="plain"
                            sx={{
                                zIndex: 5,
                                width: "100%",
                                height: "auto",
                                maxWidth: "100%",
                                maxHeight: "100%",
                                objectFit: "contain",
                                overflow: "visible",
                                transition: "opacity 120ms ease-out",
                            }}
                            onLoad={onImageLoaded}
                            onError={onImageLoaded}
                        />
                    )}
                </Box>

                <Box
                    sx={{
                        width: "90%",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "center",
                        pl: 4,
                        py: 4,
                        transformOrigin: "top left",
                        opacity: statsVisible ? 1 : 0,
                        transition: statsVisible ? "opacity 140ms ease-out, transform 140ms ease-out" : "none",
                        transform: statsVisible ? "scale(1.2)" : "scale(1.2) translateY(4px)",
                        pointerEvents: statsVisible ? "auto" : "none",
                    }}
                >
                    {statsContent}
                </Box>

                <Box
                    sx={{
                        width: "100%",
                        mt: 1,
                    }}
                >
                    {abilitiesBlock}
                </Box>
            </Box>
        );
    }
};

const BreakOverlay: React.FC = () => (
    <Box
        sx={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            backgroundColor: "rgba(255, 255, 255, 0.6)",
            zIndex: 4,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
        }}
    >
        <Box
            sx={{
                color: "#ff0000",
                fontWeight: "bold",
                transform: "rotate(-45deg)",
                fontSize: "1.2em",
                textShadow: "1px 1px 2px rgba(0, 0, 0, 0.5)",
                whiteSpace: "nowrap",
                userSelect: "none",
            }}
        >
            BREAK
        </Box>
    </Box>
);

type UnitStatsListItemProps = {
    barSize: number;
    columnize: boolean;
    unitProperties: UnitProperties;
    overallImpact: IVisibleOverallImpact;
    factionType: FactionType;
};

const UnitStatsListItemInner: React.FC<UnitStatsListItemProps> = ({
    barSize,
    columnize,
    unitProperties,
    overallImpact,
    factionType,
}) => {
    // ✅ FIX 1: We track the loaded texture NAME, not the full unit ID/State.
    // const [loadedTexture, setLoadedTexture] = useState<string | null>(null);
    const theme = useTheme();
    const isDarkMode = theme.palette.mode === "dark";

    const abilities: IVisibleImpact[] = overallImpact.abilities || [];
    const buffs: IVisibleImpact[] = overallImpact.buffs || [];
    const debuffs: IVisibleImpact[] = overallImpact.debuffs || [];
    const hasHandymanAbility = abilities.some((ability) => ability.name === "Handyman");

    const hasBuffsOrDebuffs = buffs.length > 0 || debuffs.length > 0;
    let hasBreakApplied = false;
    for (const d of debuffs) {
        if (d.name === "Break" && d.laps > 0) {
            hasBreakApplied = true;
            break;
        }
    }

    // ✅ FIX 2: Calculate the texture key.
    // We use the texture name (or unit name) as the dependency.
    // This ensures that if 'amount_alive' or 'hp' changes, the key stays the same,
    // so the UI does not reset to "Loading..." (invisible) state.
    // const currentTexture = unitProperties?.large_texture_name || unitProperties?.name || "default";

    // The image is "ready" if the texture we want to show matches what we have loaded.
    // const isImageReady = loadedTexture === currentTexture;

    // Show stats if we are in column mode OR if the image is fully loaded.
    const showStats = true;

    const onImageLoaded = useCallback(() => {
        // No-op to fix lint unused var, and purely for smooth transition
    }, []);

    // --- Faction List Item Logic ---
    if (factionType) {
        return (
            // @ts-ignore: style params
            <ListItem style={{ "--List-nestedInsetStart": "0px" }} nested>
                <Toggler
                    renderToggle={({ open, setOpen }) => (
                        <ListItemButton onClick={() => setOpen(!open)}>
                            <ListItemContent>
                                <Typography level="title-sm">{factionType}</Typography>
                            </ListItemContent>
                            <KeyboardArrowDownIcon />
                        </ListItemButton>
                    )}
                >
                    <List sx={{ gap: 0 }}>
                        <Avatar
                            // @ts-ignore: src params
                            src={images[`${factionType.toLowerCase()}_512`]}
                            variant="plain"
                            sx={{ zIndex: "modal" }}
                            style={{
                                width: "auto",
                                height: "auto",
                                overflow: "visible",
                            }}
                        />
                    </List>
                </Toggler>
            </ListItem>
        );
    }

    // --- Unit Stats Logic ---
    if (unitProperties && Object.keys(unitProperties).length) {
        const stackName = `${unitProperties.name} x${unitProperties.amount_alive}`;
        const damageRange = `${unitProperties.attack_damage_min} - ${unitProperties.attack_damage_max}`;
        const armorMod = Number(unitProperties.armor_mod.toFixed(2));
        const stepsMod = Number(unitProperties.steps_mod.toFixed(1));
        const attackMod = Number(unitProperties.attack_mod.toFixed(2));
        const attackTypeSelected = unitProperties.attack_type_selected;

        let attackDamage = (unitProperties.base_attack + unitProperties.attack_mod) * unitProperties.attack_multiplier;
        if (
            attackTypeSelected === AttackVals.MELEE &&
            unitProperties.attack_type === AttackVals.RANGE &&
            !hasHandymanAbility
        ) {
            attackDamage /= 2;
        }

        const meleeArmor = Math.max(1, unitProperties.base_armor + unitProperties.armor_mod);
        const rangeArmor = Math.max(1, unitProperties.range_armor + unitProperties.armor_mod);
        const hasDifferentRangeArmor = meleeArmor !== rangeArmor;
        const largeTextureName = unitProperties.large_texture_name;

        const buffsVisible = showStats; // Sync visibility with the main stats

        return (
            // @ts-ignore: style params
            <ListItem style={{ "--List-nestedInsetStart": "0px" }} nested>
                <Toggler
                    renderToggle={({ open, setOpen }) => (
                        <ListItemButton onClick={() => setOpen(!open)}>
                            {!unitProperties.team ? (
                                <GrayUserIcon />
                            ) : unitProperties.team === 1 ? (
                                <RedUserIcon />
                            ) : (
                                <GreenUserIcon />
                            )}
                            <ListItemContent>
                                <Typography level="title-sm">{stackName}</Typography>
                            </ListItemContent>
                            <KeyboardArrowDownIcon />
                        </ListItemButton>
                    )}
                >
                    <List>
                        <Box
                            sx={{
                                width: "100%",
                                overflow: "visible",
                                display: "flex",
                                flexDirection: columnize ? "column" : "row",
                            }}
                        >
                            <UnitStatsLayout
                                unitProperties={unitProperties}
                                damageRange={damageRange}
                                attackTypeSelected={attackTypeSelected}
                                attackDamage={attackDamage}
                                attackMod={attackMod}
                                meleeArmor={meleeArmor}
                                rangeArmor={rangeArmor}
                                armorMod={armorMod}
                                stepsMod={stepsMod}
                                hasDifferentRangeArmor={hasDifferentRangeArmor}
                                isDarkMode={isDarkMode}
                                columnize={columnize}
                                largeTextureName={largeTextureName}
                                images={images}
                                showStats={showStats}
                                showAbilities={showStats}
                                onImageLoaded={onImageLoaded}
                                abilities={abilities}
                                hasBreakApplied={hasBreakApplied}
                                team={unitProperties.team}
                            />

                            {/* Vertical Buffs (Normal View) */}
                            {hasBuffsOrDebuffs && !columnize && (
                                <Box
                                    sx={{
                                        width: barSize > 256 ? "20%" : "15%",
                                        display: buffsVisible ? "flex" : "none",
                                        flexDirection: "column",
                                        opacity: buffsVisible ? 1 : 0,
                                        transition: buffsVisible ? "opacity 150ms ease-out" : "none",
                                    }}
                                >
                                    {buffs.length > 0 && <EffectColumnOrRow effects={buffs} title="Buffs" />}
                                    {debuffs.length > 0 && <EffectColumnOrRow effects={debuffs} title="Debuffs" />}
                                </Box>
                            )}
                        </Box>

                        {/* Horizontal Buffs (Widescreen/Columnize View) */}
                        {hasBuffsOrDebuffs && columnize && (
                            <Box
                                sx={{
                                    width: "100%",
                                    display: buffsVisible ? "flex" : "none",
                                    flexDirection: "column",
                                    opacity: buffsVisible ? 1 : 0,
                                    transition: buffsVisible ? "opacity 150ms ease-out" : "none",
                                }}
                            >
                                <EffectColumnOrRow effects={buffs} title="Buffs" isHorizontalLayout={true} />
                                <EffectColumnOrRow effects={debuffs} title="Debuffs" isHorizontalLayout={true} />
                            </Box>
                        )}
                    </List>
                </Toggler>
            </ListItem>
        );
    }

    return <ListItem nested />;
};

const arePropsEqual = (prev: UnitStatsListItemProps, next: UnitStatsListItemProps) => {
    if (prev.barSize !== next.barSize) return false;
    if (prev.columnize !== next.columnize) return false;
    if (prev.factionType !== next.factionType) return false;

    const pUnit = prev.unitProperties;
    const nUnit = next.unitProperties;

    // 1. Handle Reference Equality
    if (pUnit === nUnit) return true;

    // 2. Handle Nulls
    if (!pUnit && !nUnit) return true;
    if (!pUnit || !nUnit) return false;

    // 3. Handle Data Equality
    // Key Identity Checks
    if (pUnit.id !== nUnit.id) return false;
    if (pUnit.amount_alive !== nUnit.amount_alive) return false;
    if (pUnit.hp !== nUnit.hp) return false;
    if (pUnit.steps !== nUnit.steps) return false;
    if (pUnit.name !== nUnit.name) return false;

    // ✅ ADDED: Modifier Checks
    // Augments change these values, so we must check them to trigger a re-render
    if (pUnit.attack_mod !== nUnit.attack_mod) return false;
    if (pUnit.attack_multiplier !== nUnit.attack_multiplier) return false;
    if (pUnit.armor_mod !== nUnit.armor_mod) return false;
    if (pUnit.steps_mod !== nUnit.steps_mod) return false;
    if (pUnit.luck_mod !== nUnit.luck_mod) return false;
    if (pUnit.range_shots_mod !== nUnit.range_shots_mod) return false;
    if (pUnit.magic_resist_mod !== nUnit.magic_resist_mod) return false;

    // Handle Impact/Buff changes
    if (prev.overallImpact !== next.overallImpact) return false;

    return true;
};

export const UnitStatsListItem = React.memo(UnitStatsListItemInner, arePropsEqual);
