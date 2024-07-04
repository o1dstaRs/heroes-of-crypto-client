import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import Avatar from "@mui/joy/Avatar";
import Stack from "@mui/joy/Stack";
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
import { AttackType, UnitProperties } from "@heroesofcrypto/common";

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

export default function UnitStatsListItem() {
    const [unitProperties, setUnitProperties] = useState({} as UnitProperties);
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
        const damageRange = `${unitProperties.attack_damage_min}-${unitProperties.attack_damage_max}`;
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
                        <Stack direction="row" spacing={2} sx={{ marginTop: 2 }}>
                            <Avatar
                                // @ts-ignore: src params
                                src={images["leather_armor_256"]}
                                variant="plain"
                                sx={{ transform: "rotateX(-180deg)", zIndex: "modal" }}
                                style={{
                                    width: "28%",
                                    height: "auto",
                                    overflow: "visible",
                                }}
                            />
                            <Avatar
                                // @ts-ignore: src params
                                src={images["leather_armor_256"]}
                                variant="plain"
                                sx={{ transform: "rotateX(-180deg)", zIndex: "modal" }}
                                style={{
                                    width: "28%",
                                    height: "auto",
                                    overflow: "visible",
                                }}
                            />
                            <Avatar
                                // @ts-ignore: src params
                                src={images["leather_armor_256"]}
                                variant="plain"
                                sx={{ transform: "rotateX(-180deg)", zIndex: "modal" }}
                                style={{
                                    width: "28%",
                                    height: "auto",
                                    overflow: "visible",
                                }}
                            />
                        </Stack>
                    </List>
                </Toggler>
            </ListItem>
        );
    }

    return <ListItem nested />;
}
