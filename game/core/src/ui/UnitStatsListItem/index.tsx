import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import Avatar from "@mui/joy/Avatar";
import Button from "@mui/joy/Button";
import ButtonGroup from "@mui/joy/ButtonGroup";
import IconButton from "@mui/joy/IconButton";
import List from "@mui/joy/List";
import ListItem from "@mui/joy/ListItem";
import ListItemButton from "@mui/joy/ListItemButton";
import ListItemContent from "@mui/joy/ListItemContent";
import Typography from "@mui/joy/Typography";
import React, { useEffect, useState } from "react";
import { AttackType, UnitStats } from "@heroesofcrypto/common";

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
    const [unitStats, setUnitStats] = useState({} as UnitStats);
    const [raceName, setRaceName] = useState("");

    const manager = useManager();

    useEffect(() => {
        const connection1 = manager.onUnitSelected.connect(setUnitStats);
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
    if (unitStats && Object.keys(unitStats).length) {
        const stackName = `${unitStats.name} x${unitStats.amount_alive}`;
        const damageRange = `${unitStats.attack_damage_min}-${unitStats.attack_damage_max}`;
        const luckPerTurn = unitStats.luck_per_turn
            ? `${unitStats.luck_per_turn >= 0 ? "+" : ""}${unitStats.luck_per_turn}`
            : "";
        const armorMod = unitStats.armor_mod ? `${unitStats.armor_mod >= 0 ? "+" : ""}${unitStats.armor_mod}` : "";

        let luckButtonStyle;
        if (unitStats.luck_per_turn > 0) {
            luckButtonStyle = { "--ButtonGroup-separatorSize": "0px", backgroundColor: "#D0FFBC" };
        } else if (unitStats.luck_per_turn < 0) {
            luckButtonStyle = { "--ButtonGroup-separatorSize": "0px", backgroundColor: "#FFC6C6" };
        } else {
            luckButtonStyle = { "--ButtonGroup-separatorSize": "0px" };
        }

        let attackButtonStyle;
        if (unitStats.attack_multiplier > 1) {
            attackButtonStyle = { "--ButtonGroup-separatorSize": "0px", backgroundColor: "#D0FFBC" };
        } else if (unitStats.attack_multiplier < 1) {
            attackButtonStyle = { "--ButtonGroup-separatorSize": "0px", backgroundColor: "#FFC6C6" };
        } else {
            attackButtonStyle = { "--ButtonGroup-separatorSize": "0px" };
        }

        const attackTypeSelected = unitStats.attack_type_selected;
        let attackDamage = unitStats.attack;
        if (attackTypeSelected === AttackType.MELEE && unitStats.attack_type === AttackType.RANGE) {
            attackDamage /= 2;
        }
        const hasDifferentRangeArmor = unitStats.base_armor !== unitStats.range_armor;

        const unitName = unitStats.name.toLowerCase().replace(" ", "_");

        return (
            // @ts-ignore: style params
            <ListItem style={{ "--List-nestedInsetStart": "0px" }} nested>
                <Toggler
                    renderToggle={({ open, setOpen }) => (
                        <ListItemButton onClick={() => setOpen(!open)}>
                            {unitStats.team === 1 ? <RedUserIcon /> : <GreenUserIcon />}
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
                                src={images[`${unitName}_512`]}
                                variant="plain"
                                sx={{ transform: "rotateX(-180deg)", zIndex: "modal" }}
                                style={{
                                    width: "auto",
                                    height: "auto",
                                    overflow: "visible",
                                }}
                            />
                            <Avatar
                                src={unitStats.team === 1 ? redFlagImage : greenFlagImage}
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
                            <ButtonGroup
                                aria-label="hp"
                                // @ts-ignore: style params
                                size="xs"
                                style={{ "--ButtonGroup-separatorSize": "0px" }}
                            >
                                <IconButton disabled>
                                    <HeartIcon />
                                </IconButton>
                                <Button disabled>{unitStats.hp}</Button>
                                <Button disabled>({unitStats.max_hp})</Button>
                            </ButtonGroup>
                        </ListItem>
                        {unitStats.can_cast_spells ? (
                            <ListItem>
                                <ButtonGroup
                                    aria-label="mana"
                                    // @ts-ignore: style params
                                    size="xs"
                                    style={{ "--ButtonGroup-separatorSize": "0px" }}
                                >
                                    <IconButton disabled>
                                        <ScrollIcon />
                                    </IconButton>
                                    <Button disabled>{unitStats.spells.length}</Button>
                                </ButtonGroup>
                            </ListItem>
                        ) : (
                            <span />
                        )}

                        <ListItem>
                            <ButtonGroup
                                aria-label="fist"
                                // @ts-ignore: style params
                                size="xs"
                                style={{ "--ButtonGroup-separatorSize": "0px" }}
                            >
                                <IconButton disabled>
                                    <FistIcon />
                                </IconButton>
                                <Button disabled>{damageRange}</Button>
                            </ButtonGroup>
                            <ButtonGroup
                                aria-label="attack"
                                // @ts-ignore: style params
                                size="xs"
                                style={attackButtonStyle}
                            >
                                <IconButton disabled>
                                    {attackTypeSelected === "RANGE" ? <BowIcon /> : <SwordIcon />}
                                </IconButton>
                                <Button disabled>{attackDamage}</Button>
                                {unitStats.attack_multiplier !== 1 ? (
                                    <Button disabled>x{unitStats.attack_multiplier}</Button>
                                ) : (
                                    <span />
                                )}
                            </ButtonGroup>
                        </ListItem>

                        {unitStats.attack_type === "RANGE" ? (
                            <ListItem>
                                <ButtonGroup
                                    aria-label="shot_distance"
                                    // @ts-ignore: style params
                                    size="xs"
                                    style={{ "--ButtonGroup-separatorSize": "0px" }}
                                >
                                    <IconButton disabled>
                                        <ShotRangeIcon />
                                    </IconButton>
                                    <Button disabled>{unitStats.shot_distance}</Button>
                                </ButtonGroup>
                                <ButtonGroup
                                    aria-label="quiver"
                                    // @ts-ignore: style params
                                    size="xs"
                                    style={{ "--ButtonGroup-separatorSize": "0px" }}
                                >
                                    <IconButton disabled>
                                        <QuiverIcon />
                                    </IconButton>
                                    <Button disabled>
                                        {unitStats.range_shots_mod ? unitStats.range_shots_mod : unitStats.range_shots}
                                    </Button>
                                </ButtonGroup>
                            </ListItem>
                        ) : (
                            <span />
                        )}

                        <ListItem>
                            <ButtonGroup
                                aria-label="shield"
                                // @ts-ignore: style params
                                size="xs"
                                style={{ "--ButtonGroup-separatorSize": "0px" }}
                            >
                                <IconButton disabled>
                                    <ShieldIcon />
                                </IconButton>
                                <Button disabled>{unitStats.base_armor + unitStats.armor_mod}</Button>
                                {armorMod ? <Button disabled>({armorMod})</Button> : <span />}
                            </ButtonGroup>
                            <ButtonGroup
                                aria-label="magic_shield"
                                // @ts-ignore: style params
                                size="xs"
                                style={{ "--ButtonGroup-separatorSize": "0px" }}
                            >
                                <IconButton disabled>
                                    <MagicShieldIcon />
                                </IconButton>
                                <Button disabled>
                                    {unitStats.magic_resist_mod ? unitStats.magic_resist_mod : unitStats.magic_resist}%
                                </Button>
                            </ButtonGroup>
                        </ListItem>

                        {hasDifferentRangeArmor ? (
                            <ListItem>
                                <ButtonGroup
                                    aria-label="mana"
                                    // @ts-ignore: style params
                                    size="xs"
                                    style={{ "--ButtonGroup-separatorSize": "0px" }}
                                >
                                    <IconButton disabled>
                                        <ArrowShieldIcon />
                                    </IconButton>
                                    <Button disabled>{unitStats.range_armor + unitStats.armor_mod}</Button>
                                    {armorMod ? <Button disabled>({armorMod})</Button> : <span />}
                                </ButtonGroup>
                            </ListItem>
                        ) : (
                            <span />
                        )}

                        <ListItem>
                            <ButtonGroup
                                aria-label="step_size"
                                // @ts-ignore: style params
                                size="xs"
                                style={{ "--ButtonGroup-separatorSize": "0px" }}
                            >
                                <IconButton disabled>{unitStats.can_fly ? <WingIcon /> : <BootIcon />}</IconButton>
                                <Button disabled>
                                    {Number((unitStats.steps + unitStats.steps_morale).toFixed(2))}
                                </Button>
                            </ButtonGroup>
                            <ButtonGroup
                                aria-label="speed"
                                // @ts-ignore: style params
                                size="xs"
                                style={{ "--ButtonGroup-separatorSize": "0px" }}
                            >
                                <IconButton disabled>
                                    <SpeedIcon />
                                </IconButton>
                                <Button disabled>{unitStats.speed}</Button>
                            </ButtonGroup>
                        </ListItem>
                        <ListItem>
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
                                <Button disabled>{unitStats.morale}</Button>
                            </ButtonGroup>
                            <ButtonGroup
                                aria-label="luck"
                                // @ts-ignore: style params
                                size="xs"
                                style={luckButtonStyle}
                            >
                                <IconButton disabled>
                                    <LuckIcon />
                                </IconButton>
                                <Button disabled>{unitStats.luck + unitStats.luck_per_turn}</Button>
                                {luckPerTurn ? <Button disabled>({luckPerTurn})</Button> : <span />}
                            </ButtonGroup>
                        </ListItem>
                    </List>
                </Toggler>
            </ListItem>
        );
    }

    return <ListItem nested />;
}
