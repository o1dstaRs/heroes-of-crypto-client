import { getCreaturesByLevel } from "@heroesofcrypto/common";
import { Badge, Box } from "@mui/joy";
import { UNIT_ID_TO_IMAGE, UNIT_ID_TO_NAME } from "../unit_ui_constants";
import React from "react";
import { usePickBanEvents } from "@/ui";
import { images } from "../../generated/image_imports";

export const InitialCreatureImageBox = ({
    creatureId,
    selectedCreature,
    selectedCreatureAmount,
    hoveredCreature,
    initialCreaturesPairs,
    handleMouseEnter,
    handleMouseLeave,
    handleCreatureClick,
    hoverTimeoutRef,
    transformY,
}: {
    creatureId: number;
    selectedCreature: number | null;
    selectedCreatureAmount: number | null;
    hoveredCreature: number | null;
    initialCreaturesPairs: [number, number][];
    handleMouseEnter: (creatureId: number) => void;
    handleMouseLeave: () => void;
    handleCreatureClick: (creatureId: number) => void;
    hoverTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
    transformY: boolean;
}) => {
    const pickBanContext = usePickBanEvents();

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
                zIndex: !transformY
                    ? selectedCreature === creatureId || hoveredCreature === creatureId
                        ? 92
                        : 72
                    : undefined,
                transform:
                    !transformY &&
                    initialCreaturesPairs.length &&
                    initialCreaturesPairs[0].indexOf(creatureId) % 2 < getCreaturesByLevel(4).length / 2
                        ? "translateY(-15%)"
                        : !transformY
                          ? "translateY(25%)"
                          : "none",
                transition: "all 0.3s ease",
                filter:
                    selectedCreature === creatureId || hoveredCreature === creatureId
                        ? pickBanContext.banned.includes(creatureId)
                            ? "drop-shadow(0px -40px 25px rgba(255, 0, 0, 1))"
                            : "drop-shadow(0px -40px 25px rgba(255, 255, 255, 0.9))"
                        : "drop-shadow(0px 0px 0px rgba(0,0,0,0))",
                borderRadius: selectedCreature === creatureId || hoveredCreature === creatureId ? "50%" : "none",
                cursor: "pointer",
                // The box is much taller (180%) than the visible circular image, and its
                // transparent area overlaps neighbouring creatures, stealing their clicks.
                // Disable pointer events on the box and re-enable them only on the centered
                // square that wraps the image, so a click selects the creature you actually see.
                pointerEvents: "none",
                "& .unit-name": {
                    visibility:
                        selectedCreature === creatureId || hoveredCreature === creatureId ? "visible" : "hidden",
                    opacity: selectedCreature === creatureId || hoveredCreature === creatureId ? 1 : 0,
                    transition: "opacity 0.3s ease, visibility 0.2s ease",
                    zIndex: selectedCreature === creatureId || hoveredCreature === creatureId ? 102 : 82,
                },
                marginLeft: "2%",
            }}
        >
            <div
                onMouseEnter={() => {
                    if (hoverTimeoutRef.current) {
                        clearTimeout(hoverTimeoutRef.current);
                    }
                    handleMouseEnter(creatureId);
                }}
                onMouseLeave={handleMouseLeave}
                onClick={() => handleCreatureClick(creatureId)}
                style={{
                    position: "relative",
                    // Centered square that matches the visible (objectFit: contain) circular
                    // image; flex-centered by the parent box. Only this area is clickable.
                    width: "100%",
                    aspectRatio: "1 / 1",
                    pointerEvents: "auto",
                    cursor: "pointer",
                }}
            >
                <>
                    <img
                        src={UNIT_ID_TO_IMAGE[creatureId]}
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
                    {selectedCreature === creatureId && hoveredCreature === creatureId && (
                        <Badge
                            badgeContent={selectedCreatureAmount}
                            max={999}
                            sx={{
                                position: "absolute",
                                zIndex: 104,
                                transform: "none",
                                bottom: "50%",
                                cursor: "pointer",
                                "& .MuiBadge-badge": {
                                    fontSize: "1.08rem", // Increase by 20%
                                    height: "26.4px", // Increase by 20%
                                    minWidth: "26.4px", // Increase by 20%
                                    color: "black",
                                    backgroundColor: "white",
                                    // border: "2px solid white", // Added white border
                                },
                            }}
                        />
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
                                selectedCreature === creatureId || hoveredCreature === creatureId
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
                    bottom: transformY ? "110%" : "120%",
                    left: "50%",
                    backgroundColor: pickBanContext.banned.includes(creatureId)
                        ? "rgba(0,0,0,0.8)"
                        : "rgba(255,255,255,0.8)",
                    padding: "5px",
                    borderRadius: "5px",
                    color: pickBanContext.banned.includes(creatureId) ? "white" : "black",
                    fontWeight: "bold",
                    fontSize: "0.9rem",
                    transform: "translate(-50%, 50%)",
                    whiteSpace: "nowrap",
                    pointerEvents: "none",
                    zIndex: 73,
                    textDecoration: pickBanContext.banned.includes(creatureId) ? "line-through" : "none",
                }}
            >
                {UNIT_ID_TO_NAME[creatureId]}
            </Box>
        </Box>
    );
};
