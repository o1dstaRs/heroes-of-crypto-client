import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import Avatar from "@mui/joy/Avatar";
import Stack from "@mui/joy/Stack";
import { Box } from "@mui/joy";
import { useTheme } from "@mui/joy/styles";
import Button from "@mui/joy/Button";
import ButtonGroup from "@mui/joy/ButtonGroup";
import IconButton from "@mui/joy/IconButton";
import List from "@mui/joy/List";
import Tooltip from "@mui/joy/Tooltip";
import ListItem from "@mui/joy/ListItem";
import ListItemButton from "@mui/joy/ListItemButton";
import ListItemContent from "@mui/joy/ListItemContent";
import Typography from "@mui/joy/Typography";
import React, { useEffect, useState } from "react";
import { AttackType, HoCConstants, UnitProperties, TeamType } from "@heroesofcrypto/common";

import { useManager } from "../../manager";
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
import greenFlagImage from "../../../images/green_flag_128.webp";
import redFlagImage from "../../../images/red_flag_128.webp";
import { images } from "../../generated/image_imports";
import Toggler from "../Toggler";
import { IVisibleOverallImpact, IVisibleImpact } from "../../state/state";

interface IAbilityStackProps {
    abilities: IVisibleImpact[];
    teamType: TeamType;
}

const ABILITIES_FIT_IN_ONE_ROW = 3;

const StackPowerOverlay: React.FC<{ stackPower: number; teamType: TeamType }> = ({ stackPower, teamType }) => {
    if (stackPower === 0) return null;

    const backgroundColor = teamType === TeamType.LOWER ? "rgba(76, 175, 80, 0.6)" : "rgba(244, 67, 54, 0.4)";
    const borderColor = teamType === TeamType.LOWER ? "rgba(76, 175, 80, 0.6)" : "rgba(244, 67, 54, 0.4)";

    return (
        <Box
            sx={{
                position: "absolute",
                bottom: 0,
                left: 0,
                width: "20%",
                height: "100%",
                zIndex: 2,
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
                        backgroundColor: backgroundColor,
                        border: `1px solid ${borderColor}`,
                    }}
                />
            ))}
        </Box>
    );
};

