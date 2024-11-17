import React, { useState, useEffect, useCallback } from "react";
import { Sheet, Box, Divider, Tooltip } from "@mui/joy";
import { useTheme } from "@mui/joy/styles";
import { styled } from "@mui/system";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import RotateRightIcon from "@mui/icons-material/RotateRight";

import { images } from "../../generated/image_imports";
import spellbookIconImage from "../../../images/icon_spellbook_black.webp";
import hourglassIconImage from "../../../images/icon_hourglass_black.webp";
import swordIconImage from "../../../images/icon_sword_black.webp";
import bowIconImage from "../../../images/icon_bow_black.webp";
import scepterIconImage from "../../../images/icon_scepter_black.webp";
import aiIconImage from "../../../images/icon_ai_black.webp";
import aiOnIconImage from "../../../images/icon_ai_on_black.webp";
import skipIconImage from "../../../images/icon_skip_black.webp";
import luckShieldIconImage from "../../../images/icon_luck_shield_black.webp";
import activeOptionIconImage from "../../../images/icon_active_option.webp";
import inactiveOptionIconImage from "../../../images/icon_inactive_option.webp";
import blackImage from "../../../images/overlay_black.webp";
import lightImage from "../../../images/overlay_light.webp";
import { useManager } from "../../manager";
import { IVisibleButton, VisibleButtonState } from "../../state/visible_state";

let SCREEN_RATIO = Math.min(window.innerWidth / 1366, window.innerHeight / 768);

const getDefaultSettings = (): { x: number; y: number; isVertical: boolean } => {
    return {
        x: window.innerHeight + (window.innerWidth - window.innerHeight) / 2,
        y: window.innerHeight / 4,
        isVertical: true,
    };
};

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

