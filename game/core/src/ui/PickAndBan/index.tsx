import { CreatureByLevel } from "@heroesofcrypto/common";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { Box, Sheet } from "@mui/joy";

import overlayPickImage from "../../../images/overlay_pick.webp";

import { images } from "../../generated/image_imports";
import { usePickBanEvents } from "..";
import { PickPhase } from "@heroesofcrypto/common/src/generated/protobuf/v1/types_pb";
import { UNIT_ID_TO_IMAGE, UNIT_ID_TO_NAME } from "../unit_ui_constants";
import { InitialCreatureImageBox } from "./InitialCreatureImageBox";

interface StainedGlassProps {
    width?: string | number;
    height?: string | number;
}

const StainedGlassWindow: React.FC<StainedGlassProps> = ({ height = window.innerHeight }) => {
    const pickBanContext = usePickBanEvents();

    const width = (height as number) * 0.84; // Reduce width by 10%
    const [hoveredCreature, setHoveredCreature] = useState<number | null>(null);
    const [selectedCreature, setSelectedCreature] = useState<number | null>(null);
    const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    let isInitialPick = pickBanContext.pickPhase === PickPhase.INITIAL_PICK;
    let initialCreaturesPairs: [number, number][] = [];
    const initialCreatures: number[] = [];
    if (isInitialPick && pickBanContext.initialCreaturesPairs?.length === 2) {
        initialCreaturesPairs = pickBanContext.initialCreaturesPairs;
        for (const pair of initialCreaturesPairs) {
            if (pair?.length === 2) {
                initialCreatures.push(pair[0]);
                initialCreatures.push(pair[1]);
            }
        }
    }

    console.log("initialCreaturesPairs");
    console.log(initialCreaturesPairs);
    console.log("initialCreatures");
    console.log(initialCreatures);

    const handleMouseEnter = useCallback(
        (creatureId: number) => {
            if (hoverTimeoutRef.current) {
                clearTimeout(hoverTimeoutRef.current);
            }

            if (hoveredCreature !== creatureId && selectedCreature !== creatureId) {
                setHoveredCreature(creatureId);
            }
        },
        [hoveredCreature, selectedCreature],
    );

    const handleMouseLeave = useCallback(() => {
        if (hoverTimeoutRef.current) {
            clearTimeout(hoverTimeoutRef.current);
        }

        hoverTimeoutRef.current = setTimeout(() => {
            setHoveredCreature(null);
        }, 100); // Small delay to prevent flickering
    }, []);

    const handleCreatureClick = (creatureId: number) => {
        if (!pickBanContext.banned.includes(creatureId)) {
            setSelectedCreature(creatureId);
        }
    };

    // Effect for handling click outside or 'ESC' key for deselection
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (selectedCreature !== null) {
                const target = event.target as HTMLElement;
                if (!target.closest(".creature-image")) {
                    setSelectedCreature(null);
                }
            }
        };

        const handleEscKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setSelectedCreature(null);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("keydown", handleEscKey);

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("keydown", handleEscKey);
        };
    }, [selectedCreature]);

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
                                },
                            }}
                        ></Box>

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
                                            className="creature-image"
                                            sx={{
                                                width: "10%",
                                                height: "90%",
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                position: "relative",
                                                zIndex:
                                                    selectedCreature === creatureId || hoveredCreature === creatureId
                                                        ? 92
                                                        : 72, // Ensure hover z-index above others
                                                transform:
                                                    index % 2 < CreatureByLevel[3].length / 2
                                                        ? "translateY(-15%)"
                                                        : "translateY(25%)",
                                                transition: "all 0.3s ease", // Updated to include all transitions
                                                filter:
                                                    selectedCreature === creatureId || hoveredCreature === creatureId
                                                        ? pickBanContext.banned.includes(creatureId)
                                                            ? "drop-shadow(0px -40px 25px rgba(255, 0, 0, 1))"
                                                            : "drop-shadow(0px -40px 25px rgba(255, 255, 255, 0.9))"
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
                                                borderRadius:
                                                    selectedCreature === creatureId || hoveredCreature === creatureId
                                                        ? "50%"
                                                        : "none", // Border on hover
                                                cursor: "pointer",
                                                // Hover styles for name
                                                "& .unit-name": {
                                                    visibility:
                                                        selectedCreature === creatureId ||
                                                        hoveredCreature === creatureId
                                                            ? "visible"
                                                            : "hidden",
                                                    opacity:
                                                        selectedCreature === creatureId ||
                                                        hoveredCreature === creatureId
                                                            ? 1
                                                            : 0,
                                                    transition: "opacity 0.3s ease, visibility 0.2s ease",
                                                    zIndex:
                                                        selectedCreature === creatureId ||
                                                        hoveredCreature === creatureId
                                                            ? 102
                                                            : 82, // Ensure name appears above everything
                                                },
                                            }}
                                            onMouseEnter={() => {
                                                if (hoverTimeoutRef.current) {
                                                    clearTimeout(hoverTimeoutRef.current);
                                                }
                                                handleMouseEnter(creatureId);
                                            }}
                                            onMouseLeave={handleMouseLeave}
                                            onClick={() => handleCreatureClick(creatureId)}
                                        >
                                            <div style={{ position: "relative", width: "100%", height: "100%" }}>
                                                <img
                                                    src={UNIT_ID_TO_IMAGE[creatureId]}
                                                    alt={`Creature ${creatureId}`}
                                                    style={{
                                                        width: "100%",
                                                        height: "100%",
                                                        objectFit: "contain",
                                                        borderRadius: "50%",
                                                        transition: "filter 0.3s ease, transform 0.3s ease",
                                                        filter: pickBanContext.banned.includes(creatureId)
                                                            ? "grayscale(100%)"
                                                            : "none",
                                                        transform:
                                                            selectedCreature === creatureId ||
                                                            hoveredCreature === creatureId
                                                                ? "scale(1.2) translateY(25%)"
                                                                : "scale(1)",
                                                    }}
                                                />
                                                {/* Draw x mark if banned */}
                                                {pickBanContext.banned.includes(creatureId) && (
                                                    <img
                                                        src={images.x_mark_1_512}
                                                        alt="X mark"
                                                        style={{
                                                            position: "absolute",
                                                            width: "100%",
                                                            height: "100%",
                                                            top: "0",
                                                            left: "0",
                                                            objectFit: "contain",
                                                            transform:
                                                                selectedCreature === creatureId ||
                                                                hoveredCreature === creatureId
                                                                    ? "scale(1.2) translateY(25%)"
                                                                    : "scale(1)",
                                                            transition: "transform 0.2s ease-out",
                                                        }}
                                                    />
                                                )}
                                            </div>
                                            <Box
                                                className="unit-name"
                                                sx={{
                                                    position: "absolute",
                                                    bottom: "100%",
                                                    left: "50%",
                                                    backgroundColor: pickBanContext.banned.includes(creatureId)
                                                        ? "rgba(0,0,0,0.8)"
                                                        : "rgba(255,255,255,0.8)",
                                                    padding: "5px",
                                                    borderRadius: "5px",
                                                    color: pickBanContext.banned.includes(creatureId)
                                                        ? "white"
                                                        : "black",
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
                                                zIndex:
                                                    selectedCreature === creatureId || hoveredCreature === creatureId
                                                        ? 91
                                                        : 62, // Ensure hover z-index above others
                                                transform: index % 2 === 0 ? "translateY(-25%)" : "translateY(25%)",
                                                transition: "all 0.3s ease", // Updated to include all transitions
                                                filter:
                                                    selectedCreature === creatureId || hoveredCreature === creatureId
                                                        ? pickBanContext.banned.includes(creatureId)
                                                            ? "drop-shadow(0px -40px 25px rgba(255, 0, 0, 1))"
                                                            : "drop-shadow(0px -40px 25px rgba(255, 255, 255, 0.9))"
                                                        : "drop-shadow(0px 0px 0px rgba(0,0,0,0))", // Shadow on hover
                                                left: index === CreatureByLevel[2].length - 1 ? "-2%" : 0, // Adjust left position
                                                top: index === CreatureByLevel[2].length / 2 ? "12.5%" : 0, // Adjust left position
                                                borderRadius:
                                                    selectedCreature === creatureId || hoveredCreature === creatureId
                                                        ? "50%"
                                                        : "none", // Border on hover
                                                cursor: "pointer",
                                                // Hover styles for name
                                                "& .unit-name": {
                                                    visibility:
                                                        selectedCreature === creatureId ||
                                                        hoveredCreature === creatureId
                                                            ? "visible"
                                                            : "hidden",
                                                    opacity:
                                                        selectedCreature === creatureId ||
                                                        hoveredCreature === creatureId
                                                            ? 1
                                                            : 0,
                                                    transition: "opacity 0.3s ease, visibility 0.2s ease",
                                                    zIndex:
                                                        selectedCreature === creatureId ||
                                                        hoveredCreature === creatureId
                                                            ? 101
                                                            : 62, // Ensure name appears above everything
                                                },
                                            }}
                                            onMouseEnter={() => {
                                                if (hoverTimeoutRef.current) {
                                                    clearTimeout(hoverTimeoutRef.current);
                                                }
                                                handleMouseEnter(creatureId);
                                            }}
                                            onMouseLeave={handleMouseLeave}
                                            onClick={() => handleCreatureClick(creatureId)}
                                        >
                                            <div style={{ position: "relative", width: "100%", height: "100%" }}>
                                                <img
                                                    src={UNIT_ID_TO_IMAGE[creatureId]}
                                                    alt={`Creature ${creatureId}`}
                                                    style={{
                                                        width: "100%",
                                                        height: "100%",
                                                        objectFit: "contain",
                                                        borderRadius: "50%",
                                                        transition: "filter 0.3s ease, transform 0.3s ease",
                                                        filter: pickBanContext.banned.includes(creatureId)
                                                            ? "grayscale(100%)"
                                                            : "none",
                                                        transform:
                                                            selectedCreature === creatureId ||
                                                            hoveredCreature === creatureId
                                                                ? `scale(1.2) translateY(${index % 2 !== 0 ? "-10%" : "25%"})`
                                                                : "scale(1)",
                                                    }}
                                                />
                                                {/* Draw x mark if banned */}
                                                {pickBanContext.banned.includes(creatureId) && (
                                                    <img
                                                        src={images.x_mark_1_512}
                                                        alt="X mark"
                                                        style={{
                                                            position: "absolute",
                                                            width: "100%",
                                                            height: "100%",
                                                            top: "0",
                                                            left: "0",
                                                            objectFit: "contain",
                                                            transform:
                                                                selectedCreature === creatureId ||
                                                                hoveredCreature === creatureId
                                                                    ? `scale(1.2) translateY(${index % 2 !== 0 ? "-10%" : "25%"})`
                                                                    : "scale(1)",
                                                            transition: "transform 0.2s ease-out",
                                                        }}
                                                    />
                                                )}
                                            </div>
                                            <Box
                                                className="unit-name"
                                                sx={{
                                                    position: "absolute",
                                                    bottom: index % 2 !== 0 ? "145%" : "100%",
                                                    left: "50%",
                                                    backgroundColor: pickBanContext.banned.includes(creatureId)
                                                        ? "rgba(0,0,0,0.8)"
                                                        : "rgba(255,255,255,0.8)",
                                                    padding: "5px",
                                                    borderRadius: "5px",
                                                    color: pickBanContext.banned.includes(creatureId)
                                                        ? "white"
                                                        : "black",
                                                    fontWeight: "bold",
                                                    fontSize: "0.9rem",
                                                    transform: "translate(-50%, 50%) rotate(180deg) scaleX(-1)",
                                                    whiteSpace: "nowrap",
                                                    pointerEvents: "none",
                                                    zIndex: 63,
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
                                                width: "10%",
                                                height: "90%",
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                position: "relative",
                                                zIndex:
                                                    selectedCreature === creatureId || hoveredCreature === creatureId
                                                        ? 91
                                                        : 62, // Ensure hover z-index above others
                                                transform: index % 2 === 0 ? "translateY(-25%)" : "translateY(25%)",
                                                transition: "all 0.3s ease", // Updated to include all transitions
                                                filter:
                                                    selectedCreature === creatureId || hoveredCreature === creatureId
                                                        ? pickBanContext.banned.includes(creatureId)
                                                            ? "drop-shadow(0px -40px 25px rgba(255, 0, 0, 1))"
                                                            : "drop-shadow(0px -40px 25px rgba(255, 255, 255, 0.9))"
                                                        : "drop-shadow(0px 0px 0px rgba(0,0,0,0))", // Shadow on hover
                                                top: index === CreatureByLevel[1].length / 2 ? "12.5%" : 0, // Adjust left position
                                                borderRadius:
                                                    selectedCreature === creatureId || hoveredCreature === creatureId
                                                        ? "50%"
                                                        : "none", // Border on hover
                                                cursor: "pointer",
                                                // Hover styles for name
                                                "& .unit-name": {
                                                    visibility:
                                                        selectedCreature === creatureId ||
                                                        hoveredCreature === creatureId
                                                            ? "visible"
                                                            : "hidden",
                                                    opacity:
                                                        selectedCreature === creatureId ||
                                                        hoveredCreature === creatureId
                                                            ? 1
                                                            : 0,
                                                    transition: "opacity 0.3s ease, visibility 0.2s ease",
                                                    zIndex:
                                                        selectedCreature === creatureId ||
                                                        hoveredCreature === creatureId
                                                            ? 101
                                                            : 62, // Ensure name appears above everything
                                                },
                                            }}
                                            onMouseEnter={() => {
                                                if (hoverTimeoutRef.current) {
                                                    clearTimeout(hoverTimeoutRef.current);
                                                }
                                                handleMouseEnter(creatureId);
                                            }}
                                            onMouseLeave={handleMouseLeave}
                                            onClick={() => handleCreatureClick(creatureId)}
                                        >
                                            <div style={{ position: "relative", width: "100%", height: "100%" }}>
                                                {!initialCreatures.includes(creatureId) && (
                                                    <img
                                                        src={UNIT_ID_TO_IMAGE[creatureId]}
                                                        alt={`Creature ${creatureId}`}
                                                        style={{
                                                            width: "100%",
                                                            height: "100%",
                                                            objectFit: "contain",
                                                            borderRadius: "50%",
                                                            transition: "filter 0.3s ease, transform 0.3s ease",
                                                            filter: pickBanContext.banned.includes(creatureId)
                                                                ? "grayscale(100%)"
                                                                : "none",
                                                            transform:
                                                                selectedCreature === creatureId ||
                                                                hoveredCreature === creatureId
                                                                    ? `scale(1.2) translateY(${index % 2 !== 0 ? "-10%" : "25%"})`
                                                                    : "scale(1)",
                                                        }}
                                                    />
                                                )}
                                                {/* Draw x mark if banned */}
                                                {pickBanContext.banned.includes(creatureId) && (
                                                    <img
                                                        src={images.x_mark_1_512}
                                                        alt="X mark"
                                                        style={{
                                                            position: "absolute",
                                                            width: "100%",
                                                            height: "100%",
                                                            top: "0",
                                                            left: "0",
                                                            objectFit: "contain",
                                                            transform:
                                                                selectedCreature === creatureId ||
                                                                hoveredCreature === creatureId
                                                                    ? `scale(1.2) translateY(${index % 2 !== 0 ? "-10%" : "25%"})`
                                                                    : "scale(1)",
                                                            transition: "transform 0.2s ease-out",
                                                        }}
                                                    />
                                                )}
                                            </div>
                                            {!initialCreatures.includes(creatureId) && (
                                                <Box
                                                    className="unit-name"
                                                    sx={{
                                                        position: "absolute",
                                                        bottom: index % 2 !== 0 ? "135%" : "90%",
                                                        left: "50%",
                                                        backgroundColor: pickBanContext.banned.includes(creatureId)
                                                            ? "rgba(0,0,0,0.8)"
                                                            : "rgba(255,255,255,0.8)",
                                                        padding: "5px",
                                                        borderRadius: "5px",
                                                        color: pickBanContext.banned.includes(creatureId)
                                                            ? "white"
                                                            : "black",
                                                        fontWeight: "bold",
                                                        fontSize: "0.9rem",
                                                        transform: "translate(-50%, 50%) rotate(180deg) scaleX(-1)",
                                                        whiteSpace: "nowrap",
                                                        pointerEvents: "none",
                                                        zIndex: 63,
                                                    }}
                                                >
                                                    {UNIT_ID_TO_NAME[creatureId]}
                                                </Box>
                                            )}
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
                                                width: "10%",
                                                height: "90%",
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                position: "relative",
                                                zIndex:
                                                    selectedCreature === creatureId || hoveredCreature === creatureId
                                                        ? 91
                                                        : 62, // Ensure hover z-index above others
                                                transform: index % 2 !== 0 ? "translateY(-25%)" : "translateY(25%)",
                                                transition: "all 0.3s ease", // Updated to include all transitions
                                                filter:
                                                    selectedCreature === creatureId || hoveredCreature === creatureId
                                                        ? pickBanContext.banned.includes(creatureId)
                                                            ? "drop-shadow(0px -40px 25px rgba(255, 0, 0, 1))"
                                                            : "drop-shadow(0px -40px 25px rgba(255, 255, 255, 0.9))"
                                                        : "drop-shadow(0px 0px 0px rgba(0,0,0,0))", // Shadow on hover
                                                top: index === CreatureByLevel[0].length / 2 ? "12.5%" : 0, // Adjust left position
                                                borderRadius:
                                                    selectedCreature === creatureId || hoveredCreature === creatureId
                                                        ? "50%"
                                                        : "none", // Border on hover
                                                cursor: "pointer",
                                                // Hover styles for name
                                                "& .unit-name": {
                                                    visibility:
                                                        selectedCreature === creatureId ||
                                                        hoveredCreature === creatureId
                                                            ? "visible"
                                                            : "hidden",
                                                    opacity:
                                                        selectedCreature === creatureId ||
                                                        hoveredCreature === creatureId
                                                            ? 1
                                                            : 0,
                                                    transition: "opacity 0.3s ease, visibility 0.2s ease",
                                                    zIndex:
                                                        selectedCreature === creatureId ||
                                                        hoveredCreature === creatureId
                                                            ? 102
                                                            : 82, // Ensure name appears above everything
                                                },
                                            }}
                                            onMouseEnter={() => {
                                                if (hoverTimeoutRef.current) {
                                                    clearTimeout(hoverTimeoutRef.current);
                                                }
                                                handleMouseEnter(creatureId);
                                            }}
                                            onMouseLeave={handleMouseLeave}
                                            onClick={() => handleCreatureClick(creatureId)}
                                        >
                                            <div style={{ position: "relative", width: "100%", height: "100%" }}>
                                                {!initialCreatures.includes(creatureId) && (
                                                    <img
                                                        src={UNIT_ID_TO_IMAGE[creatureId]}
                                                        alt={`Creature ${creatureId}`}
                                                        style={{
                                                            width: "100%",
                                                            height: "100%",
                                                            objectFit: "contain",
                                                            borderRadius: "50%",
                                                            transition: "filter 0.3s ease, transform 0.3s ease",
                                                            filter: pickBanContext.banned.includes(creatureId)
                                                                ? "grayscale(100%)"
                                                                : "none",
                                                            transform:
                                                                selectedCreature === creatureId ||
                                                                hoveredCreature === creatureId
                                                                    ? `scale(1.2) translateY(${index % 2 === 0 ? "-10%" : "25%"})`
                                                                    : "scale(1)",
                                                        }}
                                                    />
                                                )}
                                                {/* Draw x mark if banned */}
                                                {pickBanContext.banned.includes(creatureId) && (
                                                    <img
                                                        src={images.x_mark_1_512}
                                                        alt="X mark"
                                                        style={{
                                                            position: "absolute",
                                                            width: "100%",
                                                            height: "100%",
                                                            top: "0",
                                                            left: "0",
                                                            objectFit: "contain",
                                                            transform:
                                                                selectedCreature === creatureId ||
                                                                hoveredCreature === creatureId
                                                                    ? `scale(1.2) translateY(${index % 2 === 0 ? "-10%" : "25%"})`
                                                                    : "scale(1)",
                                                            transition: "transform 0.2s ease-out",
                                                        }}
                                                    />
                                                )}
                                            </div>
                                            {!initialCreatures.includes(creatureId) && (
                                                <Box
                                                    className="unit-name"
                                                    sx={{
                                                        position: "absolute",
                                                        bottom: index % 2 === 0 ? "135%" : "90%",
                                                        left: "50%",
                                                        backgroundColor: pickBanContext.banned.includes(creatureId)
                                                            ? "rgba(0,0,0,0.8)"
                                                            : "rgba(255,255,255,0.8)",
                                                        padding: "5px",
                                                        borderRadius: "5px",
                                                        color: pickBanContext.banned.includes(creatureId)
                                                            ? "white"
                                                            : "black",
                                                        fontWeight: "bold",
                                                        fontSize: "0.9rem",
                                                        transform: "translate(-50%, 50%) rotate(180deg) scaleX(-1)",
                                                        whiteSpace: "nowrap",
                                                        pointerEvents: "none",
                                                        zIndex: 63,
                                                    }}
                                                >
                                                    {UNIT_ID_TO_NAME[creatureId]}
                                                </Box>
                                            )}
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
                                borderBottom: !isInitialPick ? "4px solid #2a2a2a" : undefined,
                                position: "relative",
                                "&::after": isInitialPick
                                    ? {
                                          content: '""',
                                          position: "absolute",
                                          top: "0%",
                                          left: "0%",
                                          right: "0%",
                                          bottom: "0%",
                                          backgroundColor: "rgba(0, 0, 0, 0.9)",
                                          zIndex: 30,
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "center",
                                          color: "#ffffff",
                                          fontWeight: "bold",
                                          fontSize: "1.5rem",
                                          textAlign: "center",
                                      }
                                    : undefined,
                            }}
                        >
                            {isInitialPick && (
                                <Box>
                                    <Box
                                        sx={{
                                            position: "absolute",
                                            top: initialCreaturesPairs?.length === 2 ? "40%" : "90%",
                                            left: "50%",
                                            transform: "translate(-50%, -50%)",
                                            zIndex: 31,
                                            fontSize: "2rem", // Increase font size
                                            textShadow: "0 0 8px #ffffff, 0 0 15px #ffffff", // Light around the text
                                            animation: "lightAnimation 3s infinite",
                                            "@keyframes lightAnimation": {
                                                "0%, 100%": { opacity: 1 },
                                                "50%": { opacity: 0.4 },
                                            },
                                        }}
                                    >
                                        {initialCreaturesPairs?.length
                                            ? "Pick your pair"
                                            : "Your opponent is picking their first pair. Waiting..."}
                                    </Box>
                                    {initialCreaturesPairs?.length && (
                                        <Box
                                            sx={{
                                                display: "flex",
                                                flexDirection: "row",
                                                justifyContent: "space-around",
                                                alignItems: "center",
                                                height: "200%",
                                                overflow: "hidden",
                                            }}
                                        >
                                            <Box
                                                sx={{
                                                    flex: 0.5,
                                                    display: "flex",
                                                    justifyContent: "center",
                                                    alignItems: "center",
                                                    position: "relative",
                                                }}
                                            >
                                                <InitialCreatureImageBox
                                                    creatureId={initialCreaturesPairs[0][0]}
                                                    selectedCreature={selectedCreature}
                                                    hoveredCreature={hoveredCreature}
                                                    initialCreaturesPairs={initialCreaturesPairs}
                                                    handleMouseEnter={handleMouseEnter}
                                                    handleMouseLeave={handleMouseLeave}
                                                    handleCreatureClick={handleCreatureClick}
                                                    hoverTimeoutRef={hoverTimeoutRef}
                                                />
                                                <InitialCreatureImageBox
                                                    creatureId={initialCreaturesPairs[0][1]}
                                                    selectedCreature={selectedCreature}
                                                    hoveredCreature={hoveredCreature}
                                                    initialCreaturesPairs={initialCreaturesPairs}
                                                    handleMouseEnter={handleMouseEnter}
                                                    handleMouseLeave={handleMouseLeave}
                                                    handleCreatureClick={handleCreatureClick}
                                                    hoverTimeoutRef={hoverTimeoutRef}
                                                />
                                            </Box>
                                            <Box
                                                sx={{
                                                    flex: 0.5,
                                                    display: "flex",
                                                    justifyContent: "center",
                                                    alignItems: "center",
                                                    position: "relative",
                                                }}
                                            >
                                                <InitialCreatureImageBox
                                                    creatureId={initialCreaturesPairs[1][0]}
                                                    selectedCreature={selectedCreature}
                                                    hoveredCreature={hoveredCreature}
                                                    initialCreaturesPairs={initialCreaturesPairs}
                                                    handleMouseEnter={handleMouseEnter}
                                                    handleMouseLeave={handleMouseLeave}
                                                    handleCreatureClick={handleCreatureClick}
                                                    hoverTimeoutRef={hoverTimeoutRef}
                                                />
                                                <InitialCreatureImageBox
                                                    creatureId={initialCreaturesPairs[1][1]}
                                                    selectedCreature={selectedCreature}
                                                    hoveredCreature={hoveredCreature}
                                                    initialCreaturesPairs={initialCreaturesPairs}
                                                    handleMouseEnter={handleMouseEnter}
                                                    handleMouseLeave={handleMouseLeave}
                                                    handleCreatureClick={handleCreatureClick}
                                                    hoverTimeoutRef={hoverTimeoutRef}
                                                />
                                            </Box>
                                        </Box>
                                    )}
                                </Box>
                            )}
                            <Box
                                sx={{
                                    flex: 0.5,
                                    position: "relative",
                                    zIndex: 2,
                                    "&::before": {
                                        content: '""',
                                        position: "absolute",
                                        top: "0%",
                                        left: "0%",
                                        right: "0%",
                                        bottom: "0%",
                                        background: !isInitialPick
                                            ? "linear-gradient(to right, rgba(0, 0, 0, 1), transparent)"
                                            : undefined,
                                    },
                                }}
                            >
                                {!isInitialPick && (
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
                                )}
                            </Box>
                            <Box
                                sx={{
                                    flex: 0.5,
                                    position: "relative",
                                    zIndex: 2,
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
                                {!isInitialPick && (
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
                                )}
                            </Box>
                        </Box>

                        <Box
                            sx={{
                                flex: 0.4,
                                display: "flex",
                                flexDirection: "row",
                                // borderBottom: "4px solid #2a2a2a",
                                position: "relative",
                                "&::after": isInitialPick
                                    ? {
                                          content: '""',
                                          position: "absolute",
                                          top: "0%",
                                          left: "0%",
                                          right: "0%",
                                          bottom: "0%",
                                          backgroundColor: "rgba(0, 0, 0, 0.9)",
                                          zIndex: 1,
                                      }
                                    : undefined,
                            }}
                        >
                            {!isInitialPick && (
                                <>
                                    <Box
                                        sx={{
                                            flex: 0.5,
                                            position: "relative",
                                            zIndex: 2,
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
                                            zIndex: 2,
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
                                </>
                            )}
                        </Box>
                    </Box>
                </Sheet>
            </Box>
        </div>
    );
};

export default StainedGlassWindow;
