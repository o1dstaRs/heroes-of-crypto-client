import { Creature } from "@heroesofcrypto/common/src/generated/protobuf/v1/types_pb";
import { CreatureByLevel } from "@heroesofcrypto/common";

import React, { useState, useCallback, useRef } from "react";
import { Box, Sheet } from "@mui/joy";

import overlayPickImage from "../../../images/overlay_pick.webp";

import { images } from "../../generated/image_imports";
import { usePickBanEvents } from "..";

const UNIT_ID_TO_IMAGE: Record<number, string> = {
    [Creature.ORC]: images.orc_512,
    [Creature.SCAVENGER]: images.scavenger_512,
    [Creature.TROGLODYTE]: images.troglodyte_512,
    [Creature.TROLL]: images.troll_512,
    [Creature.MEDUSA]: images.medusa_512,
    [Creature.BEHOLDER]: images.beholder_512,
    [Creature.GOBLIN_KNIGHT]: images.goblin_knight_512,
    [Creature.EFREET]: images.efreet_512,
    [Creature.BLACK_DRAGON]: images.black_dragon_512,
    [Creature.HYDRA]: images.hydra_512,
    [Creature.CENTAUR]: images.centaur_512,
    [Creature.BERSERKER]: images.berserker_512,
    [Creature.WOLF_RIDER]: images.wolf_rider_512,
    [Creature.HARPY]: images.harpy_512,
    [Creature.NOMAD]: images.nomad_512,
    [Creature.HYENA]: images.hyena_512,
    [Creature.CYCLOPS]: images.cyclops_512,
    [Creature.OGRE_MAGE]: images.ogre_mage_512,
    [Creature.THUNDERBIRD]: images.thunderbird_512,
    [Creature.BEHEMOTH]: images.behemoth_512,
    [Creature.WOLF]: images.wolf_512,
    [Creature.FAIRY]: images.fairy_512,
    [Creature.LEPRECHAUN]: images.leprechaun_512,
    [Creature.ELF]: images.elf_512,
    [Creature.WHITE_TIGER]: images.white_tiger_512,
    [Creature.SATYR]: images.satyr_512,
    [Creature.MANTIS]: images.mantis_512,
    [Creature.UNICORN]: images.unicorn_512,
    [Creature.GARGANTUAN]: images.gargantuan_512,
    [Creature.PEGASUS]: images.pegasus_512,
    [Creature.PEASANT]: images.peasant_512,
    [Creature.SQUIRE]: images.squire_512,
    [Creature.ARBALESTER]: images.arbalester_512,
    [Creature.VALKYRIE]: images.valkyrie_512,
    [Creature.PIKEMAN]: images.pikeman_512,
    [Creature.HEALER]: images.healer_512,
    [Creature.GRIFFIN]: images.griffin_512,
    [Creature.CRUSADER]: images.crusader_512,
    [Creature.TSAR_CANNON]: images.tsar_cannon_512,
    [Creature.ANGEL]: images.angel_512,
};

const UNIT_ID_TO_NAME: Record<number, string> = {
    [Creature.ORC]: "Orc",
    [Creature.SCAVENGER]: "Scavenger",
    [Creature.TROGLODYTE]: "Troglodyte",
    [Creature.TROLL]: "Troll",
    [Creature.MEDUSA]: "Medusa",
    [Creature.BEHOLDER]: "Beholder",
    [Creature.GOBLIN_KNIGHT]: "Goblin Knight",
    [Creature.EFREET]: "Efreet",
    [Creature.BLACK_DRAGON]: "Black Dragon",
    [Creature.HYDRA]: "Hydra",
    [Creature.CENTAUR]: "Centaur",
    [Creature.BERSERKER]: "Berserker",
    [Creature.WOLF_RIDER]: "Wolf Rider",
    [Creature.HARPY]: "Harpy",
    [Creature.NOMAD]: "Nomad",
    [Creature.HYENA]: "Hyena",
    [Creature.CYCLOPS]: "Cyclops",
    [Creature.OGRE_MAGE]: "Ogre Mage",
    [Creature.THUNDERBIRD]: "Thunderbird",
    [Creature.BEHEMOTH]: "Behemoth",
    [Creature.WOLF]: "Wolf",
    [Creature.FAIRY]: "Fairy",
    [Creature.LEPRECHAUN]: "Leprechaun",
    [Creature.ELF]: "Elf",
    [Creature.WHITE_TIGER]: "White Tiger",
    [Creature.SATYR]: "Satyr",
    [Creature.MANTIS]: "Mantis",
    [Creature.UNICORN]: "Unicorn",
    [Creature.GARGANTUAN]: "Gargantuan",
    [Creature.PEGASUS]: "Pegasus",
    [Creature.PEASANT]: "Peasant",
    [Creature.SQUIRE]: "Squire",
    [Creature.ARBALESTER]: "Arbalester",
    [Creature.VALKYRIE]: "Valkyrie",
    [Creature.PIKEMAN]: "Pikeman",
    [Creature.HEALER]: "Healer",
    [Creature.GRIFFIN]: "Griffin",
    [Creature.CRUSADER]: "Crusader",
    [Creature.TSAR_CANNON]: "Tsar Cannon",
    [Creature.ANGEL]: "Angel",
};