const AbilityStack: React.FC<IAbilityStackProps> = ({ abilities, teamType }) => {
    const theme = useTheme();
    const auraColor = theme.palette.mode === "dark" ? "rgba(255, 255, 255, 0.75)" : "rgba(0, 0, 0, 0.75)";

    return (
        <Stack spacing={2} sx={{ marginTop: 1 }}>
            {[
                ...Array(Math.ceil(abilities.filter((ability) => ability.laps > 0).length / ABILITIES_FIT_IN_ONE_ROW)),
            ].map((_, rowIndex) => (
                <Stack key={`row_${rowIndex}`} direction="row" spacing={2}>
                    {abilities
                        .filter((ability) => ability.laps > 0)
                        .slice(rowIndex * ABILITIES_FIT_IN_ONE_ROW, (rowIndex + 1) * ABILITIES_FIT_IN_ONE_ROW)
                        .map((ability, index) => (
                            <Tooltip
                                title={`${ability.name}: ${ability.description}`}
                                key={`tooltip_${rowIndex}_${index}`}
                                style={{ zIndex: 3 }}
                            >
                                <Box
                                    sx={{
                                        position: "relative",
                                        width: "28%",
                                        paddingBottom: "28%",
                                        overflow: "hidden",
                                        "&::before": {
                                            // Using pseudo-element to create the circular glow
                                            content: '""',
                                            position: "absolute",
                                            top: "50%",
                                            left: "50%",
                                            width: "100%",
                                            height: "100%",
                                            transform: "translate(-50%, -50%)",
                                            borderRadius: "20%", // Makes the element circular
                                            boxShadow: ability.isAura ? `0 0 15px 10px ${auraColor}` : "none",
                                            zIndex: 0, // Ensures it's behind the image
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
                                    <StackPowerOverlay
                                        stackPower={ability.isStackPowered ? ability.stackPower : 0}
                                        teamType={teamType}
                                    />
                                </Box>
                            </Tooltip>
                        ))}
                </Stack>
            ))}
        </Stack>
    );
};

const EffectColumn: React.FC<{ effects: IVisibleImpact[]; title: string }> = ({ effects, title }) => {
    const [scrollIndex, setScrollIndex] = useState(0);

    const scrollUp = () => setScrollIndex(Math.max(0, scrollIndex - 1));
    const scrollDown = () => setScrollIndex(Math.min(effects.length - 5, scrollIndex + 1));

    return (
        <Box sx={{ width: "80px", height: "100%", display: "flex", flexDirection: "column" }}>
            <Typography level="body-sm" sx={{ textAlign: "center" }}>
                {title}
            </Typography>
            <IconButton onClick={scrollUp} disabled={scrollIndex === 0} size="sm">
                <KeyboardArrowUpIcon />
            </IconButton>
            <Box sx={{ flex: 1, overflow: "hidden" }}>
                {effects.slice(scrollIndex, scrollIndex + 5).map((effect, index) => (
                    <Tooltip key={index} title={`${effect.name}: ${effect.description}`}>
                        <Box
                            component="img"
                            // @ts-ignore: src params
                            src={images[effect.smallTextureName]}
                            sx={{
                                width: "100%",
                                height: "20%",
                                objectFit: "contain",
                            }}
                        />
                    </Tooltip>
                ))}
            </Box>
            <IconButton onClick={scrollDown} disabled={scrollIndex >= effects.length - 5} size="sm">
                <KeyboardArrowDownIcon />
            </IconButton>
        </Box>
    );
};

export const UnitStatsListItem: React.FC = () => {
    const [unitProperties, setUnitProperties] = useState({} as UnitProperties);
    const [overallImpact, setVisibleOverallImpact] = useState({} as IVisibleOverallImpact);
    const [raceName, setRaceName] = useState("");

    const manager = useManager();

    useEffect(() => {
        const connection1 = manager.onUnitSelected.connect(setUnitProperties);
        return () => {
            connection1.disconnect();
        };
    });

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

    const abilities: IVisibleImpact[] = overallImpact.abilities || [];
    const buffs: IVisibleImpact[] = overallImpact.buffs || [];
    const debuffs: IVisibleImpact[] = overallImpact.debuffs || [];

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
        const luckPerTurn = unitProperties.luck_per_turn
            ? `${unitProperties.luck_per_turn >= 0 ? "+" : ""}${unitProperties.luck_per_turn}`
            : "";
        const armorMod = unitProperties.armor_mod
            ? `${unitProperties.armor_mod >= 0 ? "+" : ""}${unitProperties.armor_mod}`
            : "";

        let luckButtonStyle;
        if (unitProperties.luck_per_turn > 0) {
            luckButtonStyle = { "--ButtonGroup-separatorSize": "0px", backgroundColor: "#D0FFBC" };
        } else if (unitProperties.luck_per_turn < 0) {
            luckButtonStyle = { "--ButtonGroup-separatorSize": "0px", backgroundColor: "#FFC6C6" };
        } else {
            luckButtonStyle = { "--ButtonGroup-separatorSize": "0px" };
        }

        let attackButtonStyle;
        if (unitProperties.attack_multiplier > 1) {
            attackButtonStyle = { "--ButtonGroup-separatorSize": "0px", backgroundColor: "#D0FFBC" };
        } else if (unitProperties.attack_multiplier < 1) {
            attackButtonStyle = { "--ButtonGroup-separatorSize": "0px", backgroundColor: "#FFC6C6" };
        } else {
            attackButtonStyle = { "--ButtonGroup-separatorSize": "0px" };
        }

        const attackTypeSelected = unitProperties.attack_type_selected;
        let attackDamage = unitProperties.attack;
        if (attackTypeSelected === AttackType.MELEE && unitProperties.attack_type === AttackType.RANGE) {
            attackDamage /= 2;
        }
        const hasDifferentRangeArmor = unitProperties.base_armor !== unitProperties.range_armor;
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
                    <List sx={{ gap: 0 }}>
                        <>
                            <Avatar
                                // @ts-ignore: src params
                                src={images[largeTextureName]}
                                variant="plain"
                                sx={{ transform: "rotateX(-180deg)", zIndex: "modal" }}
                                style={{
                                    width: "auto",
                                    height: "auto",
                                    overflow: "visible",
                                }}
                            />
                            <Avatar
                                src={unitProperties.team === 1 ? redFlagImage : greenFlagImage}
                                variant="plain"
                                sx={{ transform: "rotateX(-180deg)", zIndex: "tooltip" }}
                                style={{
                                    height: "100px",
                                    position: "absolute",
                                    overflow: "visible",
                                }}
                            />
                        </>

                        <ListItem>
                            <Tooltip title="Health points" style={{ zIndex: 3 }}>
                                <ButtonGroup
                                    aria-label="hp"
                                    // @ts-ignore: style params
                                    size="xs"
                                    style={{ "--ButtonGroup-separatorSize": "0px" }}
                                >
                                    <IconButton disabled>
                                        <HeartIcon />
                                    </IconButton>
                                    <Button disabled>{unitProperties.hp}</Button>
                                    <Button disabled>({unitProperties.max_hp})</Button>
                                </ButtonGroup>
                            </Tooltip>
                        </ListItem>
                        {unitProperties.can_cast_spells ? (
                            <ListItem>
                                <Tooltip title="Number of magic scrolls" style={{ zIndex: 3 }}>
                                    <ButtonGroup
                                        aria-label="scrolls"
                                        // @ts-ignore: style params
                                        size="xs"
                                        style={{ "--ButtonGroup-separatorSize": "0px" }}
                                    >
                                        <IconButton disabled>
                                            <ScrollIcon />
                                        </IconButton>
                                        <Button disabled>{unitProperties.spells.length}</Button>
                                    </ButtonGroup>
                                </Tooltip>
                            </ListItem>
                        ) : (
                            <span />
                        )}

                        <ListItem>
                            <Tooltip title="Attack spread" style={{ zIndex: 3 }}>
                                <ButtonGroup
                                    aria-label="attack_spread"
                                    // @ts-ignore: style params
                                    size="xs"
                                    style={{ "--ButtonGroup-separatorSize": "0px" }}
                                >
                                    <IconButton disabled>
                                        <FistIcon />
                                    </IconButton>
                                    <Button disabled>{damageRange}</Button>
                                </ButtonGroup>
                            </Tooltip>
                            <Tooltip title="Attack type and multiplier" style={{ zIndex: 3 }}>
                                <ButtonGroup
                                    aria-label="attack"
                                    // @ts-ignore: style params
                                    size="xs"
                                    style={attackButtonStyle}
                                >
                                    <IconButton disabled>
                                        {attackTypeSelected === AttackType.RANGE ? <BowIcon /> : <SwordIcon />}
                                    </IconButton>
                                    <Button disabled>{attackDamage}</Button>
                                    {unitProperties.attack_multiplier !== 1 ? (
                                        <Button disabled>x{unitProperties.attack_multiplier}</Button>
                                    ) : (
                                        <span />
                                    )}
                                </ButtonGroup>
                            </Tooltip>
                        </ListItem>

                        {unitProperties.attack_type === AttackType.RANGE ? (
                            <ListItem>
                                <Tooltip title="Ranged shot distance in cells" style={{ zIndex: 3 }}>
                                    <ButtonGroup
                                        aria-label="shot_distance"
                                        // @ts-ignore: style params
                                        size="xs"
                                        style={{ "--ButtonGroup-separatorSize": "0px" }}
                                    >
                                        <IconButton disabled>
                                            <ShotRangeIcon />
                                        </IconButton>
                                        <Button disabled>{unitProperties.shot_distance}</Button>
                                    </ButtonGroup>
                                </Tooltip>
                                <Tooltip title="Number of ranged shots" style={{ zIndex: 3 }}>
                                    <ButtonGroup
                                        aria-label="number_of_shots"
                                        // @ts-ignore: style params
                                        size="xs"
                                        style={{ "--ButtonGroup-separatorSize": "0px" }}
                                    >
                                        <IconButton disabled>
                                            <QuiverIcon />
                                        </IconButton>
                                        <Button disabled>
                                            {unitProperties.range_shots_mod
                                                ? unitProperties.range_shots_mod
                                                : unitProperties.range_shots}
                                        </Button>
                                    </ButtonGroup>
                                </Tooltip>
                            </ListItem>
                        ) : (
                            <span />
                        )}

                        <ListItem>
                            <Tooltip title="Base armor" style={{ zIndex: 3 }}>
                                <ButtonGroup
                                    aria-label="armor"
                                    // @ts-ignore: style params
                                    size="xs"
                                    style={{ "--ButtonGroup-separatorSize": "0px" }}
                                >
                                    <IconButton disabled>
                                        <ShieldIcon />
                                    </IconButton>
                                    <Button disabled>{unitProperties.base_armor + unitProperties.armor_mod}</Button>
                                    {armorMod ? <Button disabled>({armorMod})</Button> : <span />}
                                </ButtonGroup>
                            </Tooltip>
                            <Tooltip title="Magic shield in %" style={{ zIndex: 3 }}>
                                <ButtonGroup
                                    aria-label="magic_armor"
                                    // @ts-ignore: style params
                                    size="xs"
                                    style={{ "--ButtonGroup-separatorSize": "0px" }}
                                >
                                    <IconButton disabled>
                                        <MagicShieldIcon />
                                    </IconButton>
                                    <Button disabled>
                                        {unitProperties.magic_resist_mod
                                            ? unitProperties.magic_resist_mod
                                            : unitProperties.magic_resist}
                                        %
                                    </Button>
                                </ButtonGroup>
                            </Tooltip>
                        </ListItem>

                        {hasDifferentRangeArmor ? (
                            <ListItem>
                                <Tooltip title="Range armor" style={{ zIndex: 3 }}>
                                    <ButtonGroup
                                        aria-label="range_armor"
                                        // @ts-ignore: style params
                                        size="xs"
                                        style={{ "--ButtonGroup-separatorSize": "0px" }}
                                    >
                                        <IconButton disabled>
                                            <ArrowShieldIcon />
                                        </IconButton>
                                        <Button disabled>
                                            {unitProperties.range_armor + unitProperties.armor_mod}
                                        </Button>
                                        {armorMod ? <Button disabled>({armorMod})</Button> : <span />}
                                    </ButtonGroup>
                                </Tooltip>
                            </ListItem>
                        ) : (
                            <span />
                        )}

                        <ListItem>
                            <Tooltip title="Movement type and number of steps in cells" style={{ zIndex: 3 }}>
                                <ButtonGroup
                                    aria-label="step_size"
                                    // @ts-ignore: style params
                                    size="xs"
                                    style={{ "--ButtonGroup-separatorSize": "0px" }}
                                >
                                    <IconButton disabled>
                                        {unitProperties.can_fly ? <WingIcon /> : <BootIcon />}
                                    </IconButton>
                                    <Button disabled>
                                        {Number((unitProperties.steps + unitProperties.steps_morale).toFixed(2))}
                                    </Button>
                                </ButtonGroup>
                            </Tooltip>
                            <Tooltip
                                title="Units with higher speed turn first on the battlefield"
                                style={{ zIndex: 3 }}
                            >
                                <ButtonGroup
                                    aria-label="speed"
                                    // @ts-ignore: style params
                                    size="xs"
                                    style={{ "--ButtonGroup-separatorSize": "0px" }}
                                >
                                    <IconButton disabled>
                                        <SpeedIcon />
                                    </IconButton>
                                    <Button disabled>{unitProperties.speed}</Button>
                                </ButtonGroup>
                            </Tooltip>
                        </ListItem>
                        <ListItem>
                            <Tooltip
                                title="The morale parameter affects the chance of an out of regular order action depending on whether it is positive or negative"
                                style={{ zIndex: 3 }}
                            >
                                <ButtonGroup
                                    aria-label="morale"
                                    /*
    // @ts-ignore: style params */
                                    size="xs"
                                    style={{ "--ButtonGroup-separatorSize": "0px" }}
                                >
                                    <IconButton disabled>
                                        <MoraleIcon />
                                    </IconButton>
                                    <Button disabled>{unitProperties.morale}</Button>
                                </ButtonGroup>
                            </Tooltip>
                            <Tooltip
                                title="Dealing extra damage or reducing damage taken in combat. Also affecting abilities chance"
                                style={{ zIndex: 3 }}
                            >
                                <ButtonGroup
                                    aria-label="luck"
                                    // @ts-ignore: style params
                                    size="xs"
                                    style={luckButtonStyle}
                                >
                                    <IconButton disabled>
                                        <LuckIcon />
                                    </IconButton>
                                    <Button disabled>{unitProperties.luck + unitProperties.luck_per_turn}</Button>
                                    {luckPerTurn ? <Button disabled>({luckPerTurn})</Button> : <span />}
                                </ButtonGroup>
                            </Tooltip>
                        </ListItem>
                        <Typography level="title-sm" sx={{ marginTop: 1.5 }}>
                            Abilities
                        </Typography>
                        <AbilityStack abilities={abilities} teamType={unitProperties.team} />
                    </List>
                </Toggler>
            </ListItem>
        );
    }

    return <ListItem nested />;
};
