import { AttackType, MovementType, HoCConstants, TeamType, UnitProperties, HoCLib } from "@heroesofcrypto/common";
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
import React, { useEffect, useState } from "react";

import { images } from "../../generated/image_imports";
import { useManager } from "../../manager";
import { IVisibleImpact, IVisibleOverallImpact } from "../../state/visible_state";
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
import { WingIcon } from "../svg/wing";
import Toggler from "../Toggler";

interface IAbilityStackProps {
    abilities: IVisibleImpact[];
    teamType: TeamType;
}

const ABILITIES_FIT_IN_ONE_ROW = 3;

const StackPowerOverlay: React.FC<{ stackPower: number; teamType: TeamType; isAura: boolean }> = ({
    stackPower,
    teamType,
    isAura,
}) => {
    if (stackPower === 0) return null;

    const backgroundColor = teamType === TeamType.LOWER ? "rgba(76, 175, 80, 0.6)" : "rgba(244, 67, 54, 0.4)";
    const borderColor = teamType === TeamType.LOWER ? "rgba(76, 175, 80, 0.6)" : "rgba(244, 67, 54, 0.4)";

    return (
        <Box
            sx={{
                position: "absolute",
                bottom: 0,
                left: 0,
                width: isAura ? "100%" : "20%",
                height: isAura ? "50%" : "100%", // Half height for aura to create a half-circle
                zIndex: 3, // Ensures it's above the image and glow effect
            }}
        >
            {[...Array(stackPower)].map((_, index) => (
                <Box
                    key={`stack_${index}`}
                    sx={{
                        position: "absolute",
                        bottom: `${isAura ? 90 : 0}%`,
                        left: isAura ? "30%" : 0, // Move the stack to the left side
                        width: isAura ? "30px" : "100%", // Enlarge width of each rectangle for aura
                        height: isAura
                            ? `${index * (index / 3) + 20}px` // Enlarge height of each rectangle for aura
                            : `${((index + 1) / HoCConstants.MAX_UNIT_STACK_POWER) * 100}%`,
                        transform: isAura
                            ? `rotate(${index * 41}deg) translateX(-20%) translateY(200%)` // Rotate each rectangle to form a half-circle
                            : "none",
                        transformOrigin: "bottom center", // Set origin for rotation to the bottom center of the rectangle
                        clipPath: isAura ? "none" : "polygon(20% 100%, 100% 100%, 100% 20%, 0 0)",
                        backgroundColor: backgroundColor,
                        border: `1px solid ${borderColor}`,
                        zIndex: stackPower - index, // Ensure stacking order
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

    return (
        <Stack spacing={2} sx={{ marginTop: 1 }}>
            {[
                ...Array(Math.ceil(abilities.filter((ability) => ability.laps > 0).length / ABILITIES_FIT_IN_ONE_ROW)),
            ].map((_, rowIndex) => (
                <Stack key={`row_${rowIndex}`} direction="row" spacing={2} sx={{ width: "100%" }}>
                    {abilities
                        .filter((ability) => ability.laps > 0)
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
                                style={{ zIndex: 3 }}
                            >
                                <Box
                                    sx={{
                                        position: "relative",
                                        width: isWidescreen ? "22%" : "30%", // Force each ability to take 1/3 of row width
                                        paddingBottom: isWidescreen ? "22%" : "30%", // Forces a square aspect ratio
                                        overflow: "hidden",
                                        borderRadius: ability.isAura ? "50%" : "15%", // Circle if aura, rounded corners otherwise
                                        "&::before": {
                                            // Using pseudo-element to create the circular glow
                                            content: '""',
                                            position: "absolute",
                                            top: "50%",
                                            left: "50%",
                                            width: "100%",
                                            height: "100%",
                                            transform: "translate(-50%, -50%)",
                                            borderRadius: ability.isAura ? "50%" : "20%", // Circle if aura, slightly rounded otherwise
                                            boxShadow: ability.isAura ? `-20px 0 -20px 60px ${auraColor}` : "none",
                                            zIndex: 0, // Ensures it's behind the image
                                        },
                                        "&::after": {
                                            // Adding a frame effect
                                            content: '""',
                                            position: "absolute",
                                            top: 0,
                                            left: 0,
                                            right: 0,
                                            bottom: 0,
                                            borderRadius: ability.isAura ? "50%" : "15%", // Circle if aura, rounded corners otherwise
                                            border: ability.isAura ? `2px solid ${auraColor}` : "none", // Only show frame for aura
                                            zIndex: 2, // Ensures it's above the image and glow effect
                                            pointerEvents: "none", // Prevents the frame from interfering with clicks
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
                                            transform: "rotateX(-180deg)",
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
                ...(isHorizontalLayout ? {} : { paddingLeft: "2px" }), // Add 2px padding on the left side if not horizontal layout
            }}
        >
            <Typography
                level="title-sm"
                sx={{
                    textAlign: isHorizontalLayout ? "left" : "center",
                    ...(isHorizontalLayout ? {} : { fontSize: 9 }), // Conditional fontSize based on layout
                    width: "8ch", // Fixed width for 8 symbols
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
                    >
                        <Box
                            component="img"
                            // @ts-ignore: src params
                            src={images[effect.smallTextureName]}
                            sx={{
                                width: isHorizontalLayout ? "13%" : "auto",
                                maxWidth: "100%",
                                height: "auto",
                                aspectRatio: "1", // Maintain width=height ratio
                                objectFit: "contain",
                                transform: "rotateX(-180deg)",
                                zIndex: 3,
                                margin: isHorizontalLayout && index !== 0 ? "0 2px" : "1px", // Add margin between elements in horizontal layout
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
    positiveFrame?: boolean; // New flag for positive frame
    negativeFrame?: boolean; // New flag for negative frame
}> = ({ icon, value, tooltip, color, badgeContent, badgeColor, positiveFrame, negativeFrame }) => (
    <Tooltip title={tooltip}>
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
                      : "transparent", // Add light effect inside the box
                ...(positiveFrame
                    ? { boxShadow: "0 0 5px 5px green", borderRadius: "20px" } // Apply borderRadius for circular corners
                    : negativeFrame
                      ? { boxShadow: "0 0 5px 5px red", borderRadius: "20px" } // Apply borderRadius for circular corners
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
}) => {
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
    let attackColor = "success";
    if (unitProperties.attack_multiplier < 1) {
        attackColor = "danger";
    } else if (unitProperties.attack_multiplier === 1 && unitProperties.attack_mod < 0) {
        attackColor = "danger";
    }

    const content = (
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
                    icon={attackTypeSelected === AttackType.RANGE ? <BowIcon /> : <SwordIcon />}
                    value={Number(attackDamage.toFixed(2))}
                    tooltip="Attack type and multiplier"
                    color={attackTypeSelected === AttackType.RANGE ? "#ffd700" : "#a52a2a"}
                    badgeContent={attackModBadgeValue}
                    badgeColor={attackColor}
                    positiveFrame={unitProperties.attack_multiplier > 1}
                    negativeFrame={unitProperties.attack_multiplier < 1}
                />
            </StatGroup>
            {unitProperties.attack_type === AttackType.RANGE && (
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
                    icon={unitProperties.movement_type === MovementType.FLY ? <WingIcon /> : <BootIcon />}
                    value={Number((unitProperties.steps + stepsMod).toFixed(1))}
                    tooltip="Movement type and number of steps in cells"
                    color={unitProperties.movement_type === MovementType.FLY ? "#00ff7f" : "#8b4513"}
                    badgeContent={stepsModBadgeValue}
                    badgeColor={stepsMod > 0 ? "success" : "danger"}
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
                    tooltip="Luck: Increases or decreases damage received in combat, while also affecting the probability or power of abilities"
                    color="#ff4040"
                    badgeContent={luckBadgeValue}
                    badgeColor={unitProperties.luck_mod > 0 ? "success" : "danger"}
                    positiveFrame={unitProperties.luck + unitProperties.luck_mod >= HoCConstants.LUCK_MAX_VALUE_TOTAL}
                    negativeFrame={unitProperties.luck + unitProperties.luck_mod <= -HoCConstants.LUCK_MAX_VALUE_TOTAL}
                />
            </StatGroup>
        </>
    );

    if (columnize) {
        return (
            <Box sx={{ display: "flex", width: "100%", overflow: "hidden", flexWrap: "wrap" }}>
                <Box sx={{ width: "60%", position: "relative" }}>
                    <Avatar
                        src={images[largeTextureName]}
                        variant="plain"
                        sx={{
                            width: "100%",
                            zIndex: 5,
                            height: "auto",
                            transform: "rotateX(-180deg)",
                            objectFit: "contain",
                            overflow: "visible",
                        }}
                    />
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
                        transform: "scale(1.2)",
                    }}
                >
                    {content}
                </Box>
            </Box>
        );
    } else {
        return (
            <Box sx={{ position: "relative", marginBottom: 1.5 }}>
                <Avatar
                    // @ts-ignore: src params
                    src={images[largeTextureName]}
                    variant="plain"
                    sx={{
                        transform: "rotateX(-180deg)",
                        zIndex: 5,
                        width: "auto", // Removes fixed width
                        height: "auto", // Removes fixed height, letting the image maintain its natural size
                        maxWidth: "100%", // Ensures the image does not overflow its container
                        maxHeight: "100%", // Ensures the image does not overflow vertically
                        objectFit: "contain", // Ensures the image fits without cropping
                        overflow: "visible",
                    }}
                />
                <Box
                    sx={{
                        width: "90%",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "center",
                        pl: 4,
                        py: 4,
                        transform: "scale(1.2)", // Enlarges all elements by 20%
                    }}
                >
                    {content}
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

export const UnitStatsListItem: React.FC<{ barSize: number; columnize: boolean; unitProperties: UnitProperties }> = ({
    barSize,
    columnize,
    unitProperties,
}) => {
    const [overallImpact, setVisibleOverallImpact] = useState({} as IVisibleOverallImpact);
    const [, setAugmentChanged] = useState(false);
    const [raceName, setRaceName] = useState("");
    const theme = useTheme();
    const isDarkMode = theme.palette.mode === "dark";

    const manager = useManager();

    useEffect(() => {
        const connection2 = manager.onRaceSelected.connect(setRaceName);
        return () => {
            connection2.disconnect();
        };
    });

    useEffect(() => {
        const connection3 = manager.onVisibleOverallImpactUpdated.connect(setVisibleOverallImpact);
        return () => {
            connection3.disconnect();
        };
    });

    useEffect(() => {
        const connection = manager.onAugmentChanged.connect((hasChanged) => {
            setAugmentChanged(hasChanged);
        });

        return () => {
            connection.disconnect();
        };
    }, [manager]);

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

    // @ts-ignore: style params
    if (raceName) {
        return (
            // @ts-ignore: style params
            <ListItem style={{ "--List-nestedInsetStart": "0px" }} nested>
                <Toggler
                    renderToggle={({ open, setOpen }) => (
                        <ListItemButton onClick={() => setOpen(!open)}>
                            <ListItemContent>
                                <Typography level="title-sm">{raceName}</Typography>
                            </ListItemContent>
                            <KeyboardArrowDownIcon sx={{ transform: open ? "rotate(180deg)" : "none" }} />
                        </ListItemButton>
                    )}
                >
                    <List sx={{ gap: 0 }}>
                        <Avatar
                            // @ts-ignore: src params
                            src={images[`${raceName.toLowerCase()}_512`]}
                            variant="plain"
                            sx={{ transform: "rotateX(-180deg)", zIndex: "modal" }}
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
    if (unitProperties && Object.keys(unitProperties).length) {
        const stackName = `${unitProperties.name} x${unitProperties.amount_alive}`;
        const damageRange = `${unitProperties.attack_damage_min} - ${unitProperties.attack_damage_max}`;
        const armorMod = Number(unitProperties.armor_mod.toFixed(2));
        const stepsMod = Number(unitProperties.steps_mod.toFixed(1));
        const attackMod = Number(unitProperties.attack_mod.toFixed(2));
        const attackTypeSelected = unitProperties.attack_type_selected;
        let attackDamage = (unitProperties.base_attack + unitProperties.attack_mod) * unitProperties.attack_multiplier;
        if (
            attackTypeSelected === AttackType.MELEE &&
            unitProperties.attack_type === AttackType.RANGE &&
            !hasHandymanAbility
        ) {
            attackDamage /= 2;
        }
        const meleeArmor = Math.max(1, unitProperties.base_armor + unitProperties.armor_mod);
        const rangeArmor = Math.max(1, unitProperties.range_armor + unitProperties.armor_mod);
        const hasDifferentRangeArmor = meleeArmor !== rangeArmor;
        const largeTextureName = unitProperties.large_texture_name;

        return (
            // @ts-ignore: style params
            <ListItem style={{ "--List-nestedInsetStart": "0px" }} nested>
                <Toggler
                    renderToggle={({ open, setOpen }) => (
                        <ListItemButton onClick={() => setOpen(!open)}>
                            {unitProperties.team === 1 ? <RedUserIcon /> : <GreenUserIcon />}
                            <ListItemContent>
                                <Typography level="title-sm">{stackName}</Typography>
                            </ListItemContent>
                            <KeyboardArrowDownIcon sx={{ transform: open ? "rotate(180deg)" : "none" }} />
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
                            />
                            {hasBuffsOrDebuffs && !columnize && (
                                <Box
                                    sx={{
                                        width: barSize > 256 ? "20%" : "15%",
                                        display: "flex",
                                        flexDirection: "column",
                                    }}
                                >
                                    {buffs.length > 0 && <EffectColumnOrRow effects={buffs} title="Buffs" />}
                                    {debuffs.length > 0 && <EffectColumnOrRow effects={debuffs} title="Debuffs" />}
                                </Box>
                            )}
                        </Box>
                        <Box sx={{ width: columnize ? "100%" : "auto" }}>
                            <Typography level="title-sm" sx={{ marginTop: columnize ? 1.5 : 0 }}>
                                Abilities
                            </Typography>
                            <AbilityStack
                                abilities={abilities}
                                teamType={unitProperties.team}
                                isWidescreen={columnize}
                                hasBreakApplied={hasBreakApplied}
                            />
                        </Box>
                        {hasBuffsOrDebuffs && columnize && (
                            <Box sx={{ width: "100%", display: "flex", flexDirection: "column" }}>
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