interface StainedGlassProps {
    width?: string | number;
    height?: string | number;
}

const StainedGlassWindow: React.FC<StainedGlassProps> = ({ height = window.innerHeight }) => {
    const pickBanContext = usePickBanEvents();

    const width = (height as number) * 0.84; // Reduce width by 10%
    const [hoveredCreature, setHoveredCreature] = useState<number | null>(null);
    const lastHoverTimes = useRef<Record<number, number>>({});

    const handleMouseEnter = useCallback(
        (creatureId: number) => {
            const now = Date.now();
            if (hoveredCreature !== null && hoveredCreature !== creatureId) {
                delete lastHoverTimes.current[hoveredCreature];
            }
            if (lastHoverTimes.current[creatureId] === undefined || now - lastHoverTimes.current[creatureId] >= 1000) {
                setHoveredCreature(creatureId);
                lastHoverTimes.current[creatureId] = now;
            }
        },
        [hoveredCreature],
    );

    const handleMouseLeave = useCallback(() => {
        const now = Date.now();
        if (
            !hoveredCreature ||
            (hoveredCreature &&
                lastHoverTimes.current[hoveredCreature] &&
                now - lastHoverTimes.current[hoveredCreature] >= 1000)
        ) {
            if (hoveredCreature) {
                delete lastHoverTimes.current[hoveredCreature];
            }
            setHoveredCreature(null);
        }
    }, [hoveredCreature]);

    return (
        <div style={{ display: "flex", justifyContent: "center", width: "100%" }}>
            <Box
                sx={{
                    width,
                    height,
                    position: "relative",
                    background: "transparent",
                    paddingLeft: "1.5%",
                    paddingRight: "1.5%",
                    paddingTop: "3.5%",
                    paddingBottom: "2%",
                    borderRadius: "16px",
                    zIndex: 100, // Base level for main container
                }}
            >
                <Sheet
                    sx={{
                        width: "100%",
                        height: "95%", // Cut 5% of the background image on the bottom
                        borderRadius: "50% 50% 0 0",
                        overflow: "visible",
                        position: "relative",
                        display: "flex",
                        paddingRight: "2.6%",
                        paddingLeft: "2.6%",
                        paddingBottom: "1.2%",
                        backgroundImage: `url(${overlayPickImage})`,
                        backgroundSize: "100% 107%", // Adjust the background size accordingly
                        backgroundRepeat: "no-repeat",
                        backgroundPosition: "center",
                        boxShadow: "0 0 50px 25px rgba(255, 223, 186, 0.3)", // Diffused for a softer light effect
                        animation: "gentlePulse 15s infinite alternate", // Changed animation for a gentler effect
                    }}
                >
                    <style>
                        {`
                                        @keyframes gentlePulse {
                                            from {
                                                box-shadow: 0 0 50px 25px rgba(255, 165, 0, 0.3);
                                            }
                                            to {
                                                box-shadow: 0 0 80px 40px rgba(255, 140, 0, 0.15);
                                            }
                                        }
                                    `}
                    </style>
                    {/* Main window sections */}
                    <Box
                        sx={{
                            display: "flex",
                            flexDirection: "column",
                            width: "100%",
                            height: "100%",
                            position: "relative", // Ensuring top-level placement
                            zIndex: 1, // Base level for sections within the main container
                        }}
                    >
                        <Box
                            sx={{
                                flex: 0.35,
                                position: "relative",
                                "&::before": {
                                    content: '""',
                                    position: "absolute",
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    bottom: 0,
                                    // background: "radial-gradient(circle, rgba(0, 0, 0, 0.6), transparent)",
                                },
                            }}
                        >
                            {/* <Box
                                sx={{
                                    position: "absolute",
                                    top: "2%",
                                    left: "50%",
                                    transform: "translateX(-50%)",
                                    color: "#ffffff",
                                    fontWeight: "bold",
                                    fontSize: "1.1rem",
                                }}
                            >
                                Countdown
                            </Box> */}
                        </Box>

                        <Box
                            sx={{
                                flex: 0.4,
                                borderTop: "2px solid transparent",
                                position: "relative",
                                zIndex: 70, // Ensure Level 4 renders above lower levels
                                "&::before": {
                                    content: '""',
                                    position: "absolute",
                                    top: 0,
                                    left: "16%", // Cut 20% from the left
                                    right: "16%", // Cut 20% from the right
                                    bottom: 0,
                                    borderTop: "2px solid #2a2a2a",
                                },
                            }}
                        >
                            <Box
                                sx={{
                                    position: "absolute",
                                    top: "-14%",
                                    left: "50%",
                                    transform: "translateX(-50%)",
                                    color: "#ffffff",
                                    fontWeight: "bold",
                                    fontSize: "1.2rem",
                                    textShadow: "2px 2px 8px #000000",
                                    zIndex: 71, // Ensure Level 4 renders above lower levels
                                }}
                            >
                                Level 4
                            </Box>
                            <Box
                                sx={{
                                    position: "relative",
                                    width: "100%",
                                    height: "100%",
                                    overflow: "visible",
                                }}
                            >
                                <Box
                                    sx={{
                                        display: "flex",
                                        flexDirection: "row",
                                        justifyContent: "space-around",
                                        position: "absolute",
                                        top: "10%",
                                        left: "0%",
                                        width: "100%",
                                        height: "80%",
                                        transform: "rotate(180deg) scaleX(-1)",
                                        overflow: "visible",
                                    }}
                                >
                                    {CreatureByLevel[3].map((creatureId: number, index: number) => (
                                        <Box
                                            key={creatureId}
                                            sx={{
                                                width: "10%",
                                                height: "90%",
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                position: "relative",
                                                zIndex: hoveredCreature === creatureId ? 92 : 72, // Ensure hover z-index above others
                                                transform:
                                                    index % 2 < CreatureByLevel[3].length / 2
                                                        ? "translateY(-15%)"
                                                        : "translateY(25%)",
                                                transition: "transform 0.3s ease, z-index 0.3s ease", // Add z-index transition
                                                filter:
                                                    hoveredCreature === creatureId
                                                        ? "drop-shadow(0px -40px 25px rgba(255, 255, 255, 0.9))"
                                                        : "drop-shadow(0px 0px 0px rgba(0,0,0,0))", // Shadow on hover
                                                left:
                                                    index === 0
                                                        ? "7%"
                                                        : index === CreatureByLevel[3].length - 1
                                                          ? "-7%"
                                                          : index === 1
                                                            ? "5%"
                                                            : index === 2
                                                              ? "2.5%"
                                                              : index === CreatureByLevel[3].length - 3
                                                                ? "-2%"
                                                                : index === CreatureByLevel[3].length - 2
                                                                  ? "-4.5%"
                                                                  : 0, // Adjust left position
                                                borderRadius: hoveredCreature === creatureId ? "50%" : "none", // Border on hover
                                                "&:hover": {
                                                    transform:
                                                        hoveredCreature === creatureId
                                                            ? `scale(1.2) translateY(25%)`
                                                            : "scale(1)",
                                                    pointerEvents: hoveredCreature !== creatureId ? "none" : "auto",
                                                },
                                                // Hover styles for name
                                                "& .unit-name": {
                                                    visibility: hoveredCreature === creatureId ? "visible" : "hidden",
                                                    opacity: hoveredCreature === creatureId ? 1 : 0,
                                                    zIndex: hoveredCreature === creatureId ? 102 : 82, // Ensure name appears above everything
                                                },
                                            }}
                                            onMouseEnter={() => handleMouseEnter(creatureId)}
                                            onMouseLeave={handleMouseLeave}
                                        >
                                            <img
                                                src={UNIT_ID_TO_IMAGE[creatureId]}
                                                alt={`Creature ${creatureId}`}
                                                style={{
                                                    width: "100%",
                                                    height: "100%",
                                                    objectFit: "contain",
                                                    borderRadius: "50%",
                                                    transition: "filter 0.3s ease",
                                                    filter: pickBanContext.banned.includes(creatureId)
                                                        ? "grayscale(100%)"
                                                        : "none", // Make image black and white if banned
                                                }}
                                            />
                                            {/* Draw x mark if banned */}
                                            {pickBanContext.banned.includes(creatureId) && (
                                                <img
                                                    src={images.x_mark_512}
                                                    alt="X mark"
                                                    style={{
                                                        position: "absolute",
                                                        width: "50%",
                                                        height: "50%",
                                                        top: "50%",
                                                        left: "50%",
                                                        transform: "translate(-50%, -50%)",
                                                    }}
                                                />
                                            )}
                                            <Box
                                                className="unit-name"
                                                sx={{
                                                    position: "absolute",
                                                    bottom: "120%",
                                                    left: "50%",
                                                    backgroundColor: "rgba(255,255,255,0.8)",
                                                    padding: "5px",
                                                    borderRadius: "5px",
                                                    color: "black",
                                                    fontWeight: "bold",
                                                    fontSize: "0.9rem",
                                                    transform: "translate(-50%, 50%) rotate(180deg) scaleX(-1)",
                                                    whiteSpace: "nowrap",
                                                    pointerEvents: "none",
                                                    zIndex: 73,
                                                }}
                                            >
                                                {UNIT_ID_TO_NAME[creatureId]}
                                            </Box>
                                        </Box>
                                    ))}
                                </Box>
                            </Box>
                        </Box>

                        <Box
                            sx={{
                                flex: 0.4,
                                // borderBottom: "2px solid #2a2a2a",
                                // borderTop: "2px solid #2a2a2a",
                                position: "relative",
                                borderTopLeftRadius: "100%",
                                borderTopRightRadius: "100%",
                                zIndex: 60, // Ensure Level 3 below Level 4
                                "&::before": {
                                    content: '""',
                                    position: "absolute",
                                    top: "-182%",
                                    left: 5, // Gradient starts from the left
                                    right: "50%", // Gradient ends at the right
                                    bottom: 0, // Extend to the bottom for a full half circle
                                    background:
                                        "linear-gradient(to right, rgba(0, 0, 0, 1), rgba(0, 0, 0, 0.8), transparent)",
                                    borderTopLeftRadius: "200%", // Half-circle cut on the top left
                                    pointerEvents: "none", // Make the overlay non-interactive
                                    zIndex: -1,
                                },
                                "&::after": {
                                    content: '""',
                                    position: "absolute",
                                    top: "-180%",
                                    left: "50%", // Gradient starts from the left
                                    right: 5, // Gradient ends at the right
                                    bottom: 0, // Extend to the bottom for a full half circle
                                    background:
                                        "linear-gradient(to left, rgba(0, 0, 0, 1), rgba(0, 0, 0, 0.8), transparent)",
                                    borderTopRightRadius: "200%", // Half-circle cut on the top left
                                    pointerEvents: "none", // Make the overlay non-interactive
                                    zIndex: -1,
                                },
                            }}
                        >
                            <Box
                                sx={{
                                    position: "absolute",
                                    top: "-14%",
                                    left: "50%",
                                    transform: "translateX(-50%)",
                                    color: "#ffffff",
                                    fontWeight: "bold",
                                    fontSize: "1.2rem",
                                    textShadow: "2px 2px 8px #000000",
                                    zIndex: 61, // Ensure Level 3 below Level 4
                                }}
                            >
                                Level 3
                            </Box>
                            <Box
                                sx={{
                                    position: "relative",
                                    width: "100%",
                                    height: "100%",
                                    overflow: "visible",
                                }}
                            >
                                <Box
                                    sx={{
                                        display: "flex",
                                        flexDirection: "row",
                                        justifyContent: "space-around",
                                        position: "absolute",
                                        top: "10%",
                                        left: "0%",
                                        width: "100%",
                                        height: "80%",
                                        transform: "rotate(180deg) scaleX(-1)",
                                        overflow: "visible",
                                    }}
                                >
                                    {CreatureByLevel[2].map((creatureId: number, index: number) => (
                                        <Box
                                            key={creatureId}
                                            sx={{
                                                width: "10%",
                                                height: "90%",
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                position: "relative",
                                                zIndex: hoveredCreature === creatureId ? 91 : 61, // Ensure hover z-index above others
                                                transform: index % 2 === 0 ? "translateY(25%)" : "translateY(-25%)",
                                                transition: "transform 0.3s ease, z-index 0.3s ease", // Add z-index transition
                                                filter:
                                                    hoveredCreature === creatureId
                                                        ? "drop-shadow(0px -40px 25px rgba(255, 255, 255, 0.9))"
                                                        : "drop-shadow(0px 0px 0px rgba(0,0,0,0))", // Shadow on hover
                                                cursor: "pointer",
                                                left:
                                                    index === 0
                                                        ? "2.5%"
                                                        : index === CreatureByLevel[2].length - 1
                                                          ? "-2.5"
                                                          : 0, // Adjust left position
                                                borderRadius: hoveredCreature === creatureId ? "50%" : "none", // Border on hover
                                                "&:hover": {
                                                    transform: `scale(1.2) ${
                                                        index % 2 === 0 ? "translateY(25%)" : "translateY(-25%)"
                                                    }`,
                                                },
                                                // Hover styles for name
                                                "& .unit-name": {
                                                    visibility: hoveredCreature === creatureId ? "visible" : "hidden",
                                                    opacity: hoveredCreature === creatureId ? 1 : 0,
                                                    zIndex: hoveredCreature === creatureId ? 101 : 71, // Ensure name appears above everything
                                                },
                                            }}
                                            onMouseEnter={() => handleMouseEnter(creatureId)}
                                            onMouseLeave={handleMouseLeave}
                                        >
                                            <img
                                                src={UNIT_ID_TO_IMAGE[creatureId]}
                                                alt={`Creature ${creatureId}`}
                                                style={{
                                                    width: "100%",
                                                    height: "100%",
                                                    objectFit: "contain",
                                                    borderRadius: "50%",
                                                    transition: "filter 0.3s ease",
                                                    filter: pickBanContext.banned.includes(creatureId)
                                                        ? "grayscale(100%)"
                                                        : "none", // Make image black and white if banned
                                                    zIndex: 62,
                                                }}
                                            />
                                            {/* Draw x mark if banned */}
                                            {pickBanContext.banned.includes(creatureId) && (
                                                <img
                                                    src={images.x_mark_512}
                                                    alt="X mark"
                                                    style={{
                                                        position: "absolute",
                                                        width: "50%",
                                                        height: "50%",
                                                        top: "50%",
                                                        left: "50%",
                                                        transform: "translate(-50%, -50%)",
                                                        zIndex: 65,
                                                    }}
                                                />
                                            )}
                                            <Box
                                                className="unit-name"
                                                sx={{
                                                    position: "absolute",
                                                    bottom: "120%",
                                                    left: "50%",
                                                    backgroundColor: "rgba(255,255,255,0.8)",
                                                    padding: "5px",
                                                    borderRadius: "5px",
                                                    color: "black",
                                                    fontWeight: "bold",
                                                    fontSize: "0.9rem",
                                                    transform: "translate(-50%, 50%) rotate(180deg) scaleX(-1)",
                                                    whiteSpace: "nowrap",
                                                    pointerEvents: "none",
                                                    zIndex: 64,
                                                }}
                                            >
                                                {UNIT_ID_TO_NAME[creatureId]}
                                            </Box>
                                        </Box>
                                    ))}
                                </Box>
                            </Box>
                        </Box>

                        <Box
                            sx={{
                                flex: 0.4,
                                // borderBottom: "2px solid #2a2a2a",
                                position: "relative",
                                zIndex: 50, // Ensure Level 2 below Level 3
                                "&::before": {
                                    content: '""',
                                    position: "absolute",
                                    top: 0,
                                    left: "50%",
                                    right: 0,
                                    bottom: 0,
                                    background:
                                        "linear-gradient(to left, rgba(0, 0, 0, 1), rgba(0, 0, 0, 0.8), transparent)",
                                    pointerEvents: "none", // Make the overlay non-interactive
                                    zIndex: -1,
                                },
                                "&::after": {
                                    content: '""',
                                    position: "absolute",
                                    top: 0,
                                    right: "50%",
                                    bottom: 0,
                                    left: 0,
                                    background:
                                        "linear-gradient(to right, rgba(0, 0, 0, 1), rgba(0, 0, 0, 0.8), transparent)",
                                    pointerEvents: "none", // Make the overlay non-interactive
                                    zIndex: -1,
                                },
                            }}
                        >
                            <Box
                                sx={{
                                    position: "absolute",
                                    top: "-14%",
                                    left: "50%",
                                    transform: "translateX(-50%)",
                                    color: "#ffffff",
                                    fontWeight: "bold",
                                    fontSize: "1.2rem",
                                    textShadow: "2px 2px 8px #000000",
                                    zIndex: 99, // Ensure Level 2 below Level 3
                                }}
                            >
                                Level 2
                            </Box>
                            <Box
                                sx={{
                                    position: "relative",
                                    width: "100%",
                                    height: "100%",
                                    overflow: "visible",
                                }}
                            >
                                <Box
                                    sx={{
                                        display: "flex",
                                        flexDirection: "row",
                                        justifyContent: "space-around",
                                        position: "absolute",
                                        top: "10%",
                                        left: "0%",
                                        width: "100%",
                                        height: "80%",
                                        transform: "rotate(180deg) scaleX(-1)",
                                        overflow: "visible",
                                    }}
                                >
                                    {CreatureByLevel[1].map((creatureId: number, index: number) => (
                                        <Box
                                            key={creatureId}
                                            sx={{
                                                width: "30%",
                                                height: "100%",
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                position: "relative",
                                                zIndex: hoveredCreature === creatureId ? 90 : 50, // Ensure hover z-index above others
                                                transform: index % 2 === 0 ? "translateY(-25%)" : "translateY(25%)",
                                                transition: "transform 0.3s ease, z-index 0.3s ease", // Add z-index transition
                                                filter:
                                                    hoveredCreature === creatureId
                                                        ? "drop-shadow(0px -40px 25px rgba(255, 255, 255, 0.9))"
                                                        : "drop-shadow(0px 0px 0px rgba(0,0,0,0))", // Shadow on hover
                                                cursor: "pointer",
                                                borderRadius: hoveredCreature === creatureId ? "50%" : "none", // Border on hover
                                                "&:hover": {
                                                    transform: `scale(1.2) ${
                                                        index % 2 === 0 ? "translateY(-25%)" : "translateY(15%)"
                                                    }`,
                                                },
                                                // Hover styles for name
                                                "& .unit-name": {
                                                    visibility: hoveredCreature === creatureId ? "visible" : "hidden",
                                                    opacity: hoveredCreature === creatureId ? 1 : 0,
                                                    zIndex: hoveredCreature === creatureId ? 100 : 51, // Ensure name appears above everything
                                                },
                                            }}
                                            onMouseEnter={() => handleMouseEnter(creatureId)}
                                            onMouseLeave={handleMouseLeave}
                                        >
                                            <img
                                                src={UNIT_ID_TO_IMAGE[creatureId]}
                                                alt={`Creature ${creatureId}`}
                                                style={{
                                                    width: "100%",
                                                    height: "100%",
                                                    objectFit: "contain",
                                                    borderRadius: "50%",
                                                    transition: "filter 0.3s ease",
                                                    filter: pickBanContext.banned.includes(creatureId)
                                                        ? "grayscale(100%)"
                                                        : "none", // Make image black and white if banned
                                                }}
                                            />
                                            {/* Draw x mark if banned */}
                                            {pickBanContext.banned.includes(creatureId) && (
                                                <img
                                                    src={images.x_mark_512}
                                                    alt="X mark"
                                                    style={{
                                                        position: "absolute",
                                                        width: "50%",
                                                        height: "50%",
                                                        top: "50%",
                                                        left: "50%",
                                                        transform: "translate(-50%, -50%)",
                                                    }}
                                                />
                                            )}
                                            <Box
                                                className="unit-name"
                                                sx={{
                                                    position: "absolute",
                                                    bottom: "100%",
                                                    left: "50%",
                                                    backgroundColor: "rgba(255,255,255,0.8)",
                                                    padding: "5px",
                                                    borderRadius: "5px",
                                                    color: "black",
                                                    fontWeight: "bold",
                                                    fontSize: "0.9rem",
                                                    transform: "translate(-50%, 50%) rotate(180deg) scaleX(-1)",
                                                    whiteSpace: "nowrap",
                                                    pointerEvents: "none",
                                                }}
                                            >
                                                {UNIT_ID_TO_NAME[creatureId]}
                                            </Box>
                                        </Box>
                                    ))}
                                </Box>
                            </Box>
                        </Box>

                        <Box
                            sx={{
                                flex: 0.4,
                                position: "relative",
                                zIndex: 40, // Ensure Level 1 at lowest z-index
                                "&::before": {
                                    content: '""',
                                    position: "absolute",
                                    top: 0,
                                    left: "50%",
                                    right: 0,
                                    bottom: 0,
                                    background:
                                        "linear-gradient(to left, rgba(0, 0, 0, 1), rgba(0, 0, 0, 0.8), transparent)",
                                    pointerEvents: "none", // Make the overlay non-interactive
                                    zIndex: -1,
                                },
                                "&::after": {
                                    content: '""',
                                    position: "absolute",
                                    top: 0,
                                    right: "50%",
                                    bottom: 0,
                                    left: 0,
                                    background:
                                        "linear-gradient(to right, rgba(0, 0, 0, 1), rgba(0, 0, 0, 0.8), transparent)",
                                    pointerEvents: "none", // Make the overlay non-interactive
                                    zIndex: -1,
                                },
                            }}
                        >
                            <Box
                                sx={{
                                    position: "absolute",
                                    top: "-14%",
                                    left: "50%",
                                    transform: "translateX(-50%)",
                                    color: "#ffffff",
                                    fontWeight: "bold",
                                    fontSize: "1.2rem",
                                    textShadow: "2px 2px 8px #000000",
                                    zIndex: 41, // Ensure Level 1 at lowest z-index
                                }}
                            >
                                Level 1
                            </Box>
                            <Box
                                sx={{
                                    position: "relative",
                                    width: "100%",
                                    height: "100%",
                                    overflow: "visible",
                                }}
                            >
                                <Box
                                    sx={{
                                        display: "flex",
                                        flexDirection: "row",
                                        justifyContent: "space-around",
                                        position: "absolute",
                                        top: "10%",
                                        left: "0%",
                                        width: "100%",
                                        height: "80%",
                                        transform: "rotate(180deg) scaleX(-1)",
                                        overflow: "visible",
                                    }}
                                >
                                    {CreatureByLevel[0].map((creatureId: number, index: number) => (
                                        <Box
                                            key={creatureId}
                                            sx={{
                                                width: "30%",
                                                height: "100%",
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                position: "relative",
                                                zIndex: hoveredCreature === creatureId ? 89 : 40, // Ensure hover z-index above others
                                                transform: index % 2 === 0 ? "translateY(25%)" : "translateY(-25%)",
                                                transition: "transform 0.3s ease, z-index 0.3s ease", // Add z-index transition
                                                filter:
                                                    hoveredCreature === creatureId
                                                        ? "drop-shadow(0px -40px 25px rgba(255, 255, 255, 0.9))"
                                                        : "drop-shadow(0px 0px 0px rgba(0,0,0,0))", // Shadow on hover
                                                cursor: "pointer",
                                                borderRadius: hoveredCreature === creatureId ? "50%" : "none", // Border on hover
                                                "&:hover": {
                                                    transform: `scale(1.2) ${
                                                        index % 2 === 0 ? "translateY(15%)" : "translateY(-25%)"
                                                    }`,
                                                },
                                                // Hover styles for name
                                                "& .unit-name": {
                                                    visibility: hoveredCreature === creatureId ? "visible" : "hidden",
                                                    opacity: hoveredCreature === creatureId ? 1 : 0,
                                                    zIndex: hoveredCreature === creatureId ? 99 : 41, // Ensure name appears above everything
                                                },
                                            }}
                                            onMouseEnter={() => handleMouseEnter(creatureId)}
                                            onMouseLeave={handleMouseLeave}
                                        >
                                            <img
                                                src={UNIT_ID_TO_IMAGE[creatureId]}
                                                alt={`Creature ${creatureId}`}
                                                style={{
                                                    width: "100%",
                                                    height: "100%",
                                                    objectFit: "contain",
                                                    borderRadius: "50%",
                                                    transition: "filter 0.3s ease",
                                                    filter: pickBanContext.banned.includes(creatureId)
                                                        ? "grayscale(100%)"
                                                        : "none", // Make image black and white if banned
                                                }}
                                            />
                                            {/* Draw x mark if banned */}
                                            {pickBanContext.banned.includes(creatureId) && (
                                                <img
                                                    src={images.x_mark_512}
                                                    alt="X mark"
                                                    style={{
                                                        position: "absolute",
                                                        width: "50%",
                                                        height: "50%",
                                                        top: "50%",
                                                        left: "50%",
                                                        transform: "translate(-50%, -50%)",
                                                    }}
                                                />
                                            )}
                                            <Box
                                                className="unit-name"
                                                sx={{
                                                    position: "absolute",
                                                    bottom: "100%",
                                                    left: "50%",
                                                    backgroundColor: "rgba(255,255,255,0.8)",
                                                    padding: "5px",
                                                    borderRadius: "5px",
                                                    color: "black",
                                                    fontWeight: "bold",
                                                    fontSize: "0.9rem",
                                                    transform: "translate(-50%, 50%) rotate(180deg) scaleX(-1)",
                                                    whiteSpace: "nowrap",
                                                    pointerEvents: "none",
                                                }}
                                            >
                                                {UNIT_ID_TO_NAME[creatureId]}
                                            </Box>
                                        </Box>
                                    ))}
                                </Box>
                            </Box>
                        </Box>

                        {/* Augments */}
                        <Box
                            sx={{
                                flex: 0.4,
                                display: "flex",
                                flexDirection: "row",
                                borderTop: "4px solid #2a2a2a",
                                borderBottom: "4px solid #2a2a2a",
                                position: "relative",
                            }}
                        >
                            <Box
                                sx={{
                                    flex: 0.5,
                                    position: "relative",
                                    "&::before": {
                                        content: '""',
                                        position: "absolute",
                                        top: "0%",
                                        left: "0%",
                                        right: "0%",
                                        bottom: "0%",
                                        background: "linear-gradient(to right, rgba(0, 0, 0, 1), transparent)",
                                    },
                                }}
                            >
                                <Box
                                    sx={{
                                        position: "absolute",
                                        top: "0%",
                                        left: "50%",
                                        transform: "translateX(-50%)",
                                        color: "#ffffff",
                                        fontWeight: "bold",
                                        fontSize: "1.5rem",
                                    }}
                                >
                                    You
                                </Box>
                            </Box>
                            <Box
                                sx={{
                                    flex: 0.5,
                                    position: "relative",
                                    "&::before": {
                                        content: '""',
                                        position: "absolute",
                                        top: "0%",
                                        left: "0%",
                                        right: "0%",
                                        bottom: "0%",
                                        background: "linear-gradient(to left, rgba(0, 0, 0, 1), transparent)",
                                    },
                                }}
                            >
                                <Box
                                    sx={{
                                        position: "absolute",
                                        top: "0%",
                                        left: "50%",
                                        transform: "translateX(-50%)",
                                        color: "#ffffff",
                                        fontWeight: "bold",
                                        fontSize: "1.5rem",
                                    }}
                                >
                                    Opponent
                                </Box>
                            </Box>
                        </Box>

                        <Box
                            sx={{
                                flex: 0.4,
                                display: "flex",
                                flexDirection: "row",
                                // borderBottom: "4px solid #2a2a2a",
                                position: "relative",
                            }}
                        >
                            <Box
                                sx={{
                                    flex: 0.5,
                                    position: "relative",
                                    "&::before": {
                                        content: '""',
                                        position: "absolute",
                                        top: "0%",
                                        left: "0%",
                                        right: "0%",
                                        bottom: "0%",
                                        background: "linear-gradient(to right, rgba(0, 0, 0, 1), transparent)",
                                    },
                                }}
                            />
                            <Box
                                sx={{
                                    flex: 0.5,
                                    position: "relative",
                                    "&::before": {
                                        content: '""',
                                        position: "absolute",
                                        top: "0%",
                                        left: "0%",
                                        right: "0%",
                                        bottom: "0%",
                                        background: "linear-gradient(to left, rgba(0, 0, 0, 1), transparent)",
                                    },
                                }}
                            />
                        </Box>
                    </Box>
                </Sheet>
            </Box>
        </div>
    );
};

export default StainedGlassWindow;
