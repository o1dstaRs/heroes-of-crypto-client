import { CreatureByLevel } from "@heroesofcrypto/common";
import { Box, IconButton } from "@mui/joy";
import React, { useCallback } from "react";
import { UNIT_ID_TO_IMAGE } from "../unit_ui_constants";
import { usePickBanEvents } from "..";
import { images } from "../../generated/image_imports";
import revealSmallImage from "../../../images/icon_reveal_128.webp";
import { useAuthContext } from "../auth/context/auth_context";

export const RevealCreatureImageBox = ({
    creatureId,
    selectedCreature,
    hoveredCreature,
    initialCreaturesPairs,
    handleMouseEnter,
    handleMouseLeave,
    handleCreatureClick,
    hoverTimeoutRef,
    poolRevealable,
    transformY,
    setErrorMessage,
}: {
    creatureId: number;
    selectedCreature: number | null;
    hoveredCreature: number | null;
    initialCreaturesPairs: [number, number][];
    handleMouseEnter: (creatureId: number) => void;
    handleMouseLeave: () => void;
    handleCreatureClick: (creatureId: number) => void;
    hoverTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
    poolRevealable: boolean;
    transformY: boolean;
    setErrorMessage: React.Dispatch<React.SetStateAction<string | null>>;
}) => {
    const pickBanContext = usePickBanEvents();
    const { reveal } = useAuthContext();

    const handleRevealClick = useCallback(async () => {
        const slot = -creatureId;
        try {
            await reveal(slot);
        } catch (error) {
            if (typeof error === "string") {
                setErrorMessage(error);
            } else {
                setErrorMessage((error as Error).message);
            }
        }
    }, [creatureId, reveal, setErrorMessage]);

    return (
        <Box
            key={creatureId}
            className="creature-image"
            sx={{
                paddingBottom: "3%",
                width: transformY ? "100%" : "20%",
                height: transformY ? "auto" : "180%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
                zIndex: selectedCreature === creatureId || hoveredCreature === creatureId ? 92 : 72,
                transform:
                    !transformY &&
                    initialCreaturesPairs.length &&
                    initialCreaturesPairs[0].indexOf(creatureId) % 2 < CreatureByLevel[3].length / 2
                        ? "translateY(-15%) rotateX(180deg)"
                        : !transformY
                          ? "translateY(25%) rotateX(180deg)"
                          : "rotateX(180deg)",
                transition: "all 0.3s ease",
                filter:
                    selectedCreature === creatureId || hoveredCreature === creatureId
                        ? pickBanContext.banned.includes(creatureId)
                            ? "drop-shadow(0px -40px 25px rgba(255, 0, 0, 1))"
                            : "drop-shadow(0px -40px 25px rgba(115, 239, 245, 0.9))"
                        : "drop-shadow(0px 0px 0px rgba(0,0,0,0))",
                borderRadius: selectedCreature === creatureId || hoveredCreature === creatureId ? "50%" : "none",
                cursor: "pointer",
                "& .unit-name": {
                    visibility:
                        selectedCreature === creatureId || hoveredCreature === creatureId ? "visible" : "hidden",
                    opacity: selectedCreature === creatureId || hoveredCreature === creatureId ? 1 : 0,
                    transition: "opacity 0.3s ease, visibility 0.2s ease",
                    zIndex: selectedCreature === creatureId || hoveredCreature === creatureId ? 102 : 82,
                },
                marginLeft: "2%",
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
                    src={UNIT_ID_TO_IMAGE[0]}
                    alt={`Creature ${creatureId}`}
                    style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "contain",
                        borderRadius: "50%",
                        transition: "filter 0.3s ease, transform 0.3s ease",
                        filter: pickBanContext.banned.includes(creatureId) ? "grayscale(100%)" : "none",
                        transform:
                            selectedCreature === creatureId || hoveredCreature === creatureId
                                ? "scale(1.2) translateY(25%)"
                                : "scale(1)",
                    }}
                />
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
                                selectedCreature === creatureId || hoveredCreature === creatureId
                                    ? "scale(1.2) translateY(25%) rotateY(180deg)"
                                    : "scale(1) rotateY(180deg)",
                            transition: "transform 0.2s ease-out",
                        }}
                    />
                )}
                {selectedCreature === creatureId && poolRevealable && (
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
                            aria-label="reveal"
                            onClick={handleRevealClick}
                            sx={{
                                color: "#3B9B5C",
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
                                    backgroundColor: "rgb(62, 135, 144)",
                                    "&::after": {
                                        content: `url(${revealSmallImage})`,
                                        position: "absolute",
                                        left: "114%",
                                        top: "130%",
                                        transform: "translate(-50%, -50%) scale(0.48) rotateX(180deg)",
                                        width: "60%",
                                        height: "60%",
                                    },
                                },
                            }}
                        >
                            <span style={{ color: "white", transform: "rotateX(180deg)" }}>Reveal</span>
                        </IconButton>
                    </Box>
                )}
            </div>
            <Box
                className="unit-name"
                sx={{
                    position: "absolute",
                    bottom: transformY ? "110%" : "120%",
                    left: "50%",
                    backgroundColor: "rgba(0,0,0,0.8)",
                    padding: "5px",
                    borderRadius: "5px",
                    color: "white",
                    fontWeight: "bold",
                    fontSize: "0.9rem",
                    transform: "translate(-50%, 50%) rotate(180deg) scaleX(-1)",
                    whiteSpace: "nowrap",
                    pointerEvents: "none",
                    zIndex: 73,
                    textDecoration: pickBanContext.banned.includes(creatureId) ? "line-through" : "none",
                }}
            >
                Unknown
            </Box>
        </Box>
    );
};