const DraggableToolbar: React.FC = () => {
    const defaultSettings = getDefaultSettings();
    const [position, setPosition] = useState<{ x: number; y: number }>({
        x: defaultSettings.x,
        y: defaultSettings.y,
    });
    const [isDragging, setIsDragging] = useState<boolean>(false);
    const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const [isVertical, setIsVertical] = useState<boolean>(defaultSettings.isVertical);
    const [buttonGroupChanged, setButtonGroupChanged] = useState<boolean>(false);
    const [buttonGroup, setButtonGroup] = useState<IVisibleButton[]>([]);
    const theme = useTheme();
    const manager = useManager();

    const resetToDefaultPosition = useCallback(() => {
        const ds = getDefaultSettings();
        setPosition({ x: ds.x, y: ds.y });
        setIsVertical(ds.isVertical);
    }, []);

    const updateScreenRatios = useCallback(() => {
        SCREEN_RATIO = Math.min(window.innerWidth / 1366, window.innerHeight / 768);
    }, []);

    useEffect(() => {
        const resetPositionIfNeeded = () => {
            const ds = getDefaultSettings();
            setPosition((prevPosition) => {
                const dragIndicatorPosition = {
                    x: prevPosition.x,
                    y: prevPosition.y,
                };

                if (
                    dragIndicatorPosition.x < -20 ||
                    dragIndicatorPosition.y < -20 ||
                    dragIndicatorPosition.x + 45 * SCREEN_RATIO > window.innerWidth ||
                    dragIndicatorPosition.y + 45 * SCREEN_RATIO > window.innerHeight
                ) {
                    return { x: ds.x, y: ds.y };
                }

                return prevPosition;
            });
            setIsVertical(ds.isVertical);
        };

        const handleResizeOrZoom = () => {
            updateScreenRatios();
            resetPositionIfNeeded();
        };

        window.addEventListener("resize", handleResizeOrZoom);
        window.addEventListener("zoom", handleResizeOrZoom);
        document.addEventListener("fullscreenchange", resetToDefaultPosition);

        return () => {
            window.removeEventListener("resize", handleResizeOrZoom);
            window.removeEventListener("zoom", handleResizeOrZoom);
            document.removeEventListener("fullscreenchange", resetToDefaultPosition);
        };
    }, [updateScreenRatios, buttonGroup.length, isVertical, resetToDefaultPosition]);

    useEffect(() => {
        manager.onHasButtonsGroupUpdate.connect(setButtonGroupChanged);

        return () => {
            manager.onHasButtonsGroupUpdate.disconnect(setButtonGroupChanged);
        };
    }, [manager]);

    useEffect(() => {
        if (buttonGroupChanged) {
            setButtonGroup(manager.GetButtonGroup());
            setButtonGroupChanged(false);
        }
    }, [buttonGroupChanged, manager]);

    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
        setIsDragging(true);
        setDragOffset({
            x: e.clientX - position.x,
            y: e.clientY - position.y,
        });
    };

    const handleMouseMove = useCallback(
        (e: MouseEvent) => {
            if (isDragging) {
                const ds = getDefaultSettings();
                setPosition(() => {
                    const newX = e.clientX - dragOffset.x;
                    const newY = e.clientY - dragOffset.y;

                    const dragIndicatorPosition = {
                        x: newX,
                        y: newY,
                    };

                    if (
                        dragIndicatorPosition.x < -20 ||
                        dragIndicatorPosition.y < -20 ||
                        dragIndicatorPosition.x + 45 * SCREEN_RATIO > window.innerWidth ||
                        dragIndicatorPosition.y + 45 * SCREEN_RATIO > window.innerHeight
                    ) {
                        return { x: ds.x, y: ds.y, isVertical: ds.isVertical };
                    }

                    return { x: newX, y: newY };
                });
            }
        },
        [isDragging, dragOffset, buttonGroup.length, isVertical],
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

    return buttonGroup.length > 0 ? (
        <StyledSheet
            sx={{
                position: "absolute",
                left: `${position.x}px`,
                top: `${position.y}px`,
                display: "flex",
                flexDirection: isVertical ? "column" : "row",
                alignItems: "center",
                gap: 0.7 * SCREEN_RATIO,
                zIndex: 4,
                transition: isDragging ? "none" : "left 0.5s ease, top 0.5s ease", // Add transition only when not dragging
            }}
        >
            <Box
                sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.7 * SCREEN_RATIO,
                    bgcolor: isDark ? "rgba(255, 215, 0, 0.1)" : "rgba(53, 33, 0, 0.3)",
                    borderRadius: "sm",
                    p: 0.35 * SCREEN_RATIO,
                }}
            >
                <Box onMouseDown={handleMouseDown} sx={{ cursor: "move", display: "flex", alignItems: "center" }}>
                    <DragIndicatorIcon
                        sx={{
                            color: isDark ? "rgb(131, 112, 106)" : "#352100",
                            width: "auto",
                            height: 22.4 * SCREEN_RATIO,
                        }}
                    />
                </Box>
                <button
                    onClick={handleRotate}
                    style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: 0,
                        display: "flex",
                        alignItems: "center",
                    }}
                >
                    <RotateRightIcon
                        sx={{
                            width: "auto",
                            height: 22.4 * SCREEN_RATIO,
                            color: isDark ? "rgb(230, 220, 212)" : "black",
                        }}
                    />
                </button>
            </Box>
            <Divider
                orientation={isVertical ? "horizontal" : "vertical"}
                sx={{ bgcolor: isDark ? "rgb(131, 112, 106)" : "#352100" }}
            />
            {buttonGroup.map((button) => {
                const iconImage = button.customSpriteName
                    ? // @ts-ignore: src params
                      images[button.customSpriteName]
                    : BUTTON_NAME_TO_ICON_IMAGE[`${button.name}${button.state}`];
                return (
                    <ButtonComponent
                        key={button.name}
                        iconImage={iconImage}
                        text={button.text}
                        isVisible={button.isVisible}
                        isDisabled={button.isDisabled}
                        isDark={isDark}
                        onClick={() => {
                            manager.PropagateButtonClicked(button.name, button.state);
                        }}
                        isHourglass={button.name === "Hourglass"}
                        customSpriteName={button.customSpriteName}
                        numberOfOptions={button.numberOfOptions}
                        selectedOption={button.selectedOption}
                    />
                );
            })}
        </StyledSheet>
    ) : null;
};

export default DraggableToolbar;
