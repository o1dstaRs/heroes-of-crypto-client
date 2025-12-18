import React, { useState, useEffect, useCallback } from "react";
import { Sheet, Box, Divider, Tooltip } from "@mui/joy";
import { useTheme } from "@mui/joy/styles";
import { styled } from "@mui/system";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import RotateRightIcon from "@mui/icons-material/RotateRight";

import { images } from "../../generated/image_imports";
const spellbookIconImage = new URL("../../../images/icon_spellbook_black.webp", import.meta.url).toString();
const hourglassIconImage = new URL("../../../images/icon_hourglass_black.webp", import.meta.url).toString();
const swordIconImage = new URL("../../../images/icon_sword_black.webp", import.meta.url).toString();
const bowIconImage = new URL("../../../images/icon_bow_black.webp", import.meta.url).toString();
const scepterIconImage = new URL("../../../images/icon_scepter_black.webp", import.meta.url).toString();
const aiIconImage = new URL("../../../images/icon_ai_black.webp", import.meta.url).toString();
const aiOnIconImage = new URL("../../../images/icon_ai_on_black.webp", import.meta.url).toString();
const skipIconImage = new URL("../../../images/icon_skip_black.webp", import.meta.url).toString();
const luckShieldIconImage = new URL("../../../images/icon_luck_shield_black.webp", import.meta.url).toString();
const activeOptionIconImage = new URL("../../../images/icon_active_option.webp", import.meta.url).toString();
const inactiveOptionIconImage = new URL("../../../images/icon_inactive_option.webp", import.meta.url).toString();
const blackImage = new URL("../../../images/overlay_black.webp", import.meta.url).toString();
const lightImage = new URL("../../../images/overlay_light.webp", import.meta.url).toString();

import { IVisibleButton, VisibleButtonState } from "../../scenes/VisibleState";
import { useButtonContext } from "../context/ButtonContext";

let SCREEN_RATIO = Math.min(window.innerWidth / 1366, window.innerHeight / 768);

const BUTTON_NAME_TO_ICON_IMAGE: Record<string, string> = {
    [`Spellbook${VisibleButtonState.FIRST}`]: spellbookIconImage,
    [`Hourglass${VisibleButtonState.FIRST}`]: hourglassIconImage,
    [`AttackType${VisibleButtonState.FIRST}`]: swordIconImage,
    [`AttackType${VisibleButtonState.SECOND}`]: bowIconImage,
    [`AttackType${VisibleButtonState.THIRD}`]: scepterIconImage,
    [`AI${VisibleButtonState.FIRST}`]: aiIconImage,
    [`AI${VisibleButtonState.SECOND}`]: aiOnIconImage,
    [`Next${VisibleButtonState.FIRST}`]: skipIconImage,
    [`LuckShield${VisibleButtonState.FIRST}`]: luckShieldIconImage,
};

const ICON_IMAGE_NEED_ROTATE: Record<string, boolean> = {
    [spellbookIconImage]: false,
    [hourglassIconImage]: true,
    [swordIconImage]: false,
    [scepterIconImage]: false,
    [aiIconImage]: false,
    [aiOnIconImage]: false,
    [skipIconImage]: false,
    [luckShieldIconImage]: false,
};

const StyledSheet = styled(Sheet)(({ theme }) => ({
    backgroundImage: `url(${theme.palette.mode === "dark" ? blackImage : lightImage})`,
    backgroundSize: "cover",
    border: "1px solid",
    borderColor: theme.palette.mode === "dark" ? "black" : "black",
    borderRadius: `${7 * SCREEN_RATIO}px`,
    padding: `${0.7 * SCREEN_RATIO}rem`,
    boxShadow: `0 0 ${7 * SCREEN_RATIO}px rgba(0,0,0,0.5)`,
    transition: "left 0.5s ease, top 0.5s ease, flex-direction 0.5s ease",
}));

