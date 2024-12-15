import { CreatureByLevel, CreatureLevels } from "@heroesofcrypto/common";
import { PickPhase } from "@heroesofcrypto/common/src/generated/protobuf/v1/types_pb";

import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Box, Sheet, IconButton } from "@mui/joy";
import CheckIcon from "@mui/icons-material/Check";
import ClearIcon from "@mui/icons-material/Clear";

import overlayPickImage from "../../../images/overlay_pick.webp";
import { images } from "../../generated/image_imports";
import { usePickBanEvents } from "..";
import { UNIT_ID_TO_IMAGE, UNIT_ID_TO_NAME } from "../unit_ui_constants";
import { InitialCreatureImageBox } from "./InitialCreatureImageBox";
import { useAuthContext } from "../auth/context/auth_context";
import { Timer } from "./Timer";
import HelpQuestionMarkIcon from "./HelpQuestionMarkIcon";
import RevealIcon from "./RevealIcon";
import { RevealCreatureImageBox } from "./RevealCreatureImageBox";

interface StainedGlassProps {
    width?: string | number;
    height?: string | number;
}

const StainedGlassWindow: React.FC<StainedGlassProps> = ({ height = window.innerHeight }) => {
    const pickBanContext = usePickBanEvents();
    const { pickPair } = useAuthContext();

    const width = useMemo(() => (height as number) * 0.84, [height]); // Memoize calculated width
    const [hoveredCreature, setHoveredCreature] = useState<number | null>(null);
    const [selectedCreature, setSelectedCreature] = useState<number | null>(null);
    const [lastKnownPickPhase, setLastKnownPickPhase] = useState<number | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [localSeconds, setLocalSeconds] = useState<number>(pickBanContext.secondsRemaining);
    const [modalClosed, setModalClosed] = useState<boolean>(false);
    const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const yourCreaturesPoolByLevel: number[] = structuredClone([1, 2, 1, 2, 3, 4]);
    const opponentCreaturesPoolByLevel: number[] = structuredClone([1, 2]);

    const {
        isInitialPick,
        initialCreaturesPairs,
        doNotRenderCreatures,
        yourPickedCreatures,
        opponentPickedCreatures,
        poolPickable,
        poolRevealable,
        isBan,
    } = useMemo(() => {
        const isInitialPick = pickBanContext.pickPhase === PickPhase.INITIAL_PICK;
        const isBan = pickBanContext.pickPhase === PickPhase.EXTENDED_BAN || pickBanContext.pickPhase === PickPhase.BAN;
        let initialCreaturesPairs: [number, number][] = [];
        const doNotRenderCreatures: number[] = [];
        const yourPickedCreatures: number[] = [];
        const opponentPickedCreatures: number[] = [];

        if (isInitialPick && pickBanContext.initialCreaturesPairs?.length === 2) {
            initialCreaturesPairs = pickBanContext.initialCreaturesPairs;
            for (const pair of initialCreaturesPairs) {
                if (pair?.length === 2) {
                    doNotRenderCreatures.push(pair[0]);
                    doNotRenderCreatures.push(pair[1]);
                }
            }
        }

        for (const p of pickBanContext.picked) {
            yourPickedCreatures.push(p);
            const level = CreatureLevels[p as keyof typeof CreatureLevels];
            if (level) {
                yourCreaturesPoolByLevel.splice(yourCreaturesPoolByLevel.indexOf(level), 1);
            }
            doNotRenderCreatures.push(p);
        }

        let index = 0;
        for (const op of pickBanContext.opponentPicked) {
            opponentPickedCreatures.push(op);
            if (index > 1 && op in CreatureLevels) {
                opponentCreaturesPoolByLevel.push(CreatureLevels[op as keyof typeof CreatureLevels]);
            }
            index++;
        }

        const poolPickable = !isInitialPick && !errorMessage && !pickBanContext.error && pickBanContext.isYourTurn;
        const poolRevealable = !isInitialPick && !errorMessage && !pickBanContext.error && pickBanContext.isYourTurn;

        return {
            isInitialPick,
            initialCreaturesPairs,
            doNotRenderCreatures: doNotRenderCreatures,
            yourPickedCreatures,
            opponentPickedCreatures,
            poolPickable,
            poolRevealable,
            isBan,
        };
    }, [
        pickBanContext.pickPhase,
        pickBanContext.initialCreaturesPairs,
        pickBanContext.error,
        errorMessage,
        yourCreaturesPoolByLevel,
        opponentCreaturesPoolByLevel,
    ]);

    console.log(`isBan ${isBan}`);
    console.log(`yourCreaturesPoolByLevel ${yourCreaturesPoolByLevel}`);
    console.log(`opponentCreaturesPoolByLevel ${opponentCreaturesPoolByLevel}`);

    useEffect(() => {
        if (pickBanContext.error) {
            setErrorMessage(pickBanContext.error);
        }
        if (pickBanContext.pickPhase !== lastKnownPickPhase) {
            setLastKnownPickPhase(pickBanContext.pickPhase);
        }
    }, [pickBanContext.error]);

    useEffect(() => {
        let timer: NodeJS.Timeout | undefined;

        if (pickBanContext.secondsRemaining > -1) {
            setLocalSeconds(pickBanContext.secondsRemaining);
        }

        if (localSeconds > 0) {
            timer = setInterval(() => {
                setLocalSeconds((prev) => {
                    if (prev <= 1) {
                        clearInterval(timer);
                    }
                    return prev - 1;
                });
            }, 1000);
        }

        if (pickBanContext.secondsRemaining > -1 && pickBanContext.secondsRemaining < localSeconds) {
            clearInterval(timer);
            setLocalSeconds(pickBanContext.secondsRemaining);
        }

        return () => {
            if (timer) {
                clearInterval(timer);
            }
        };
    }, [pickBanContext.secondsRemaining, localSeconds]);

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

    const handlePickPair1 = useCallback(async () => {
        try {
            await pickPair(0);
        } catch (err) {
            setErrorMessage((err as Error).message);
        }
    }, [pickPair]);

    const handlePickPair2 = useCallback(async () => {
        try {
            await pickPair(1);
        } catch (err) {
            setErrorMessage((err as Error).message);
        }
    }, [pickPair]);

    const handleMouseLeave = useCallback(() => {
        if (hoverTimeoutRef.current) {
            clearTimeout(hoverTimeoutRef.current);
        }

        hoverTimeoutRef.current = setTimeout(() => {
            setHoveredCreature(null);
        }, 100);
    }, []);

    const handleCreatureClick = useCallback(
        (creatureId: number) => {
            if (!pickBanContext.banned.includes(creatureId)) {
                setSelectedCreature(creatureId);
            }
        },
        [pickBanContext.banned],
    );

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
                        >
                            <Timer localSeconds={localSeconds} isYourTurn={pickBanContext.isYourTurn ?? false} />
                            <style>
                                {`
                                @keyframes pulseEffect {
                                    0% { transform: scale(1); }
                                    50% { transform: scale(1.05); }
                                    100% { transform: scale(1); }
                                }
                                `}
                            </style>
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
                                    borderTop: "2px solid #d2d2d2",
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
                                                cursor: !doNotRenderCreatures.includes(creatureId)
                                                    ? "pointer"
                                                    : "default",
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
                                                    textDecoration: pickBanContext.banned.includes(creatureId)
                                                        ? "line-through"
                                                        : "none",
                                                },
                                            }}
                                            onMouseEnter={() => {
                                                if (!doNotRenderCreatures.includes(creatureId)) {
                                                    if (hoverTimeoutRef.current) {
                                                        clearTimeout(hoverTimeoutRef.current);
                                                    }
                                                    handleMouseEnter(creatureId);
                                                }
                                            }}
                                            onMouseLeave={() => {
                                                if (!doNotRenderCreatures.includes(creatureId)) {
                                                    handleMouseLeave();
                                                }
                                            }}
                                            onClick={() => {
                                                if (!doNotRenderCreatures.includes(creatureId)) {
                                                    handleCreatureClick(creatureId);
                                                }
                                            }}
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
                                                {selectedCreature === creatureId && poolPickable && (
                                                    <Box
                                                        sx={{
                                                            position: "absolute",
                                                            width: "auto",
                                                            display: "flex",
                                                            justifyContent: "space-between",
                                                            alignItems: "center",
                                                            top: "75%",
                                                            right: "40%",
                                                            transform: "translate(-50%, -50%) scale(1.5)",
                                                            zIndex: 103,
                                                        }}
                                                    >
                                                        <IconButton
                                                            aria-label="accept"
                                                            sx={{
                                                                color: "lightgreen",
                                                                marginRight: "10%",
                                                                marginTop: "10%",
                                                                borderRadius: "20px",
                                                                boxShadow: "0 0 10px #ffffff",
                                                                border: "2px solid white",
                                                                paddingLeft: "10px",
                                                                paddingRight: "10px",
                                                                display: "flex",
                                                                alignItems: "center",
                                                                backgroundColor: "#000000",
                                                                transform: "scale(0.8)",
                                                                "&:hover": {
                                                                    backgroundColor: "darkgreen",
                                                                },
                                                            }}
                                                        >
                                                            <CheckIcon
                                                                sx={{
                                                                    transform: "rotateX(180deg)",
                                                                    marginRight: "5px",
                                                                }}
                                                            />
                                                            <span
                                                                style={{ color: "white", transform: "rotateX(180deg)" }}
                                                            >
                                                                Pick
                                                            </span>
                                                        </IconButton>
                                                    </Box>
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
                                                    textDecoration: pickBanContext.banned.includes(creatureId)
                                                        ? "line-through"
                                                        : "none",
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
                                                // transform: index % 2 === 0 ? "translateY(-25%)" : "translateY(25%)",
                                                transition: "all 0.3s ease", // Updated to include all transitions
                                                filter:
                                                    selectedCreature === creatureId || hoveredCreature === creatureId
                                                        ? pickBanContext.banned.includes(creatureId)
                                                            ? "drop-shadow(0px -40px 25px rgba(255, 0, 0, 1))"
                                                            : "drop-shadow(0px -40px 25px rgba(255, 255, 255, 0.9))"
                                                        : "drop-shadow(0px 0px 0px rgba(0,0,0,0))", // Shadow on hover
                                                // left: index === CreatureByLevel[2].length - 1 ? "-2%" : 0, // Adjust left position
                                                left:
                                                    index === 0
                                                        ? "1%"
                                                        : index === CreatureByLevel[2].length - 1
                                                          ? "-1%"
                                                          : index === 1
                                                            ? "0.9%"
                                                            : index === 2
                                                              ? "0.7%"
                                                              : index === 3
                                                                ? "0.3%"
                                                                : index === 4
                                                                  ? "-0.3%"
                                                                  : index === 5
                                                                    ? "-0.3%"
                                                                    : index === 6
                                                                      ? "-0.4%"
                                                                      : 0,
                                                // right: index === 1 ? "42%" : 0, // Adjust left position
                                                borderRadius:
                                                    selectedCreature === creatureId || hoveredCreature === creatureId
                                                        ? "50%"
                                                        : "none", // Border on hover
                                                cursor: !doNotRenderCreatures.includes(creatureId)
                                                    ? "pointer"
                                                    : "default",
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
                                                if (!doNotRenderCreatures.includes(creatureId)) {
                                                    if (hoverTimeoutRef.current) {
                                                        clearTimeout(hoverTimeoutRef.current);
                                                    }
                                                    handleMouseEnter(creatureId);
                                                }
                                            }}
                                            onMouseLeave={() => {
                                                if (!doNotRenderCreatures.includes(creatureId)) {
                                                    handleMouseLeave();
                                                }
                                            }}
                                            onClick={() => {
                                                if (!doNotRenderCreatures.includes(creatureId)) {
                                                    handleCreatureClick(creatureId);
                                                }
                                            }}
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
                                                                ? `scale(1.2) translateY(25%)`
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
                                                                    ? `scale(1.2) translateY(25%)`
                                                                    : "scale(1)",
                                                            transition: "transform 0.2s ease-out",
                                                        }}
                                                    />
                                                )}
                                                {selectedCreature === creatureId && poolPickable && (
                                                    <Box
                                                        sx={{
                                                            position: "absolute",
                                                            width: "auto",
                                                            display: "flex",
                                                            justifyContent: "space-between",
                                                            alignItems: "center",
                                                            top: "75%",
                                                            right: "40%",
                                                            transform: "translate(-50%, -50%) scale(1.5)",
                                                            zIndex: 103,
                                                        }}
                                                    >
                                                        <IconButton
                                                            aria-label="accept"
                                                            sx={{
                                                                color: "lightgreen",
                                                                marginRight: "10%",
                                                                marginTop: "10%",
                                                                borderRadius: "20px",
                                                                boxShadow: "0 0 10px #ffffff",
                                                                border: "2px solid white",
                                                                paddingLeft: "10px",
                                                                paddingRight: "10px",
                                                                display: "flex",
                                                                alignItems: "center",
                                                                backgroundColor: "#000000",
                                                                transform: "scale(0.8)",
                                                                "&:hover": {
                                                                    backgroundColor: "darkgreen",
                                                                },
                                                            }}
                                                        >
                                                            <CheckIcon
                                                                sx={{
                                                                    transform: "rotateX(180deg)",
                                                                    marginRight: "5px",
                                                                }}
                                                            />
                                                            <span
                                                                style={{ color: "white", transform: "rotateX(180deg)" }}
                                                            >
                                                                Pick
                                                            </span>
                                                        </IconButton>
                                                    </Box>
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
                                                    zIndex: 63,
                                                    textDecoration: pickBanContext.banned.includes(creatureId)
                                                        ? "line-through"
                                                        : "none",
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
                                                cursor: !doNotRenderCreatures.includes(creatureId)
                                                    ? "pointer"
                                                    : "default",
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
                                                if (!doNotRenderCreatures.includes(creatureId)) {
                                                    if (hoverTimeoutRef.current) {
                                                        clearTimeout(hoverTimeoutRef.current);
                                                    }
                                                    handleMouseEnter(creatureId);
                                                }
                                            }}
                                            onMouseLeave={() => {
                                                if (!doNotRenderCreatures.includes(creatureId)) {
                                                    handleMouseLeave();
                                                }
                                            }}
                                            onClick={() => {
                                                if (!doNotRenderCreatures.includes(creatureId)) {
                                                    handleCreatureClick(creatureId);
                                                }
                                            }}
                                        >
                                            <div style={{ position: "relative", width: "100%", height: "100%" }}>
                                                {!doNotRenderCreatures.includes(creatureId) && (
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
                                            {!doNotRenderCreatures.includes(creatureId) && (
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
                                                        textDecoration: pickBanContext.banned.includes(creatureId)
                                                            ? "line-through"
                                                            : "none",
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
                                                cursor: !doNotRenderCreatures.includes(creatureId)
                                                    ? "pointer"
                                                    : "default",
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
                                                if (!doNotRenderCreatures.includes(creatureId)) {
                                                    if (hoverTimeoutRef.current) {
                                                        clearTimeout(hoverTimeoutRef.current);
                                                    }
                                                    handleMouseEnter(creatureId);
                                                }
                                            }}
                                            onMouseLeave={() => {
                                                if (!doNotRenderCreatures.includes(creatureId)) {
                                                    handleMouseLeave();
                                                }
                                            }}
                                            onClick={() => {
                                                if (!doNotRenderCreatures.includes(creatureId)) {
                                                    handleCreatureClick(creatureId);
                                                }
                                            }}
                                        >
                                            <div style={{ position: "relative", width: "100%", height: "100%" }}>
                                                {!doNotRenderCreatures.includes(creatureId) && (
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
                                            {!doNotRenderCreatures.includes(creatureId) && (
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
                                                        textDecoration: pickBanContext.banned.includes(creatureId)
                                                            ? "line-through"
                                                            : "none",
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
                                borderTop: "4px solid #d2d2d2",
                                borderBottom: !isInitialPick && !errorMessage ? "4px solid #d2d2d2" : undefined,
                                position: "relative",
                                "&::after":
                                    (lastKnownPickPhase !== null && !modalClosed) || errorMessage
                                        ? {
                                              content: '""',
                                              position: "absolute",
                                              top: "0%",
                                              left: "0%",
                                              right: "0%",
                                              bottom: "0%",
                                              backgroundColor: errorMessage
                                                  ? "rgba(139, 0, 0, 0.9)"
                                                  : "rgba(0, 0, 0, 0.9)",
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
                            {errorMessage && (
                                <Box>
                                    <Box
                                        sx={{
                                            position: "absolute",
                                            top: "50%",
                                            left: "50%",
                                            transform: "translate(-50%, -50%)",
                                            zIndex: 31,
                                            fontSize: "2rem", // Increase font size
                                            textShadow: !errorMessage ? "0 0 8px #ffffff, 0 0 15px #ffffff" : "none", // Light around the text
                                            animation: "lightAnimation 3s infinite",
                                            "@keyframes lightAnimation": {
                                                "0%, 100%": { opacity: 1 },
                                                "50%": { opacity: 0.4 },
                                            },
                                        }}
                                    >
                                        {`Error: ${errorMessage}`}
                                    </Box>

                                    <Box
                                        sx={{
                                            position: "absolute",
                                            width: "auto",
                                            display: "flex",
                                            justifyContent: "center", // Center the button
                                            alignItems: "center",
                                            top: "120%", // Position below the error message
                                            left: "50%",
                                            transform: "translate(-50%, -50%)", // Center the box
                                            zIndex: 103,
                                        }}
                                    >
                                        <IconButton
                                            aria-label="accept"
                                            onClick={() => setErrorMessage(null)}
                                            sx={{
                                                color: "lightgreen",
                                                borderRadius: "20px",
                                                border: "2px solid white",
                                                paddingLeft: "40px",
                                                paddingRight: "40px",
                                                display: "flex",
                                                alignItems: "center",
                                                backgroundColor: "transparent",
                                                transform: "scale(1.1)",
                                                "&:hover": {
                                                    backgroundColor: "black",
                                                    color: "white",
                                                },
                                            }}
                                        >
                                            <span style={{ color: "white" }}>Ok</span>
                                        </IconButton>
                                    </Box>
                                </Box>
                            )}
                            {!errorMessage && !isInitialPick && lastKnownPickPhase !== null && !modalClosed && (
                                <Box>
                                    <IconButton
                                        aria-label="close"
                                        onClick={() => setModalClosed(true)}
                                        sx={{
                                            position: "absolute",
                                            top: "5%",
                                            right: "1%",
                                            color: "white",
                                            zIndex: 32,
                                        }}
                                    >
                                        <ClearIcon />
                                    </IconButton>
                                    <Box
                                        sx={{
                                            position: "absolute",
                                            // top: "36%",
                                            top: "45%",
                                            left: "50%",
                                            transform: "translate(-50%, -50%)",
                                            zIndex: 31,
                                            color: pickBanContext.isYourTurn ? "#90ee90" : "white",
                                            fontSize: "2rem", // Increase font size
                                            textShadow: pickBanContext.isYourTurn
                                                ? "0 0 8px #90ee90, 0 0 15px #90ee90" // Light green if it's your turn
                                                : "0 0 8px #ffffff, 0 0 15px #ffffff", // Light around the text
                                            animation: "lightAnimation 3s infinite",
                                            "@keyframes lightAnimation": {
                                                "0%, 100%": { opacity: 1 },
                                                "50%": { opacity: 0.4 },
                                            },
                                        }}
                                    >
                                        {pickBanContext.isYourTurn === null
                                            ? "Loading..."
                                            : pickBanContext.isYourTurn
                                              ? "Your time to pick"
                                              : "Waiting for opponent to pick"}
                                    </Box>
                                </Box>
                            )}
                            {!errorMessage && isInitialPick && (
                                <Box>
                                    <Box
                                        sx={{
                                            position: "absolute",
                                            top: initialCreaturesPairs?.length === 2 ? "36%" : "90%",
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
                                                    transformY={false}
                                                />
                                                <Box
                                                    sx={{
                                                        position: "absolute",
                                                        width: "auto",
                                                        display: "flex",
                                                        justifyContent: "center",
                                                        alignItems: "left",
                                                        top: "40%",
                                                        left: "0px",
                                                        transform: "translate(50%, -50%) scale(1.5)",
                                                        zIndex: 103,
                                                    }}
                                                >
                                                    <IconButton
                                                        aria-label="accept"
                                                        onClick={handlePickPair1}
                                                        sx={{
                                                            color: "lightgreen",
                                                            marginRight: "10%",
                                                            marginTop: "10%",
                                                            borderRadius: "20px",
                                                            boxShadow: "0 0 10px #ffffff",
                                                            border: "2px solid white",
                                                            paddingLeft: "10px",
                                                            paddingRight: "10px",
                                                            display: "flex",
                                                            alignItems: "center",
                                                            backgroundColor: "#000000",
                                                            transform: "scale(0.8)",
                                                            "&:hover": {
                                                                backgroundColor: "darkgreen",
                                                            },
                                                            animation: "lightAnimation 3s infinite",
                                                            "@keyframes lightAnimation": {
                                                                "0%, 100%": { opacity: 1 },
                                                                "50%": { opacity: 0.4 },
                                                            },
                                                        }}
                                                    >
                                                        <CheckIcon
                                                            sx={{
                                                                // transform: "rotateX(180deg)",
                                                                marginRight: "5px",
                                                            }}
                                                        />
                                                        <span style={{ color: "white" }}>Pick</span>
                                                    </IconButton>
                                                </Box>
                                                <InitialCreatureImageBox
                                                    creatureId={initialCreaturesPairs[0][1]}
                                                    selectedCreature={selectedCreature}
                                                    hoveredCreature={hoveredCreature}
                                                    initialCreaturesPairs={initialCreaturesPairs}
                                                    handleMouseEnter={handleMouseEnter}
                                                    handleMouseLeave={handleMouseLeave}
                                                    handleCreatureClick={handleCreatureClick}
                                                    hoverTimeoutRef={hoverTimeoutRef}
                                                    transformY={false}
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
                                                    transformY={false}
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
                                                    transformY={false}
                                                />
                                                <Box
                                                    sx={{
                                                        position: "absolute",
                                                        width: "auto",
                                                        display: "flex",
                                                        justifyContent: "center",
                                                        alignItems: "right",
                                                        top: "40%",
                                                        right: "72px",
                                                        transform: "translate(50%, -50%) scale(1.5)",
                                                        zIndex: 103,
                                                    }}
                                                >
                                                    <IconButton
                                                        aria-label="accept"
                                                        onClick={handlePickPair2}
                                                        sx={{
                                                            color: "lightgreen",
                                                            marginRight: "10%",
                                                            marginTop: "10%",
                                                            borderRadius: "20px",
                                                            boxShadow: "0 0 10px #ffffff",
                                                            border: "2px solid white",
                                                            paddingLeft: "10px",
                                                            paddingRight: "10px",
                                                            display: "flex",
                                                            alignItems: "center",
                                                            backgroundColor: "#000000",
                                                            transform: "scale(0.8)",
                                                            "&:hover": {
                                                                backgroundColor: "darkgreen",
                                                            },
                                                            animation: "lightAnimation 3s infinite",
                                                            "@keyframes lightAnimation": {
                                                                "0%, 100%": { opacity: 1 },
                                                                "50%": { opacity: 0.4 },
                                                            },
                                                        }}
                                                    >
                                                        <CheckIcon
                                                            sx={{
                                                                // transform: "rotateX(180deg)",
                                                                marginRight: "5px",
                                                            }}
                                                        />
                                                        <span style={{ color: "white" }}>Pick</span>
                                                    </IconButton>
                                                </Box>
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
                                        background:
                                            !isInitialPick && !errorMessage
                                                ? "linear-gradient(to right, rgba(0, 0, 0, 1), transparent)"
                                                : undefined,
                                    },
                                }}
                            >
                                {!isInitialPick && !errorMessage && (
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
                            {modalClosed && !errorMessage && <HelpQuestionMarkIcon setModalClosed={setModalClosed} />}
                            {modalClosed && !errorMessage && (
                                <RevealIcon revealsRemaining={pickBanContext.revealsRemaining} />
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
                                        background: "linear-gradient(to left, rgba(0, 0, 0, 1), transparent)",
                                    },
                                }}
                            >
                                {!isInitialPick && !errorMessage && (
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
                                position: "relative",
                                width: "100%",
                                "&::after":
                                    isInitialPick || errorMessage
                                        ? {
                                              content: '""',
                                              position: "absolute",
                                              top: "0%",
                                              left: "0%",
                                              right: "0%",
                                              bottom: "0%",
                                              backgroundColor: errorMessage
                                                  ? "rgba(139, 0, 0, 0.9)"
                                                  : "rgba(0, 0, 0, 0.9)",
                                              zIndex: 1,
                                          }
                                        : undefined,
                            }}
                        >
                            {!isInitialPick && !errorMessage && (
                                <>
                                    <Box
                                        sx={{
                                            flex: "1 0 50%",
                                            position: "relative",
                                            zIndex: 2,
                                            display: "flex",
                                            flexDirection: "row",
                                            height: "100%",
                                            backgroundColor: "rgba(0, 0, 0, 0.8)",
                                        }}
                                    >
                                        {[...Array(6)].map((_, index) => (
                                            <Box
                                                key={index}
                                                sx={{
                                                    flex: "1 1 16.666%",
                                                    borderRight:
                                                        index < 5 ? "1px solid rgba(255, 255, 255, 0.3)" : "none",
                                                    height: "100%",
                                                    display: "flex",
                                                    flexDirection: "column",
                                                    alignItems: "center",
                                                    justifyContent: "center",
                                                }}
                                            >
                                                {index in yourPickedCreatures &&
                                                    yourPickedCreatures[index] &&
                                                    yourPickedCreatures[index] in CreatureLevels && (
                                                        <>
                                                            <Box
                                                                sx={{
                                                                    color: "#ffffff",
                                                                    fontSize: "0.8rem",
                                                                    marginBottom: "20px",
                                                                    textAlign: "center",
                                                                }}
                                                            >
                                                                Level{" "}
                                                                {
                                                                    CreatureLevels[
                                                                        yourPickedCreatures[
                                                                            index
                                                                        ] as keyof typeof CreatureLevels
                                                                    ]
                                                                }
                                                            </Box>
                                                            <InitialCreatureImageBox
                                                                key={yourPickedCreatures[index]}
                                                                creatureId={yourPickedCreatures[index]}
                                                                selectedCreature={selectedCreature}
                                                                hoveredCreature={hoveredCreature}
                                                                initialCreaturesPairs={initialCreaturesPairs}
                                                                handleMouseEnter={handleMouseEnter}
                                                                handleMouseLeave={handleMouseLeave}
                                                                handleCreatureClick={handleCreatureClick}
                                                                hoverTimeoutRef={hoverTimeoutRef}
                                                                transformY={true}
                                                            />
                                                        </>
                                                    )}
                                                {!yourPickedCreatures[index] &&
                                                    index - yourPickedCreatures.length in yourCreaturesPoolByLevel &&
                                                    yourCreaturesPoolByLevel[index - yourPickedCreatures.length] >
                                                        0 && (
                                                        <Box
                                                            sx={{
                                                                color: "#ffffff",
                                                                fontSize: "0.8rem",
                                                                textAlign: "center",
                                                            }}
                                                        >
                                                            Level{" "}
                                                            {
                                                                yourCreaturesPoolByLevel[
                                                                    index - yourPickedCreatures.length
                                                                ]
                                                            }
                                                        </Box>
                                                    )}
                                            </Box>
                                        ))}
                                    </Box>

                                    {/* separator */}
                                    <Box
                                        sx={{
                                            width: "4px",
                                            borderTop: "2px solid transparent",
                                            position: "relative",
                                            zIndex: 2,
                                            display: "flex",
                                            justifyContent: "center",
                                            "&::before": {
                                                content: '""',
                                                position: "absolute",
                                                top: "16%",
                                                bottom: "16%",
                                                width: "100%",
                                                borderLeft: "2px solid #ffffff",
                                            },
                                        }}
                                    />

                                    <Box
                                        sx={{
                                            flex: "1 0 50%",
                                            position: "relative",
                                            zIndex: 2,
                                            display: "flex",
                                            flexDirection: "row",
                                            height: "100%",
                                            backgroundColor: "rgba(0, 0, 0, 0.8)",
                                        }}
                                    >
                                        {[...Array(6)].map((_, index) => (
                                            <Box
                                                key={index}
                                                sx={{
                                                    flex: "1 1 16.666%",
                                                    borderRight:
                                                        index < 5 ? "1px solid rgba(255, 255, 255, 0.3)" : "none",
                                                    height: "100%",
                                                    display: "flex",
                                                    flexDirection: "column",
                                                    alignItems: "center",
                                                    justifyContent: "center",
                                                }}
                                            >
                                                {index in opponentPickedCreatures && (
                                                    <>
                                                        <Box
                                                            sx={{
                                                                color: "#ffffff",
                                                                fontSize: "0.8rem",
                                                                marginBottom: "20px",
                                                                textAlign: "center",
                                                            }}
                                                        >
                                                            Level {opponentCreaturesPoolByLevel[index]}
                                                        </Box>
                                                        {opponentPickedCreatures[index] ? (
                                                            <InitialCreatureImageBox
                                                                key={opponentPickedCreatures[index]}
                                                                creatureId={opponentPickedCreatures[index]}
                                                                selectedCreature={selectedCreature}
                                                                hoveredCreature={hoveredCreature}
                                                                initialCreaturesPairs={initialCreaturesPairs}
                                                                handleMouseEnter={handleMouseEnter}
                                                                handleMouseLeave={handleMouseLeave}
                                                                handleCreatureClick={handleCreatureClick}
                                                                hoverTimeoutRef={hoverTimeoutRef}
                                                                transformY={true}
                                                            />
                                                        ) : (
                                                            <RevealCreatureImageBox
                                                                key={`Unknown${index}`}
                                                                creatureId={-index}
                                                                selectedCreature={selectedCreature}
                                                                hoveredCreature={hoveredCreature}
                                                                initialCreaturesPairs={initialCreaturesPairs}
                                                                handleMouseEnter={handleMouseEnter}
                                                                handleMouseLeave={handleMouseLeave}
                                                                handleCreatureClick={handleCreatureClick}
                                                                hoverTimeoutRef={hoverTimeoutRef}
                                                                poolRevealable={poolRevealable ?? false}
                                                                transformY={true}
                                                            />
                                                        )}
                                                    </>
                                                )}
                                                {/* {index in opponentPickedCreatures && (
                                                    <Box
                                                        sx={{
                                                            color: "#ffffff",
                                                            fontSize: "0.8rem",
                                                            textAlign: "center",
                                                        }}
                                                    >
                                                        Level{" "}
                                                        {
                                                            opponentCreaturesPoolByLevel[
                                                                index - opponentPickedCreatures.length
                                                            ]
                                                        }
                                                    </Box>
                                                )} */}
                                            </Box>
                                        ))}
                                    </Box>
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
