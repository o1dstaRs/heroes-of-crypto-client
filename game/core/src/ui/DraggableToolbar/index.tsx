import React, { useState, useEffect } from "react";
import { Sheet, IconButton, Box, Divider } from "@mui/joy";
import { useTheme } from "@mui/joy/styles";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import RotateRightIcon from "@mui/icons-material/RotateRight";
import { styled, keyframes } from "@mui/system";

import spellbookIconImage from "../../../images/icon_spellbook.webp";
import hourglassIconImage from "../../../images/icon_hourglass.webp";
import swordIconImage from "../../../images/icon_sword.webp";
import aiIconImage from "../../../images/icon_ai.webp";
import skipIconImage from "../../../images/icon_skip.webp";
import luckShieldIconImage from "../../../images/icon_luck_shield.webp";
import brownImage from "../../../images/overlay_brown.webp";
import lightImage from "../../../images/overlay_light.webp";

const INITIAL_POSITION_Y = window.innerHeight / 4;
const INITIAL_POSITION_X = window.innerWidth - window.innerWidth / 9;

const DraggableToolbar = () => {
    const [position, setPosition] = useState({ x: INITIAL_POSITION_X, y: INITIAL_POSITION_Y });
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: INITIAL_POSITION_X, y: INITIAL_POSITION_Y });
    const [isVertical, setIsVertical] = useState(true);
    const theme = useTheme();

    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
        setIsDragging(true);
        setDragOffset({
            x: e.clientX - position.x,
            y: e.clientY - position.y,
        });
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (isDragging) {
            setPosition({
                x: e.clientX - dragOffset.x,
                y: e.clientY - dragOffset.y,
            });
        }
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    const handleRotate = () => {
        setIsVertical(!isVertical);
    };

    useEffect(() => {
        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);
        return () => {
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
        };
    }, [isDragging]);

    const isDark = theme.palette.mode === "dark";

    const frameStyle = {
        position: "absolute",
        content: '""',
        top: -4,
        left: -4,
        right: -4,
        bottom: -4,
        pointerEvents: "none",
    };

    const StyledSheet = styled(Sheet)({
        backgroundImage: `url(${isDark ? brownImage : lightImage})`,
        backgroundSize: "cover",
        border: "1px solid",
        borderColor: isDark ? "black" : "black",
        borderRadius: "10px",
        padding: "1rem",
        boxShadow: "0 0 10px rgba(0,0,0,0.5)",
    });

    const shineEffectWhite = keyframes`
      0% {
        box-shadow: 0 0 5px rgba(255, 255, 255, 0.3);
        filter: brightness(1) drop-shadow(0 0 5px rgba(255, 255, 255, 0.3));
      }
      50% {
        box-shadow: 0 0 20px rgba(255, 255, 255, 0.7), 0 0 30px rgba(255, 255, 255, 0.5);
        filter: brightness(1.2) drop-shadow(0 0 10px rgba(255, 255, 255, 0.5));
      }
      100% {
        box-shadow: 0 0 5px rgba(255, 255, 255, 0.3);
        filter: brightness(1) drop-shadow(0 0 5px rgba(255, 255, 255, 0.3));
      }
    `;

    const shineEffectRed = keyframes`
      0% {
        box-shadow: 0 0 5px rgba(139, 0, 0, 0.3);
        filter: brightness(1) drop-shadow(0 0 5px rgba(139, 0, 0, 0.3));
      }
      50% {
        box-shadow: 0 0 20px rgba(139, 0, 0, 0.7), 0 0 30px rgba(139, 0, 0, 0.5);
        filter: brightness(1.2) drop-shadow(0 0 10px rgba(139, 0, 0, 0.5));
      }
      100% {
        box-shadow: 0 0 5px rgba(139, 0, 0, 0.3);
        filter: brightness(1) drop-shadow(0 0 5px rgba(139, 0, 0, 0.3));
      }
    `;

    const createIconButton = (iconImage: string) =>
        styled(IconButton)({
            width: 64,
            height: 64,
            padding: 0,
            backgroundImage: `url(${iconImage})`,
            backgroundSize: "cover",
            transition: "all 0.3s ease",
            "&:hover": {
                animation: `${isDark ? shineEffectWhite : shineEffectRed} 1.5s infinite`,
                transform: "scale(1.05)",
                ...(!isDark && {
                    backgroundColor: "darkred", // Change the background color to dark red
                    boxShadow: "0 0 10px rgba(139, 0, 0, 0.5)",
                    filter: "brightness(1.1) drop-shadow(0 0 5px rgba(139, 0, 0, 0.5))",
                }),
                ...(isDark && {
                    boxShadow: "0 0 10px rgba(255, 255, 255, 0.5)",
                    filter: "brightness(1.1) drop-shadow(0 0 5px rgba(255, 255, 255, 0.5))",
                }),
            },
        });

    const SpellbookButton = createIconButton(spellbookIconImage);
    const HourglassButton = createIconButton(hourglassIconImage);
    const SwordButton = createIconButton(swordIconImage);
    const SkipButton = createIconButton(skipIconImage);
    const AIButton = createIconButton(aiIconImage);
    const LuckShieldButton = createIconButton(luckShieldIconImage);

    return (
        <StyledSheet
            sx={{
                position: "absolute",
                left: `${position.x}px`,
                top: `${position.y}px`,
                display: "flex",
                flexDirection: isVertical ? "column" : "row",
                alignItems: "center",
                gap: 1,
                zIndex: 4,
                "&::before": frameStyle,
                "&::after": {
                    ...frameStyle,
                    filter: "blur(4px)",
                    opacity: 0.7,
                },
            }}
        >
            <Box
                sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    bgcolor: isDark ? "rgba(255, 215, 0, 0.1)" : "rgba(53, 33, 0, 0.3)",
                    borderRadius: "sm",
                    p: 0.5,
                }}
            >
                <Box onMouseDown={handleMouseDown} sx={{ cursor: "move", display: "flex", alignItems: "center" }}>
                    <DragIndicatorIcon sx={{ color: isDark ? "#ff9e76" : "#352100", width: "auto", height: 32 }} />
                </Box>
                <IconButton
                    size="sm"
                    variant="plain"
                    onClick={handleRotate}
                    sx={{
                        width: "auto",
                        height: 32,
                        padding: 0,
                        margin: 0,
                        color: isDark ? "lightgrey" : "black",
                        "&:hover": {
                            backgroundColor: isDark ? "default" : "#8B0000",
                        },
                    }}
                >
                    <RotateRightIcon
                        sx={{
                            width: "auto",
                            height: 32,
                            color: isDark ? "lightgrey" : "black",
                        }}
                    />
                </IconButton>
            </Box>

            <Divider
                orientation={isVertical ? "horizontal" : "vertical"}
                sx={{ bgcolor: isDark ? "#ff9e76" : "#352100" }}
            />

            <HourglassButton onClick={() => console.log("Spell Book 1 clicked")} />
            <LuckShieldButton onClick={() => console.log("Spell Book 2 clicked")} />
            <SkipButton onClick={() => console.log("Spell Book 3 clicked")} />
            <AIButton onClick={() => console.log("Spell Book 4 clicked")} />
            <SwordButton onClick={() => console.log("Spell Book 5 clicked")} />
            <SpellbookButton onClick={() => console.log("Spell Book 6 clicked")} />
        </StyledSheet>
    );
};

export default DraggableToolbar;