const StyledIconButton = styled("button", {
    shouldForwardProp: (prop) =>
        typeof prop === "string" && !["rotationDegrees", "isDark", "clickEffectNeeded"].includes(prop),
})<{ rotationDegrees: number; isDark: boolean; clickEffectNeeded?: boolean }>(
    ({ rotationDegrees, isDark, clickEffectNeeded }) => ({
        width: 45 * SCREEN_RATIO,
        height: 45 * SCREEN_RATIO,
        padding: 0,
        border: "none",
        borderRadius: "50%",
        backgroundSize: "contain",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center",
        transition: "all 0.3s ease",
        position: "relative",
        cursor: "pointer",
        transform: `rotate(${rotationDegrees}deg)`,
        backgroundColor: "transparent",
        "&:hover:not(:disabled)": {
            transform: `scale(1.15) rotate(${rotationDegrees}deg)`,
            ...(isDark
                ? {
                      boxShadow: `0 0 ${7 * SCREEN_RATIO}px rgba(255, 255, 255, 0.5)`,
                      filter: "brightness(1.1) drop-shadow(0 0 3.5px rgba(255, 255, 255, 0.5))",
                      backgroundColor: "rgba(255, 255, 255, 0.14)",
                  }
                : {
                      boxShadow: `0 0 ${7 * SCREEN_RATIO}px rgba(255, 0, 0, 0.5)`,
                      filter: "brightness(1.1) drop-shadow(0 0 3.5px rgba(255, 0, 0, 0.5))",
                      backgroundColor: "rgba(255, 0, 0, 0.14)",
                  }),
        },
        "&:disabled": {
            opacity: 0.5,
            cursor: "not-allowed",
        },
        "&:active:not(:disabled)": {
            ...(clickEffectNeeded
                ? {
                      transform: `scale(0.95) rotate(${rotationDegrees}deg)`,
                      boxShadow: `0 0 ${10.5 * SCREEN_RATIO}px rgba(0, 0, 0, 0.2)`,
                  }
                : {}),
        },
    }),
);

interface ButtonComponentProps {
    iconImage: string;
    text: string;
    isVisible: boolean;
    isDisabled: boolean;
    isDark: boolean;
    onClick?: () => void;
    isHourglass?: boolean;
    customSpriteName?: string;
    numberOfOptions?: number;
    selectedOption?: number;
}

const ButtonComponent: React.FC<ButtonComponentProps> = ({
    iconImage,
    text,
    isVisible,
    isDisabled,
    isDark,
    onClick,
    isHourglass = false,
    customSpriteName,
    numberOfOptions = 1,
    selectedOption = 1,
}) => {
    const [rotationDegrees, setRotationDegrees] = useState(0);
    const [transfusionEffect, setTransfusionEffect] = useState(false);

    const handleClick = useCallback(() => {
        if (isHourglass) {
            setRotationDegrees((prev) => prev + 180);
        } else if (customSpriteName) {
            setRotationDegrees(180);
        } else {
            setRotationDegrees(0);
        }
        if (onClick) {
            onClick();
        }
    }, [isHourglass, customSpriteName, onClick]);

    useEffect(() => {
        if (iconImage === spellbookIconImage && !isDisabled && !customSpriteName) {
            const interval = setInterval(() => {
                setTransfusionEffect(true);
                setTimeout(() => setTransfusionEffect(false), 1500);
            }, 4000);
            return () => clearInterval(interval);
        }
        return undefined;
    }, [iconImage, isDisabled, customSpriteName]);

    if (!isVisible) {
        return null;
    }

    const needRotate = ICON_IMAGE_NEED_ROTATE[iconImage] || !!customSpriteName;
    const initialRotation = needRotate ? 180 : 0;

    return (
        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <Box sx={{ display: "flex", alignItems: "center", height: 45 * SCREEN_RATIO }}>
                <Tooltip title={text} placement="top">
                    <StyledIconButton
                        onClick={handleClick}
                        disabled={isDisabled}
                        rotationDegrees={isHourglass ? rotationDegrees : initialRotation}
                        isDark={isDark}
                        clickEffectNeeded={iconImage !== spellbookIconImage && iconImage !== hourglassIconImage}
                        style={{
                            backgroundImage: `url(${iconImage})`,
                            width: 45 * SCREEN_RATIO,
                            height: 45 * SCREEN_RATIO,
                            filter: transfusionEffect ? "brightness(1.2)" : "none",
                            animation: transfusionEffect ? "transfusion 1.5s linear" : "none",
                            boxShadow: transfusionEffect
                                ? `0 0 ${14 * SCREEN_RATIO}px rgba(255, 255, 255, 0.7)`
                                : "none",
                        }}
                        data-clickeffectneeded={iconImage !== spellbookIconImage && iconImage !== hourglassIconImage}
                    />
                </Tooltip>
            </Box>
            {numberOfOptions > 1 && (
                <Box
                    sx={{
                        display: "flex",
                        justifyContent: "center",
                        marginTop: `${0.35 * SCREEN_RATIO}rem`,
                        position: "relative",
                        width: 45 * SCREEN_RATIO,
                        height: 9.1 * SCREEN_RATIO,
                    }}
                >
                    {Array.from({ length: numberOfOptions }, (_, index) => {
                        const angle = (index / (numberOfOptions - 1)) * Math.PI;
                        const x = (12.6 + 12.6 * Math.cos(angle) - 4.55) * SCREEN_RATIO;
                        const y = (5.6 * Math.sin(angle) - 4.55) * SCREEN_RATIO;
                        return (
                            <img
                                key={index}
                                src={
                                    numberOfOptions - index - 1 === selectedOption - 1
                                        ? activeOptionIconImage
                                        : inactiveOptionIconImage
                                }
                                alt={`Option ${index + 1}`}
                                style={{
                                    width: 9.1 * SCREEN_RATIO,
                                    height: 9.1 * SCREEN_RATIO,
                                    position: "absolute",
                                    left: `${x + 9.1 * SCREEN_RATIO}px`,
                                    top: `${y}px`,
                                }}
                            />
                        );
                    })}
                </Box>
            )}
        </Box>
    );
};

