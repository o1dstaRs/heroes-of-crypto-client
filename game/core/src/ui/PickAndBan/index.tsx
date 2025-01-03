import {
    CreatureByLevel,
    FactionType,
    CreatureLevels,
    TeamType,
    CreaturePoolByLevel,
    PickHelper,
    AllFactions,
} from "@heroesofcrypto/common";
import { PickPhase } from "@heroesofcrypto/common/src/generated/protobuf/v1/types_pb";
import creaturesJson from "@heroesofcrypto/common/src/configuration/creatures.json";

import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Box, Sheet, IconButton, Badge, Tooltip } from "@mui/joy";
import BlockIcon from "@mui/icons-material/Block";
import CheckIcon from "@mui/icons-material/Check";
import ClearIcon from "@mui/icons-material/Clear";

import overlayPickImage from "../../../images/overlay_pick_2.webp";
import overlayPickFrameImage from "../../../images/overlay_pick_frame.webp";
import overlayGreenImage from "../../../images/overlay_green.webp";
import overlayRedImage from "../../../images/overlay_red.webp";
import crossSwordsImage from "../../../images/icon_crossswords_128.webp";
import scoutAugmentsAndMapImage from "../../../images/icon_scout_augments_and_map_256.webp";
import scoutAllUnitsImage from "../../../images/icon_scout_all_units_256.webp";
import unknownMapImage from "../../../images/icon_unknown_map_256.webp";
import checkmarkImage from "../../../images/icon_checkmark_256.webp";
import { images } from "../../generated/image_imports";
import { usePickBanEvents } from "..";
import { UNIT_ID_TO_IMAGE, UNIT_ID_TO_NAME } from "../unit_ui_constants";
import { InitialCreatureImageBox } from "./InitialCreatureImageBox";
import { useAuthContext } from "../auth/context/auth_context";
import { Timer } from "./Timer";
import HelpQuestionMarkIcon from "./HelpQuestionMarkIcon";
import RevealIcon from "./RevealIcon";
import { RevealCreatureImageBox } from "./RevealCreatureImageBox";
import { BASE_UNIT_STACK_TO_SPAWN_EXP } from "../../statics";

interface StainedGlassProps {
    userTeam: TeamType;
    width?: string | number;
    height?: string | number;
}

interface ConfigCreature {
    name: string;
    exp: number;
}

const isChrome = /Chrome/.test(navigator.userAgent) && !/Edge/.test(navigator.userAgent);