const getBarSize = (width: number, height: number) => {
    const widthRatio = width / 2048;
    const heightRatio = height / 2048;
    const scaleRatio = Math.min(widthRatio, heightRatio);
    const scaledBoardSize = 2048 * scaleRatio;
    const rightBarEndAtBoard = (width - scaledBoardSize) / 2;
    return rightBarEndAtBoard > 0 ? rightBarEndAtBoard : 0;
};

const DraggableToolbar: React.FC = () => {
    const updateScreenRatios = useCallback(() => {
        SCREEN_RATIO = Math.min(window.innerWidth / 1366, window.innerHeight / 768);
    }, []);

    const getDefaultSettings = useCallback((): { x: number; y: number; isVertical: boolean } => {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const isLandscape = width / height >= 16 / 9;
        const barSize = getBarSize(width, height);

        // Landscape: Left side (right edge of Left Sidebar)
        // Vertical: Right side (left edge of Right Sidebar)
        const x = isLandscape ? barSize : width - barSize;

        return {
            x: x,
            y: height / 4,
            isVertical: true,
        };
    }, []);

    const [position, setPosition] = useState<{ x: number; y: number }>(() => {
        const ds = getDefaultSettings();
        return { x: ds.x, y: ds.y };
    });

    const [isDragging, setIsDragging] = useState<boolean>(false);
    const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const [isVertical, setIsVertical] = useState<boolean>(() => getDefaultSettings().isVertical);
    const theme = useTheme();

    const { buttons: buttonGroup, propagateClick } = useButtonContext();
    const toolbarRef = React.useRef<HTMLDivElement>(null);

    const resetToDefaultPosition = useCallback(() => {
        const ds = getDefaultSettings();
        setPosition({ x: ds.x, y: ds.y });
        setIsVertical(ds.isVertical);
    }, [getDefaultSettings]);

    useEffect(() => {
        const resetPositionIfNeeded = () => {
            const ds = getDefaultSettings();
            setPosition((prevPosition) => {
                const dragIndicatorPosition = {
                    x: prevPosition.x,
                    y: prevPosition.y,
                };

                // If currently off-screen (or uninitialized), reset to default
                if (
                    dragIndicatorPosition.x < -50 ||
                    dragIndicatorPosition.y < -50 ||
                    dragIndicatorPosition.x > window.innerWidth ||
                    dragIndicatorPosition.y > window.innerHeight
                ) {
                    return { x: ds.x, y: ds.y };
                }

                // If the screen resized significantly, we might want to snap back or clamp?
                // For now, let's keep the user's manual position UNLESS it's lost.
                // But the user constraint implies "appear at..." which is initial.

                return prevPosition;
            });
            setIsVertical(ds.isVertical);
        };

        // Run once on mount to set initial correct position
        // This is now handled by the functional useState initializer for position and isVertical.
        // const ds = getDefaultSettings();
        // setPosition({ x: ds.x, y: ds.y });

        const handleResizeOrZoom = () => {
            updateScreenRatios();
            resetPositionIfNeeded();
        };

        window.addEventListener("resize", handleResizeOrZoom);
        window.addEventListener("zoom", handleResizeOrZoom as EventListener);
        document.addEventListener("fullscreenchange", resetToDefaultPosition);

        return () => {
            window.removeEventListener("resize", handleResizeOrZoom);
            window.removeEventListener("zoom", handleResizeOrZoom as EventListener);
            document.removeEventListener("fullscreenchange", resetToDefaultPosition);
        };
    }, [updateScreenRatios, buttonGroup.length, isVertical, resetToDefaultPosition, getDefaultSettings]);

    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
        setIsDragging(true);
        setDragOffset({
            x: e.clientX - position.x,
            y: e.clientY - position.y,
        });
    };

    const handleMouseMove = useCallback(
        (e: MouseEvent) => {
            if (isDragging && toolbarRef.current) {
                const rect = toolbarRef.current.getBoundingClientRect();
                const width = rect.width;
                const height = rect.height;

                let newX = e.clientX - dragOffset.x;
                let newY = e.clientY - dragOffset.y;

                // Clamp to window boundaries
                newX = Math.max(0, Math.min(newX, window.innerWidth - width));
                newY = Math.max(0, Math.min(newY, window.innerHeight - height));

                setPosition({
                    x: newX,
                    y: newY,
                });
            }
        },
        [isDragging, dragOffset, toolbarRef],
    );

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
    }, []);

    useEffect(() => {
        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);
        return () => {
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
        };
    }, [handleMouseMove, handleMouseUp]);

    const handleRotate = () => {
        setIsVertical(!isVertical);
    };

    const isDark = theme.palette.mode === "dark";

    const getButtonIcon = (button: IVisibleButton) => {
        if (button.customSpriteName) {
            // @ts-ignore: src params
            return images[button.customSpriteName];
        }
        return BUTTON_NAME_TO_ICON_IMAGE[`${button.name}${button.state}`];
    };

    return buttonGroup.length > 0 ? (
        <StyledSheet
            ref={toolbarRef}
            sx={{
                position: "absolute",
                left: `${position.x}px`,
                top: `${position.y}px`,
                display: "flex",
                flexDirection: isVertical ? "column" : "row",
                alignItems: "center",
                gap: 1.5,
                zIndex: 1000,
                cursor: isDragging ? "grabbing" : "default",
                userSelect: "none",
            }}
            onMouseDown={handleMouseDown}
        >
            <Box
                sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0,
                    marginBottom: isVertical ? 0 : 0,
                    marginRight: isVertical ? 0 : 0,
                    cursor: "grab",
                    color: isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)",
                    "&:hover": {
                        color: isDark ? "white" : "black",
                    },
                }}
            >
                <DragIndicatorIcon />
            </Box>

            <Divider orientation={isVertical ? "horizontal" : "vertical"} />

            <Box
                sx={{
                    display: "flex",
                    flexDirection: isVertical ? "column" : "row",
                    gap: 1.5,
                }}
            >
                {buttonGroup.map((button) => (
                    <ButtonComponent
                        key={button.name}
                        iconImage={getButtonIcon(button)}
                        text={button.name}
                        isVisible={button.isVisible}
                        isDisabled={button.isDisabled}
                        isDark={isDark}
                        onClick={() => propagateClick(button.name, button.state)}
                        isHourglass={button.name === "Hourglass"}
                        customSpriteName={button.customSpriteName}
                        numberOfOptions={button.numberOfOptions}
                        selectedOption={button.selectedOption}
                    />
                ))}
            </Box>

            <Divider orientation={isVertical ? "horizontal" : "vertical"} />

            <Tooltip title="Rotate Toolbar" variant="soft">
                <StyledIconButton
                    rotationDegrees={0} // No rotation for the icon itself
                    isDark={isDark}
                    onClick={handleRotate}
                    sx={{
                        width: "auto",
                        height: "auto",
                        padding: "4px",
                        borderRadius: "50%",
                        color: isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)",
                        "&:hover": {
                            backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)",
                            color: isDark ? "white" : "black",
                            transform: "scale(1.1)",
                        },
                    }}
                >
                    <RotateRightIcon />
                </StyledIconButton>
            </Tooltip>
        </StyledSheet>
    ) : null;
};

export default DraggableToolbar;