const StainedGlassWindow: React.FC<StainedGlassProps> = ({ userTeam, height = window.innerHeight }) => {
    const pickBanContext = usePickBanEvents();
    const { pickPair, pick, ban } = useAuthContext();

    const width = useMemo(() => (height as number) * 0.84, [height]); // Memoize calculated width
    const [hoveredCreature, setHoveredCreature] = useState<number | null>(null);
    const [selectedCreature, setSelectedCreature] = useState<number | null>(null);
    const [hoveredAugmentsAndMapScout, setHoveredAugmentsAndMapScout] = useState<boolean | null>(null);
    const [hoveredAllUnitsScout, setHoveredAllUnitsScout] = useState<boolean | null>(null);
    const [selectedCreatureAmount, setSelectedCreatureAmount] = useState<number | null>(null);
    const [lastKnownPickPhase, setLastKnownPickPhase] = useState<number | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [infoMessage, setInfoMessage] = useState<string | null>(null);
    const [localSeconds, setLocalSeconds] = useState<number>(pickBanContext.secondsRemaining);
    const [modalClosed, setModalClosed] = useState<boolean>(false);
    const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const yourCreaturesPoolByLevel: number[] = [1, 2, 1, 2, 3, 4];
    const opponentCreaturesPoolByLevel: number[] = [1, 2];

    useEffect(() => {
        if (infoMessage) {
            const timer = setTimeout(() => {
                setInfoMessage(null);
                setModalClosed(false);
            }, 3000);
            return () => clearTimeout(timer);
        }
        return undefined; // Explicit return for when infoMessage is falsy
    }, [infoMessage]);

    const {
        isInitialPick,
        initialCreaturesPairs,
        doNotRenderCreatures,
        yourPickedCreatures,
        yourCreaturesToPick,
        canBanCreaturesByLevel,
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
        const yourCreaturesToPick: number[] = [...CreaturePoolByLevel];
        const opponentPickedCreatures: number[] = [];
        const canBanCreaturesByLevel: boolean[] = [false, false, false, false];

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
            const levelIndex = level - 1;
            if (levelIndex in yourCreaturesToPick) {
                yourCreaturesToPick[levelIndex] -= 1;
            }
            doNotRenderCreatures.push(p);
        }

        const opponentPickedNonZero: number[] = [];
        for (const op of pickBanContext.opponentPicked) {
            opponentPickedCreatures.push(op);
            if (op > 0 && !opponentPickedNonZero.includes(op)) {
                opponentPickedNonZero.push(op);
            }
            doNotRenderCreatures.push(op);
        }

        for (let i = 0; i <= 3; i++) {
            if (i in canBanCreaturesByLevel) {
                canBanCreaturesByLevel[i] = PickHelper.canBanCreatureLevel(
                    i + 1,
                    pickBanContext.banned,
                    opponentPickedNonZero,
                    pickBanContext.picked,
                );
            }
        }

        const poolPickable = !isInitialPick && !errorMessage && !pickBanContext.error && pickBanContext.isYourTurn;
        const poolRevealable =
            !isInitialPick &&
            !errorMessage &&
            !pickBanContext.error &&
            pickBanContext.isYourTurn &&
            pickBanContext.revealsRemaining > 0;

        return {
            isInitialPick,
            initialCreaturesPairs,
            doNotRenderCreatures,
            yourPickedCreatures,
            yourCreaturesToPick,
            canBanCreaturesByLevel,
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

    useEffect(() => {
        if (pickBanContext.isAbandoned === true) {
            setErrorMessage("This game has been abandoned!");
        } else if (pickBanContext.error) {
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

            if (hoveredCreature !== creatureId) {
                setHoveredCreature(creatureId);
            }
        },
        [hoveredCreature, selectedCreature],
    );

    const handlePickOrBanClick = useCallback(async () => {
        if (!selectedCreature) {
            return;
        }

        try {
            if (isBan) {
                await ban(selectedCreature);
            } else {
                await pick(selectedCreature);
            }
            setInfoMessage(null);
        } catch (error) {
            let message: string;
            if (typeof error === "string") {
                message = error as string;
            } else {
                message = (error as Error).message;
            }
            if (message === "This creature is already taken by your opponent") {
                setInfoMessage(message);
            } else {
                setErrorMessage(message);
            }
        }
    }, [selectedCreature, pick, setErrorMessage, isBan]);

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

                const creatureName = UNIT_ID_TO_NAME[creatureId];

                if (!creatureName) {
                    return;
                }

                for (const faction of Object.keys(creaturesJson)) {
                    if (!AllFactions.includes(faction as FactionType)) {
                        continue;
                    }

                    const creatures = creaturesJson[faction as keyof typeof creaturesJson];
                    for (const creature of Object.values(creatures) as ConfigCreature[]) {
                        if (creature.name !== creatureName) {
                            continue;
                        }
                        if (creature.exp > 0) {
                            setSelectedCreatureAmount(Math.ceil((BASE_UNIT_STACK_TO_SPAWN_EXP ?? 0) / creature.exp));
                        }
                    }
                }
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
                    setSelectedCreatureAmount(null);
                }
            }
        };

        const handleEscKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setSelectedCreature(null);
                setSelectedCreatureAmount(null);
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
                    paddingTop: "2%",
                    paddingBottom: "2%",
                    borderRadius: "16px",
                    zIndex: 100, // Base level for main container
                }}
            >
                <Sheet
                    sx={{
                        width: "100%",
                        height: "100%", // Cut 5% of the background image on the bottom
                        borderRadius: "50% 50% 0 0",
                        overflow: "visible",
                        position: "relative",
                        display: "flex",
                        paddingRight: "0.7%",
                        paddingLeft: "0.7%",
                        paddingBottom: "1.2%",
                        backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.5)), url(${overlayPickImage})`,
                        backgroundSize: "115.5% 107%", // Adjust the background size accordingly
                        backgroundRepeat: "no-repeat",
                        backgroundPosition: "center",
                        boxShadow: "0 0 50px 25px rgba(255, 223, 186, 0.3)", // Diffused for a softer light effect
                        animation: "gentlePulse 15s infinite alternate", // Changed animation for a gentler effect
                        "&:after": {
                            content: '""',
                            position: "absolute",
                            top: "-1.5%",
                            left: 0,
                            right: 0,
                            bottom: "-1.42%",
                            backgroundImage: `url(${overlayPickFrameImage})`,
                            backgroundSize: "115.5% 104%",
                            backgroundRepeat: "no-repeat",
                            backgroundPosition: "center",
                            pointerEvents: "none",
                            zIndex: 0,
                        },
                    }}
                >
                    <style>
                        {`
                            @keyframes gentlePulse {
                                from {
                                    box-shadow: ${pickBanContext.isYourTurn ? (isBan ? "0 0 100px 25px rgba(255, 0, 0, 0.4)" : "0 0 100px 25px rgba(144, 255, 144, 0.3)") : "0 0 50px 25px rgba(255, 165, 0, 0.3)"};
                                }
                                to {
                                    box-shadow: ${pickBanContext.isYourTurn ? (isBan ? "0 0 100px 40px rgba(255, 0, 0, 0.2)" : "0 0 100px 40px rgba(144, 255, 144, 0.15)") : "0 0 80px 40px rgba(255, 140, 0, 0.15)"};
                                }
                            }
                            ${pickBanContext.isYourTurn ? "@keyframes gentlePulse { 0% { box-shadow: 0 0 50px 25px " + (isBan ? "rgba(255, 0, 0, 0.4)" : "rgba(144, 255, 144, 0.3)") + "; } 50% { box-shadow: 0 0 80px 40px " + (isBan ? "rgba(255, 0, 0, 0.2)" : "rgba(144, 255, 144, 0.15)") + "; } 100% { box-shadow: 0 0 50px 25px " + (isBan ? "rgba(255, 0, 0, 0.4)" : "rgba(144, 255, 144, 0.3)") + "; } } animation: gentlePulse 1s infinite;" : ""}
                        `}
                    </style>
                    <Box
                        sx={{
                            position: "absolute",
                            top: 0,
                            right: "-3%",
                            width: "160px",
                            height: "160px",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "flex-start",
                        }}
                    >
                        <span
                            style={{
                                color: hoveredAugmentsAndMapScout ? "white" : "darkgrey",
                                fontSize: "1.2rem",
                                fontWeight: "bold",
                                marginBottom: "10px",
                                textShadow: "2px 2px 8px #000000",
                                zIndex: 91,
                            }}
                        >
                            Map
                        </span>
                        <Box
                            sx={{
                                width: "80%",
                                height: "80%",
                                borderRadius: "50%",
                                // background:
                                //     "radial-gradient(circle at center, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 85%)",
                                // filter: "blur(15px)",
                                zIndex: 90,
                                pointerEvents: "none",
                                backgroundImage: `url(${unknownMapImage})`,
                                backgroundSize: "contain",
                                backgroundRepeat: "no-repeat",
                                backgroundPosition: "center",
                                opacity: hoveredAugmentsAndMapScout ? 1 : 0.4,
                                boxShadow: hoveredAugmentsAndMapScout ? "0 0 20px #fff" : "none",
                            }}
                        />
                    </Box>
                    <Box
                        sx={{
                            position: "absolute",
                            left: "-9%",
                            top: "73%",
                            transform: "translateY(-50%)",
                            zIndex: 100,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: "68px",
                            height: "68px",
                            backgroundImage: `url(${scoutAugmentsAndMapImage})`,
                            backgroundSize: "contain",
                            backgroundRepeat: "no-repeat",
                            backgroundPosition: "center",
                            cursor: "pointer",
                            transition: "transform 0.2s ease",
                            "&:hover": {
                                transform: "translateY(-50%) scale(1.2)",
                            },
                        }}
                        onMouseEnter={() => {
                            setHoveredAugmentsAndMapScout(true);
                            setModalClosed(true);
                        }}
                        onMouseLeave={() => {
                            setHoveredAugmentsAndMapScout(false);
                            setModalClosed(false);
                        }}
                    />
                    <Box
                        sx={{
                            position: "absolute",
                            left: "-9.2%",
                            top: "81.5%",
                            transform: "translateY(-50%)",
                            zIndex: 100,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: "72px",
                            height: "72px",
                            backgroundImage: `url(${scoutAllUnitsImage})`,
                            backgroundSize: "contain",
                            backgroundRepeat: "no-repeat",
                            backgroundPosition: "center",
                            cursor: "pointer",
                            transition: "transform 0.2s ease",
                            "&:hover": {
                                transform: "translateY(-50%) scale(1.2)",
                            },
                        }}
                        onMouseEnter={() => {
                            setHoveredAllUnitsScout(true);
                        }}
                        onMouseLeave={() => {
                            setHoveredAllUnitsScout(false);
                        }}
                    />
                    {!!userTeam && (
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
                                    zIndex: 70,
                                    "&::before": {
                                        content: '""',
                                        position: "absolute",
                                        top: 0,
                                        left: "16%",
                                        right: "16%",
                                        bottom: 0,
                                        borderTop: "2px solid #d2d2d2",
                                    },
                                }}
                            >
                                <Box
                                    sx={{
                                        position: "absolute",
                                        top: "8%",
                                        left: "50%",
                                        transform: "translateX(-50%)",
                                        color: "#ffffff",
                                        fontWeight: "bold",
                                        fontSize: "1.2rem",
                                        textShadow: "2px 2px 8px #000000",
                                        zIndex: 71,
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
                                                        selectedCreature === creatureId ||
                                                        hoveredCreature === creatureId
                                                            ? 92
                                                            : 72,
                                                    transform:
                                                        index % 2 < CreatureByLevel[3].length / 2
                                                            ? "translateY(-15%)"
                                                            : "translateY(25%)",
                                                    transition: "all 0.3s ease",
                                                    filter:
                                                        selectedCreature === creatureId ||
                                                        hoveredCreature === creatureId
                                                            ? pickBanContext.banned.includes(creatureId)
                                                                ? `drop-shadow(0px ${isChrome ? -40 : 40}px 25px rgba(255, 0, 0, 1))`
                                                                : `drop-shadow(0px ${isChrome ? -40 : 40}px 25px rgba(255, 255, 255, 0.9))`
                                                            : "drop-shadow(0px 0px 0px rgba(0,0,0,0))",
                                                    left:
                                                        index === 0
                                                            ? "7%"
                                                            : index === CreatureByLevel[3].length - 1
                                                              ? "-7%"
                                                              : index === 1
                                                                ? "5.4%"
                                                                : index === 2
                                                                  ? "3.6%"
                                                                  : index === 3
                                                                    ? "1.1%"
                                                                    : index === CreatureByLevel[3].length - 4
                                                                      ? "-1.1%"
                                                                      : index === CreatureByLevel[3].length - 3
                                                                        ? "-2.6%"
                                                                        : index === CreatureByLevel[3].length - 2
                                                                          ? "-4.8%"
                                                                          : 0,
                                                    borderRadius:
                                                        selectedCreature === creatureId ||
                                                        hoveredCreature === creatureId
                                                            ? "50%"
                                                            : "none",
                                                    cursor: !doNotRenderCreatures.includes(creatureId)
                                                        ? "pointer"
                                                        : "default",
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
                                                                : 82,
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
                                                    if (doNotRenderCreatures.includes(creatureId)) {
                                                        setSelectedCreature(null);
                                                        setSelectedCreatureAmount(null);
                                                    } else {
                                                        handleCreatureClick(creatureId);
                                                    }
                                                }}
                                            >
                                                <div style={{ position: "relative", width: "100%", height: "100%" }}>
                                                    <>
                                                        <style>
                                                            {`
                                                                    @keyframes flicker {
                                                                        0% { opacity: 0; transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1); }
                                                                        49% { opacity: 0; transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1); }
                                                                        50% { opacity: 1; transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1); }
                                                                        100% { opacity: 1; transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1); }
                                                                    }
                                                                `}
                                                        </style>
                                                        <img
                                                            src={UNIT_ID_TO_IMAGE[creatureId]}
                                                            alt={`Creature ${creatureId}`}
                                                            style={{
                                                                width: "100%",
                                                                height: "100%",
                                                                objectFit: "contain",
                                                                borderRadius: "50%",
                                                                transition: "filter 0.3s ease, transform 0.3s ease",
                                                                filter:
                                                                    pickBanContext.banned.includes(creatureId) ||
                                                                    doNotRenderCreatures.includes(creatureId) ||
                                                                    !(
                                                                        yourCreaturesToPick[3] > 0 ||
                                                                        (isBan && canBanCreaturesByLevel[3])
                                                                    )
                                                                        ? "grayscale(100%)"
                                                                        : "none",
                                                                transform:
                                                                    selectedCreature === creatureId ||
                                                                    hoveredCreature === creatureId
                                                                        ? "scale(1.2) translateY(25%)"
                                                                        : "scale(1)",
                                                                animation:
                                                                    pickBanContext.isYourTurn &&
                                                                    !isBan &&
                                                                    pickBanContext.banned.length > 10 &&
                                                                    pickBanContext.banned[
                                                                        pickBanContext.banned.length - 1
                                                                    ] === creatureId
                                                                        ? "flicker 1s steps(2, start) 3"
                                                                        : "none",
                                                                opacity: doNotRenderCreatures.includes(creatureId)
                                                                    ? 0.8
                                                                    : 1,
                                                            }}
                                                        />
                                                        {selectedCreature === creatureId && (
                                                            <Tooltip title="Amount of units" placement="top">
                                                                <Badge
                                                                    badgeContent={selectedCreatureAmount}
                                                                    max={999}
                                                                    sx={{
                                                                        position: "absolute",
                                                                        zIndex: 104,
                                                                        transform: "rotateX(180deg)",
                                                                        bottom: "55%",
                                                                        cursor: "pointer",
                                                                        "& .MuiBadge-badge": {
                                                                            fontSize: "1.08rem", // Increase by 20%
                                                                            height: "26.4px", // Increase by 20%
                                                                            minWidth: "26.4px", // Increase by 20%
                                                                            color:
                                                                                isBan ||
                                                                                pickBanContext.banned.includes(
                                                                                    creatureId,
                                                                                ) ||
                                                                                doNotRenderCreatures.includes(
                                                                                    creatureId,
                                                                                )
                                                                                    ? "white"
                                                                                    : "black",
                                                                            backgroundColor:
                                                                                isBan ||
                                                                                pickBanContext.banned.includes(
                                                                                    creatureId,
                                                                                ) ||
                                                                                doNotRenderCreatures.includes(
                                                                                    creatureId,
                                                                                )
                                                                                    ? "black"
                                                                                    : "white",
                                                                            // border: "2px solid white", // Added white border
                                                                        },
                                                                    }}
                                                                />
                                                            </Tooltip>
                                                        )}
                                                    </>
                                                    {pickBanContext.banned.includes(creatureId) && (
                                                        <img
                                                            src={images.x_mark_2_512}
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
                                                                        ? "scale(1.2) translateY(25%) rotateY(180deg)"
                                                                        : "scale(1) rotateY(180deg)",
                                                                transition: "transform 0.2s ease-out",
                                                                animation:
                                                                    pickBanContext.isYourTurn &&
                                                                    !isBan &&
                                                                    pickBanContext.banned.length > 10 &&
                                                                    pickBanContext.banned[
                                                                        pickBanContext.banned.length - 1
                                                                    ] === creatureId
                                                                        ? "flicker 1s steps(2, start) 3"
                                                                        : "none",
                                                            }}
                                                        />
                                                    )}
                                                    {(pickBanContext.picked.includes(creatureId) ||
                                                        pickBanContext.opponentPicked.includes(creatureId)) && (
                                                        <img
                                                            src={checkmarkImage}
                                                            alt="checkmark"
                                                            style={{
                                                                position: "absolute",
                                                                width: "30%",
                                                                height: "30%",
                                                                top: "10%",
                                                                left: "10%",
                                                                objectFit: "contain",
                                                                transform:
                                                                    selectedCreature === creatureId ||
                                                                    hoveredCreature === creatureId
                                                                        ? "scale(1.2) translateY(55%) rotateX(180deg)"
                                                                        : "scale(1) rotateX(180deg)",
                                                                transition: "transform 0.2s ease-out",
                                                            }}
                                                        />
                                                    )}
                                                    {selectedCreature === creatureId &&
                                                        (yourCreaturesToPick[3] > 0 ||
                                                            (isBan && canBanCreaturesByLevel[3])) &&
                                                        poolPickable &&
                                                        !doNotRenderCreatures.includes(creatureId) && (
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
                                                                    onClick={handlePickOrBanClick}
                                                                    sx={{
                                                                        color: isBan ? "red" : "lightgreen",
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
                                                                            backgroundColor: isBan
                                                                                ? "#ff3333"
                                                                                : "#6EC475",
                                                                        },
                                                                    }}
                                                                >
                                                                    {isBan ? (
                                                                        <BlockIcon
                                                                            sx={{
                                                                                transform: "rotateX(180deg)",
                                                                                marginRight: "5px",
                                                                            }}
                                                                        />
                                                                    ) : (
                                                                        <CheckIcon
                                                                            sx={{
                                                                                transform: "rotateX(180deg)",
                                                                                marginRight: "5px",
                                                                            }}
                                                                        />
                                                                    )}
                                                                    <span
                                                                        style={{
                                                                            color: "white",
                                                                            transform: "rotateX(180deg)",
                                                                        }}
                                                                    >
                                                                        {isBan ? "Ban" : "Pick"}
                                                                    </span>
                                                                </IconButton>
                                                            </Box>
                                                        )}
                                                </div>
                                                {!doNotRenderCreatures.includes(creatureId) && (
                                                    <Box
                                                        className="unit-name"
                                                        sx={{
                                                            position: "absolute",
                                                            bottom: "100%",
                                                            left: "50%",
                                                            backgroundColor:
                                                                pickBanContext.banned.includes(creatureId) || isBan
                                                                    ? "rgba(0,0,0,0.8)"
                                                                    : "rgba(255,255,255,0.8)",
                                                            padding: "5px",
                                                            borderRadius: "5px",
                                                            color:
                                                                pickBanContext.banned.includes(creatureId) || isBan
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
                                    borderTopLeftRadius: "100%",
                                    borderTopRightRadius: "100%",
                                    zIndex: 60,
                                    "&::before": {
                                        content: '""',
                                        position: "absolute",
                                        top: "-180%",
                                        left: 5,
                                        right: "50%",
                                        bottom: 0,
                                        background:
                                            "linear-gradient(to right, rgba(0, 0, 0, 1), rgba(0, 0, 0, 0.7), transparent)",
                                        borderTopLeftRadius: "200%",
                                        pointerEvents: "none",
                                        zIndex: -1,
                                    },
                                    "&::after": {
                                        content: '""',
                                        position: "absolute",
                                        top: "-180%",
                                        left: "50%",
                                        right: 5,
                                        bottom: 0,
                                        background:
                                            "linear-gradient(to left, rgba(0, 0, 0, 1), rgba(0, 0, 0, 0.7), transparent)",
                                        borderTopRightRadius: "200%",
                                        pointerEvents: "none",
                                        zIndex: -1,
                                    },
                                }}
                            >
                                <Box
                                    sx={{
                                        position: "absolute",
                                        top: "-2%",
                                        left: "50%",
                                        transform: "translateX(-50%)",
                                        color: "#ffffff",
                                        fontWeight: "bold",
                                        fontSize: "1.2rem",
                                        textShadow: "2px 2px 8px #000000",
                                        zIndex: 91,
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
                                            top: "12%",
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
                                                className="creature-image"
                                                sx={{
                                                    width: "10%",
                                                    height: "90%",
                                                    display: "flex",
                                                    alignItems: "center",
                                                    justifyContent: "center",
                                                    position: "relative",
                                                    zIndex:
                                                        selectedCreature === creatureId ||
                                                        hoveredCreature === creatureId
                                                            ? 92
                                                            : 62,
                                                    transition: "all 0.3s ease",
                                                    filter:
                                                        selectedCreature === creatureId ||
                                                        hoveredCreature === creatureId
                                                            ? pickBanContext.banned.includes(creatureId)
                                                                ? `drop-shadow(0px ${isChrome ? -40 : 40}px 25px rgba(255, 0, 0, 1))`
                                                                : `drop-shadow(0px ${isChrome ? -40 : 40}px 25px rgba(255, 255, 255, 0.9))`
                                                            : "drop-shadow(0px 0px 0px rgba(0,0,0,0))",
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
                                                    borderRadius:
                                                        selectedCreature === creatureId ||
                                                        hoveredCreature === creatureId
                                                            ? "50%"
                                                            : "none",
                                                    cursor: !doNotRenderCreatures.includes(creatureId)
                                                        ? "pointer"
                                                        : "default",
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
                                                        zIndex: 101,
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
                                                    if (doNotRenderCreatures.includes(creatureId)) {
                                                        setSelectedCreature(null);
                                                        setSelectedCreatureAmount(null);
                                                    } else {
                                                        handleCreatureClick(creatureId);
                                                    }
                                                }}
                                            >
                                                <div style={{ position: "relative", width: "100%", height: "100%" }}>
                                                    <>
                                                        <style>
                                                            {`
                                                                    @keyframes flicker {
                                                                        0% { opacity: 0; transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1); }
                                                                        49% { opacity: 0; transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1); }
                                                                        50% { opacity: 1; transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1); }
                                                                        100% { opacity: 1; transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1); }
                                                                    }
                                                                `}
                                                        </style>
                                                        <img
                                                            src={UNIT_ID_TO_IMAGE[creatureId]}
                                                            alt={`Creature ${creatureId}`}
                                                            style={{
                                                                width: "100%",
                                                                height: "100%",
                                                                objectFit: "contain",
                                                                borderRadius: "50%",
                                                                transition: "filter 0.3s ease, transform 0.3s ease",
                                                                filter:
                                                                    pickBanContext.banned.includes(creatureId) ||
                                                                    doNotRenderCreatures.includes(creatureId) ||
                                                                    !(
                                                                        yourCreaturesToPick[2] > 0 ||
                                                                        (isBan && canBanCreaturesByLevel[2])
                                                                    )
                                                                        ? "grayscale(100%)"
                                                                        : "none",
                                                                transform:
                                                                    selectedCreature === creatureId ||
                                                                    hoveredCreature === creatureId
                                                                        ? `scale(1.2) translateY(25%)`
                                                                        : "scale(1)",
                                                                animation:
                                                                    pickBanContext.isYourTurn &&
                                                                    !isBan &&
                                                                    pickBanContext.banned.length > 10 &&
                                                                    pickBanContext.banned[
                                                                        pickBanContext.banned.length - 1
                                                                    ] === creatureId
                                                                        ? "flicker 1s steps(2, start) 3"
                                                                        : "none",
                                                                opacity: doNotRenderCreatures.includes(creatureId)
                                                                    ? 0.8
                                                                    : 1,
                                                            }}
                                                        />
                                                        {selectedCreature === creatureId && (
                                                            <Tooltip title="Amount of units" placement="top">
                                                                <Badge
                                                                    badgeContent={selectedCreatureAmount}
                                                                    max={999}
                                                                    sx={{
                                                                        position: "absolute",
                                                                        zIndex: 104,
                                                                        transform: "rotateX(180deg)",
                                                                        bottom: "53%",
                                                                        cursor: "pointer",
                                                                        "& .MuiBadge-badge": {
                                                                            fontSize: "1.08rem", // Increase by 20%
                                                                            height: "26.4px", // Increase by 20%
                                                                            minWidth: "26.4px", // Increase by 20%
                                                                            color:
                                                                                isBan ||
                                                                                pickBanContext.banned.includes(
                                                                                    creatureId,
                                                                                ) ||
                                                                                doNotRenderCreatures.includes(
                                                                                    creatureId,
                                                                                )
                                                                                    ? "white"
                                                                                    : "black",
                                                                            backgroundColor:
                                                                                isBan ||
                                                                                pickBanContext.banned.includes(
                                                                                    creatureId,
                                                                                ) ||
                                                                                doNotRenderCreatures.includes(
                                                                                    creatureId,
                                                                                )
                                                                                    ? "black"
                                                                                    : "white",
                                                                            // border: "2px solid white", // Added white border
                                                                        },
                                                                    }}
                                                                />
                                                            </Tooltip>
                                                        )}
                                                    </>
                                                    {pickBanContext.banned.includes(creatureId) && (
                                                        <img
                                                            src={images.x_mark_2_512}
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
                                                                        ? "scale(1.2) translateY(25%) rotateY(180deg)"
                                                                        : "scale(1) rotateY(180deg)",
                                                                transition: "transform 0.2s ease-out",
                                                                animation:
                                                                    pickBanContext.isYourTurn &&
                                                                    !isBan &&
                                                                    pickBanContext.banned.length > 10 &&
                                                                    pickBanContext.banned[
                                                                        pickBanContext.banned.length - 1
                                                                    ] === creatureId
                                                                        ? "flicker 1s steps(2, start) 3"
                                                                        : "none",
                                                            }}
                                                        />
                                                    )}
                                                    {(pickBanContext.picked.includes(creatureId) ||
                                                        pickBanContext.opponentPicked.includes(creatureId)) && (
                                                        <img
                                                            src={checkmarkImage}
                                                            alt="checkmark"
                                                            style={{
                                                                position: "absolute",
                                                                width: "30%",
                                                                height: "30%",
                                                                top: "10%",
                                                                left: "10%",
                                                                objectFit: "contain",
                                                                transform:
                                                                    selectedCreature === creatureId ||
                                                                    hoveredCreature === creatureId
                                                                        ? "scale(1.2) translateY(55%) rotateX(180deg)"
                                                                        : "scale(1) rotateX(180deg)",
                                                                transition: "transform 0.2s ease-out",
                                                            }}
                                                        />
                                                    )}
                                                    {selectedCreature === creatureId &&
                                                        (yourCreaturesToPick[2] > 0 ||
                                                            (isBan && canBanCreaturesByLevel[2])) &&
                                                        poolPickable &&
                                                        !doNotRenderCreatures.includes(creatureId) && (
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
                                                                    zIndex: 203,
                                                                    pointerEvents: "auto",
                                                                }}
                                                            >
                                                                <IconButton
                                                                    aria-label="accept"
                                                                    onClick={handlePickOrBanClick}
                                                                    sx={{
                                                                        color: isBan ? "red" : "lightgreen",
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
                                                                        zIndex: 203,
                                                                        "&:hover": {
                                                                            backgroundColor: isBan
                                                                                ? "#ff3333"
                                                                                : "#6EC475",
                                                                        },
                                                                    }}
                                                                >
                                                                    {isBan ? (
                                                                        <BlockIcon
                                                                            sx={{
                                                                                transform: "rotateX(180deg)",
                                                                                marginRight: "5px",
                                                                            }}
                                                                        />
                                                                    ) : (
                                                                        <CheckIcon
                                                                            sx={{
                                                                                transform: "rotateX(180deg)",
                                                                                marginRight: "5px",
                                                                            }}
                                                                        />
                                                                    )}
                                                                    <span
                                                                        style={{
                                                                            color: "white",
                                                                            transform: "rotateX(180deg)",
                                                                        }}
                                                                    >
                                                                        {isBan ? "Ban" : "Pick"}
                                                                    </span>
                                                                </IconButton>
                                                            </Box>
                                                        )}
                                                </div>
                                                {!doNotRenderCreatures.includes(creatureId) && (
                                                    <Box
                                                        className="unit-name"
                                                        sx={{
                                                            position: "absolute",
                                                            bottom: "100%",
                                                            left: "50%",
                                                            backgroundColor:
                                                                pickBanContext.banned.includes(creatureId) || isBan
                                                                    ? "rgba(0,0,0,0.8)"
                                                                    : "rgba(255,255,255,0.8)",
                                                            padding: "5px",
                                                            borderRadius: "5px",
                                                            color:
                                                                pickBanContext.banned.includes(creatureId) || isBan
                                                                    ? "white"
                                                                    : "black",
                                                            fontWeight: "bold",
                                                            fontSize: "0.9rem",
                                                            transform: "translate(-50%, 50%) rotate(180deg) scaleX(-1)",
                                                            whiteSpace: "nowrap",
                                                            pointerEvents: "none",
                                                            zIndex: 93,
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
                                    flex: 0.34,
                                    position: "relative",
                                    zIndex: 50,
                                    // "&::before": {
                                    //     content: '""',
                                    //     position: "absolute",
                                    //     top: 0,
                                    //     left: "50%",
                                    //     right: "3px",
                                    //     bottom: 0,
                                    //     background:
                                    //         "linear-gradient(to left, rgba(0, 0, 0, 1), rgba(0, 0, 0, 0.7), transparent)",
                                    //     pointerEvents: "none",
                                    //     zIndex: -1,
                                    // },
                                    // "&::after": {
                                    //     content: '""',
                                    //     position: "absolute",
                                    //     top: 0,
                                    //     right: "50%",
                                    //     bottom: 0,
                                    //     left: "3px",
                                    //     background:
                                    //         "linear-gradient(to right, rgba(0, 0, 0, 1), rgba(0, 0, 0, 0.7), transparent)",
                                    //     pointerEvents: "none",
                                    //     zIndex: -1,
                                    // },
                                }}
                            >
                                <Box
                                    sx={{
                                        position: "absolute",
                                        top: "-10%",
                                        left: "50%",
                                        transform: "translateX(-50%)",
                                        color: "#ffffff",
                                        fontWeight: "bold",
                                        fontSize: "1.2rem",
                                        textShadow: "2px 2px 8px #000000",
                                        zIndex: 99,
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
                                            top: "30%",
                                            left: "0%",
                                            width: "100%",
                                            height: "70%",
                                            transform: "rotate(180deg) scaleX(-1)",
                                            overflow: "visible",
                                        }}
                                    >
                                        {CreatureByLevel[1].map((creatureId: number) => (
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
                                                        selectedCreature === creatureId ||
                                                        hoveredCreature === creatureId
                                                            ? 91
                                                            : 62,
                                                    transform: "translateY(25%)",
                                                    transition: "all 0.3s ease",
                                                    filter:
                                                        selectedCreature === creatureId ||
                                                        hoveredCreature === creatureId
                                                            ? pickBanContext.banned.includes(creatureId)
                                                                ? `drop-shadow(0px ${isChrome ? -40 : 40}px 25px rgba(255, 0, 0, 1))`
                                                                : `drop-shadow(0px ${isChrome ? -40 : 40}px 25px rgba(255, 255, 255, 0.9))`
                                                            : "drop-shadow(0px 0px 0px rgba(0,0,0,0))",
                                                    borderRadius:
                                                        selectedCreature === creatureId ||
                                                        hoveredCreature === creatureId
                                                            ? "50%"
                                                            : "none",
                                                    cursor: !doNotRenderCreatures.includes(creatureId)
                                                        ? "pointer"
                                                        : "default",
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
                                                        zIndex: 101,
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
                                                    if (doNotRenderCreatures.includes(creatureId)) {
                                                        setSelectedCreature(null);
                                                        setSelectedCreatureAmount(null);
                                                    } else {
                                                        handleCreatureClick(creatureId);
                                                    }
                                                }}
                                            >
                                                <div style={{ position: "relative", width: "100%", height: "100%" }}>
                                                    <>
                                                        <style>
                                                            {`
                                                                    @keyframes flicker {
                                                                        0% { opacity: 0; transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1); }
                                                                        49% { opacity: 0; transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1); }
                                                                        50% { opacity: 1; transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1); }
                                                                        100% { opacity: 1; transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1); }
                                                                    }
                                                                `}
                                                        </style>
                                                        <img
                                                            src={UNIT_ID_TO_IMAGE[creatureId]}
                                                            alt={`Creature ${creatureId}`}
                                                            style={{
                                                                width: "100%",
                                                                height: "100%",
                                                                objectFit: "contain",
                                                                borderRadius: "50%",
                                                                transition: "filter 0.3s ease, transform 0.3s ease",
                                                                filter:
                                                                    pickBanContext.banned.includes(creatureId) ||
                                                                    doNotRenderCreatures.includes(creatureId) ||
                                                                    !(
                                                                        yourCreaturesToPick[1] > 0 ||
                                                                        (isBan && canBanCreaturesByLevel[1])
                                                                    )
                                                                        ? "grayscale(100%)"
                                                                        : "none",
                                                                transform:
                                                                    selectedCreature === creatureId ||
                                                                    hoveredCreature === creatureId
                                                                        ? `scale(1.2) translateY(24%)`
                                                                        : "scale(1)",
                                                                animation:
                                                                    pickBanContext.isYourTurn &&
                                                                    !isBan &&
                                                                    pickBanContext.banned.length > 10 &&
                                                                    pickBanContext.banned[
                                                                        pickBanContext.banned.length - 1
                                                                    ] === creatureId
                                                                        ? "flicker 1s steps(2, start) 3"
                                                                        : "none",
                                                                opacity: doNotRenderCreatures.includes(creatureId)
                                                                    ? 0.8
                                                                    : 1,
                                                            }}
                                                        />
                                                        {selectedCreature === creatureId && (
                                                            <Tooltip title="Amount of units" placement="top">
                                                                <Badge
                                                                    badgeContent={selectedCreatureAmount}
                                                                    max={999}
                                                                    sx={{
                                                                        position: "absolute",
                                                                        zIndex: 104,
                                                                        transform: "rotateX(180deg)",
                                                                        bottom: "56%",
                                                                        cursor: "pointer",
                                                                        "& .MuiBadge-badge": {
                                                                            fontSize: "1.08rem", // Increase by 20%
                                                                            height: "26.4px", // Increase by 20%
                                                                            minWidth: "26.4px", // Increase by 20%
                                                                            color:
                                                                                isBan ||
                                                                                pickBanContext.banned.includes(
                                                                                    creatureId,
                                                                                ) ||
                                                                                doNotRenderCreatures.includes(
                                                                                    creatureId,
                                                                                )
                                                                                    ? "white"
                                                                                    : "black",
                                                                            backgroundColor:
                                                                                isBan ||
                                                                                pickBanContext.banned.includes(
                                                                                    creatureId,
                                                                                ) ||
                                                                                doNotRenderCreatures.includes(
                                                                                    creatureId,
                                                                                )
                                                                                    ? "black"
                                                                                    : "white",
                                                                            // border: "2px solid white", // Added white border
                                                                        },
                                                                    }}
                                                                />
                                                            </Tooltip>
                                                        )}
                                                    </>
                                                    {pickBanContext.banned.includes(creatureId) && (
                                                        <img
                                                            src={images.x_mark_2_512}
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
                                                                        ? "scale(1.2) translateY(25%) rotateY(180deg)"
                                                                        : "scale(1) rotateY(180deg)",
                                                                transition: "transform 0.2s ease-out",
                                                                animation:
                                                                    pickBanContext.isYourTurn &&
                                                                    !isBan &&
                                                                    pickBanContext.banned.length > 10 &&
                                                                    pickBanContext.banned[
                                                                        pickBanContext.banned.length - 1
                                                                    ] === creatureId
                                                                        ? "flicker 1s steps(2, start) 3"
                                                                        : "none",
                                                            }}
                                                        />
                                                    )}
                                                    {(pickBanContext.picked.includes(creatureId) ||
                                                        pickBanContext.opponentPicked.includes(creatureId)) && (
                                                        <img
                                                            src={checkmarkImage}
                                                            alt="checkmark"
                                                            style={{
                                                                position: "absolute",
                                                                width: "30%",
                                                                height: "30%",
                                                                top: "10%",
                                                                left: "10%",
                                                                objectFit: "contain",
                                                                transform:
                                                                    selectedCreature === creatureId ||
                                                                    hoveredCreature === creatureId
                                                                        ? "scale(1.2) translateY(55%) rotateX(180deg)"
                                                                        : "scale(1) rotateX(180deg)",
                                                                transition: "transform 0.2s ease-out",
                                                            }}
                                                        />
                                                    )}
                                                    {selectedCreature === creatureId &&
                                                        (yourCreaturesToPick[1] > 0 ||
                                                            (isBan && canBanCreaturesByLevel[1])) &&
                                                        poolPickable &&
                                                        !doNotRenderCreatures.includes(creatureId) && (
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
                                                                    zIndex: 205,
                                                                    pointerEvents: "auto",
                                                                }}
                                                            >
                                                                <IconButton
                                                                    aria-label="accept"
                                                                    onClick={handlePickOrBanClick}
                                                                    sx={{
                                                                        color: isBan ? "red" : "lightgreen",
                                                                        marginRight: "3%",
                                                                        marginTop: "0%",
                                                                        borderRadius: "20px",
                                                                        boxShadow: "0 0 10px #ffffff",
                                                                        border: "2px solid white",
                                                                        paddingLeft: "10px",
                                                                        paddingRight: "10px",
                                                                        display: "flex",
                                                                        alignItems: "center",
                                                                        backgroundColor: "#000000",
                                                                        transform: "scale(0.8)",
                                                                        zIndex: 205,
                                                                        "&:hover": {
                                                                            backgroundColor: isBan
                                                                                ? "#ff3333"
                                                                                : "#6EC475",
                                                                        },
                                                                    }}
                                                                >
                                                                    {isBan ? (
                                                                        <BlockIcon
                                                                            sx={{
                                                                                transform: "rotateX(180deg)",
                                                                                marginRight: "5px",
                                                                            }}
                                                                        />
                                                                    ) : (
                                                                        <CheckIcon
                                                                            sx={{
                                                                                transform: "rotateX(180deg)",
                                                                                marginRight: "5px",
                                                                            }}
                                                                        />
                                                                    )}
                                                                    <span
                                                                        style={{
                                                                            color: "white",
                                                                            transform: "rotateX(180deg)",
                                                                        }}
                                                                    >
                                                                        {isBan ? "Ban" : "Pick"}
                                                                    </span>
                                                                </IconButton>
                                                            </Box>
                                                        )}
                                                </div>
                                                {!doNotRenderCreatures.includes(creatureId) && (
                                                    <Box
                                                        className="unit-name"
                                                        sx={{
                                                            position: "absolute",
                                                            bottom: "117%",
                                                            left: "50%",
                                                            backgroundColor:
                                                                pickBanContext.banned.includes(creatureId) || isBan
                                                                    ? "rgba(0,0,0,0.8)"
                                                                    : "rgba(255,255,255,0.8)",
                                                            padding: "5px",
                                                            borderRadius: "5px",
                                                            color:
                                                                pickBanContext.banned.includes(creatureId) || isBan
                                                                    ? "white"
                                                                    : "black",
                                                            fontWeight: "bold",
                                                            fontSize: "0.9rem",
                                                            transform: "translate(-50%, 50%) rotate(180deg) scaleX(-1)",
                                                            whiteSpace: "nowrap",
                                                            pointerEvents: "none",
                                                            zIndex: 92,
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
                                    flex: 0.3,
                                    position: "relative",
                                    zIndex: 40,
                                    "&::before": {
                                        content: '""',
                                        position: "absolute",
                                        top: "-113.3%",
                                        left: "50%",
                                        right: "3px",
                                        bottom: 0,
                                        background:
                                            "linear-gradient(to left, rgba(0, 0, 0, 1), rgba(0, 0, 0, 0.7), transparent)",
                                        pointerEvents: "none",
                                        zIndex: -1,
                                    },
                                    "&::after": {
                                        content: '""',
                                        position: "absolute",
                                        top: "-113.3%",
                                        right: "50%",
                                        bottom: 0,
                                        left: "3px",
                                        background:
                                            "linear-gradient(to right, rgba(0, 0, 0, 1), rgba(0, 0, 0, 0.7), transparent)",
                                        pointerEvents: "none",
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
                                        zIndex: 98,
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
                                            top: "26%",
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
                                                className="creature-image"
                                                sx={{
                                                    width: "10%",
                                                    height: "90%",
                                                    display: "flex",
                                                    alignItems: "center",
                                                    justifyContent: "center",
                                                    position: "relative",
                                                    zIndex:
                                                        selectedCreature === creatureId ||
                                                        hoveredCreature === creatureId
                                                            ? 90
                                                            : 62,
                                                    transform: "translateY(25%)",
                                                    transition: "all 0.3s ease",
                                                    filter:
                                                        selectedCreature === creatureId ||
                                                        hoveredCreature === creatureId
                                                            ? pickBanContext.banned.includes(creatureId)
                                                                ? `drop-shadow(0px ${isChrome ? -40 : 40}px 25px rgba(255, 0, 0, 1))`
                                                                : `drop-shadow(0px ${isChrome ? -40 : 40}px 25px rgba(255, 255, 255, 0.9))`
                                                            : "drop-shadow(0px 0px 0px rgba(0,0,0,0))",
                                                    borderRadius:
                                                        selectedCreature === creatureId ||
                                                        hoveredCreature === creatureId
                                                            ? "50%"
                                                            : "none",
                                                    cursor: !doNotRenderCreatures.includes(creatureId)
                                                        ? "pointer"
                                                        : "default",
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
                                                        zIndex: 102,
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
                                                    if (doNotRenderCreatures.includes(creatureId)) {
                                                        setSelectedCreature(null);
                                                        setSelectedCreatureAmount(null);
                                                    } else {
                                                        handleCreatureClick(creatureId);
                                                    }
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        position: "relative",
                                                        width: "100%",
                                                        height: "100%",
                                                    }}
                                                >
                                                    <>
                                                        <style>
                                                            {`
                                                                    @keyframes flicker {
                                                                        0% { opacity: 0; transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1); }
                                                                        49% { opacity: 0; transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1); }
                                                                        50% { opacity: 1; transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1); }
                                                                        100% { opacity: 1; transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1); }
                                                                    }
                                                                `}
                                                        </style>
                                                        <img
                                                            src={UNIT_ID_TO_IMAGE[creatureId]}
                                                            alt={`Creature ${creatureId}`}
                                                            style={{
                                                                width: "100%",
                                                                height: "100%",
                                                                objectFit: "contain",
                                                                borderRadius: "50%",
                                                                transition: "filter 0.3s ease, transform 0.3s ease",
                                                                filter:
                                                                    pickBanContext.banned.includes(creatureId) ||
                                                                    doNotRenderCreatures.includes(creatureId) ||
                                                                    !(
                                                                        yourCreaturesToPick[0] > 0 ||
                                                                        (isBan && canBanCreaturesByLevel[0])
                                                                    )
                                                                        ? "grayscale(100%)"
                                                                        : "none",
                                                                transform:
                                                                    selectedCreature === creatureId ||
                                                                    hoveredCreature === creatureId
                                                                        ? `scale(1.2) translateY(25%)`
                                                                        : "scale(1)",
                                                                pointerEvents: "none",
                                                                animation:
                                                                    pickBanContext.isYourTurn &&
                                                                    !isBan &&
                                                                    pickBanContext.banned.length > 10 &&
                                                                    pickBanContext.banned[
                                                                        pickBanContext.banned.length - 1
                                                                    ] === creatureId
                                                                        ? "flicker 1s steps(2, start) 3"
                                                                        : "none",
                                                                opacity: doNotRenderCreatures.includes(creatureId)
                                                                    ? 0.8
                                                                    : 1,
                                                            }}
                                                        />
                                                        {selectedCreature === creatureId && (
                                                            <Tooltip title="Amount of units" placement="top">
                                                                <Badge
                                                                    badgeContent={selectedCreatureAmount}
                                                                    max={999}
                                                                    sx={{
                                                                        position: "absolute",
                                                                        zIndex: 104,
                                                                        transform: "rotateX(180deg)",
                                                                        bottom: "53%",
                                                                        cursor: "pointer",
                                                                        "& .MuiBadge-badge": {
                                                                            fontSize: "1.08rem", // Increase by 20%
                                                                            height: "26.4px", // Increase by 20%
                                                                            minWidth: "26.4px", // Increase by 20%
                                                                            color:
                                                                                isBan ||
                                                                                pickBanContext.banned.includes(
                                                                                    creatureId,
                                                                                ) ||
                                                                                doNotRenderCreatures.includes(
                                                                                    creatureId,
                                                                                )
                                                                                    ? "white"
                                                                                    : "black",
                                                                            backgroundColor:
                                                                                isBan ||
                                                                                pickBanContext.banned.includes(
                                                                                    creatureId,
                                                                                ) ||
                                                                                doNotRenderCreatures.includes(
                                                                                    creatureId,
                                                                                )
                                                                                    ? "black"
                                                                                    : "white",
                                                                            // border: "2px solid white", // Added white border
                                                                        },
                                                                    }}
                                                                />
                                                            </Tooltip>
                                                        )}
                                                    </>
                                                    {pickBanContext.banned.includes(creatureId) && (
                                                        <img
                                                            src={images.x_mark_2_512}
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
                                                                        ? "scale(1.2) translateY(25%) rotateY(180deg)"
                                                                        : "scale(1) rotateY(180deg)",
                                                                transition: "transform 0.2s ease-out",
                                                                pointerEvents: "none",
                                                                animation:
                                                                    pickBanContext.isYourTurn &&
                                                                    !isBan &&
                                                                    pickBanContext.banned.length > 10 &&
                                                                    pickBanContext.banned[
                                                                        pickBanContext.banned.length - 1
                                                                    ] === creatureId
                                                                        ? "flicker 1s steps(2, start) 3"
                                                                        : "none",
                                                            }}
                                                        />
                                                    )}
                                                    {(pickBanContext.picked.includes(creatureId) ||
                                                        pickBanContext.opponentPicked.includes(creatureId)) && (
                                                        <img
                                                            src={checkmarkImage}
                                                            alt="checkmark"
                                                            style={{
                                                                position: "absolute",
                                                                width: "30%",
                                                                height: "30%",
                                                                top: "10%",
                                                                left: "10%",
                                                                objectFit: "contain",
                                                                transform:
                                                                    selectedCreature === creatureId ||
                                                                    hoveredCreature === creatureId
                                                                        ? "scale(1.2) translateY(55%) rotateX(180deg)"
                                                                        : "scale(1) rotateX(180deg)",
                                                                transition: "transform 0.2s ease-out",
                                                            }}
                                                        />
                                                    )}
                                                    {selectedCreature === creatureId &&
                                                        (yourCreaturesToPick[0] > 0 ||
                                                            (isBan && canBanCreaturesByLevel[0])) &&
                                                        poolPickable &&
                                                        !doNotRenderCreatures.includes(creatureId) && (
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
                                                                    zIndex: 205,
                                                                    pointerEvents: "auto",
                                                                }}
                                                            >
                                                                <IconButton
                                                                    aria-label="accept"
                                                                    onClick={handlePickOrBanClick}
                                                                    sx={{
                                                                        color: isBan ? "red" : "lightgreen",
                                                                        marginRight: "3%",
                                                                        marginTop: index % 2 !== 0 ? "-66%" : "0%",
                                                                        borderRadius: "20px",
                                                                        boxShadow: "0 0 10px #ffffff",
                                                                        border: "2px solid white",
                                                                        paddingLeft: "10px",
                                                                        paddingRight: "10px",
                                                                        display: "flex",
                                                                        alignItems: "center",
                                                                        backgroundColor: "#000000",
                                                                        transform: "scale(0.8)",
                                                                        zIndex: 205,
                                                                        "&:hover": {
                                                                            backgroundColor: isBan
                                                                                ? "#ff3333"
                                                                                : "#6EC475",
                                                                        },
                                                                    }}
                                                                >
                                                                    {isBan ? (
                                                                        <BlockIcon
                                                                            sx={{
                                                                                transform: "rotateX(180deg)",
                                                                                marginRight: "5px",
                                                                            }}
                                                                        />
                                                                    ) : (
                                                                        <CheckIcon
                                                                            sx={{
                                                                                transform: "rotateX(180deg)",
                                                                                marginRight: "5px",
                                                                            }}
                                                                        />
                                                                    )}
                                                                    <span
                                                                        style={{
                                                                            color: "white",
                                                                            transform: "rotateX(180deg)",
                                                                        }}
                                                                    >
                                                                        {isBan ? "Ban" : "Pick"}
                                                                    </span>
                                                                </IconButton>
                                                            </Box>
                                                        )}
                                                </div>
                                                {!doNotRenderCreatures.includes(creatureId) && (
                                                    <Box
                                                        className="unit-name"
                                                        sx={{
                                                            position: "absolute",
                                                            bottom: "115%",
                                                            left: "50%",
                                                            backgroundColor:
                                                                pickBanContext.banned.includes(creatureId) || isBan
                                                                    ? "rgba(0,0,0,0.8)"
                                                                    : "rgba(255,255,255,0.8)",
                                                            padding: "5px",
                                                            borderRadius: "5px",
                                                            color:
                                                                pickBanContext.banned.includes(creatureId) || isBan
                                                                    ? "white"
                                                                    : "black",
                                                            fontWeight: "bold",
                                                            fontSize: "0.9rem",
                                                            transform: "translate(-50%, 50%) rotate(180deg) scaleX(-1)",
                                                            whiteSpace: "nowrap",
                                                            pointerEvents: "none",
                                                            zIndex: 91,
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
                                    flex: errorMessage ? 0.46 : 0.45,
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
                                                  backgroundColor: infoMessage
                                                      ? "rgba(62, 135, 144, 0.9)"
                                                      : errorMessage
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
                                                textShadow: !errorMessage
                                                    ? "0 0 8px #ffffff, 0 0 15px #ffffff"
                                                    : "none", // Light around the text
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
                                                color: infoMessage
                                                    ? "white"
                                                    : pickBanContext.isYourTurn
                                                      ? isBan
                                                          ? "#ff3333"
                                                          : "#90ee90"
                                                      : "white",
                                                fontSize: "2rem", // Increase font size
                                                textShadow: infoMessage
                                                    ? "0 0 8px #ffffff, 0 0 15px #ffffff"
                                                    : pickBanContext.isYourTurn
                                                      ? isBan
                                                          ? "0 0 8px #ff3333, 0 0 15px #ff3333"
                                                          : "0 0 8px #90ee90, 0 0 15px #90ee90"
                                                      : "0 0 8px #ffffff, 0 0 15px #ffffff", // Light around the text
                                                animation: "lightAnimation 3s infinite",
                                                "@keyframes lightAnimation": {
                                                    "0%, 100%": { opacity: 1 },
                                                    "50%": { opacity: 0.4 },
                                                },
                                            }}
                                        >
                                            {infoMessage
                                                ? infoMessage
                                                : pickBanContext.isYourTurn === null
                                                  ? "Loading..."
                                                  : pickBanContext.isYourTurn
                                                    ? `Your time to ${isBan ? "ban" : "pick"}`
                                                    : `Waiting for opponent to ${isBan ? "ban" : "pick"}...`}
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
                                                        selectedCreatureAmount={selectedCreatureAmount}
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
                                                                    backgroundColor: "#6EC475",
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
                                                            <span style={{ color: "white" }}>
                                                                {isBan ? "Ban" : "Pick"}
                                                            </span>
                                                        </IconButton>
                                                    </Box>
                                                    <InitialCreatureImageBox
                                                        creatureId={initialCreaturesPairs[0][1]}
                                                        selectedCreature={selectedCreature}
                                                        selectedCreatureAmount={selectedCreatureAmount}
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
                                                        selectedCreatureAmount={selectedCreatureAmount}
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
                                                        selectedCreatureAmount={selectedCreatureAmount}
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
                                                                    backgroundColor: "#6EC475",
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
                                                            <span style={{ color: "white" }}>
                                                                {isBan ? "Ban" : "Pick"}
                                                            </span>
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
                                {modalClosed && !errorMessage && (
                                    <HelpQuestionMarkIcon setModalClosed={setModalClosed} />
                                )}
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
                                            background: hoveredAugmentsAndMapScout
                                                ? "linear-gradient(rgba(255, 255, 255, 0.4), transparent)"
                                                : "linear-gradient(to left, rgba(0, 0, 0, 1), transparent)",
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
                                                  backgroundColor: infoMessage
                                                      ? "rgba(62, 135, 144, 0.9)"
                                                      : errorMessage
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
                                                backgroundImage:
                                                    userTeam === TeamType.LOWER
                                                        ? `url(${overlayGreenImage})`
                                                        : userTeam === TeamType.UPPER
                                                          ? `url(${overlayRedImage})`
                                                          : "none",
                                                "&::before":
                                                    userTeam === TeamType.UPPER
                                                        ? {
                                                              content: '""',
                                                              position: "absolute",
                                                              top: 0,
                                                              left: 0,
                                                              width: "100%",
                                                              height: "100%",
                                                              background:
                                                                  "linear-gradient(0deg, rgba(255,0,0,0.1) 0%, rgba(0,0,0,0) 100%)",
                                                              pointerEvents: "none",
                                                          }
                                                        : {},
                                                "&:hover": {
                                                    zIndex: 10,
                                                },
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
                                                        "&:hover": {
                                                            zIndex: 4,
                                                        },
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
                                                                    selectedCreatureAmount={selectedCreatureAmount}
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
                                                        index - yourPickedCreatures.length in
                                                            yourCreaturesPoolByLevel &&
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

                                        <img
                                            src={crossSwordsImage}
                                            alt="Cross Swords"
                                            style={{
                                                position: "absolute",
                                                top: "35%",
                                                left: "50%",
                                                transform: "translate(-50%, -50%)",
                                                width: "4.5%",
                                                height: "auto",
                                                zIndex: 999,
                                                opacity: 0.9,
                                            }}
                                        />

                                        <Box
                                            sx={{
                                                flex: "1 0 50%",
                                                position: "relative",
                                                zIndex: 2,
                                                display: "flex",
                                                flexDirection: "row-reverse",
                                                height: "100%",
                                                backgroundColor: hoveredAllUnitsScout
                                                    ? "undefined"
                                                    : "rgba(0, 0, 0, 0.8)",
                                                background: hoveredAllUnitsScout
                                                    ? "linear-gradient(to top, rgba(255, 255, 255, 0.4), transparent)"
                                                    : "undefined",
                                            }}
                                        >
                                            {[...Array(6)].map((_, index) => (
                                                <Box
                                                    key={index}
                                                    sx={{
                                                        flex: "1 1 16.666%",
                                                        borderLeft:
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
                                                                Level{" "}
                                                                {opponentPickedCreatures[index]
                                                                    ? CreatureLevels[
                                                                          opponentPickedCreatures[
                                                                              index
                                                                          ] as keyof typeof CreatureLevels
                                                                      ]
                                                                    : opponentCreaturesPoolByLevel[index]
                                                                      ? opponentCreaturesPoolByLevel[index]
                                                                      : "?"}
                                                            </Box>
                                                            {opponentPickedCreatures[index] ? (
                                                                <InitialCreatureImageBox
                                                                    key={opponentPickedCreatures[index]}
                                                                    creatureId={opponentPickedCreatures[index]}
                                                                    selectedCreature={selectedCreature}
                                                                    selectedCreatureAmount={selectedCreatureAmount}
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
                                                                    setErrorMessage={setErrorMessage}
                                                                />
                                                            )}
                                                        </>
                                                    )}
                                                </Box>
                                            ))}
                                        </Box>
                                    </>
                                )}
                            </Box>
                        </Box>
                    )}
                </Sheet>
            </Box>
        </div>
    );
};

export default StainedGlassWindow;
