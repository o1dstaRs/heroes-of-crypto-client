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
import aiIconImage from "../../../images/icon_ai_black.webp";
import aiOnIconImage from "../../../images/icon_ai_on_black.webp";
import skipIconImage from "../../../images/icon_skip_black.webp";
import luckShieldIconImage from "../../../images/icon_luck_shield_black.webp";
import blackImage from "../../../images/overlay_black.webp";
import lightImage from "../../../images/overlay_light.webp";
import { useManager } from "../../manager";
import { IVisibleButton, VisibleButtonState } from "../../state/visible_state";

const INITIAL_POSITION_Y = 6;
const INITIAL_POSITION_X = window.innerWidth / 2 - 278;

const BUTTON_NAME_TO_ICON_IMAGE: Record<string, string> = {
    [`Spellbook${VisibleButtonState.FIRST}`]: spellbookIconImage,
    [`Hourglass${VisibleButtonState.FIRST}`]: hourglassIconImage,
    [`AttackType${VisibleButtonState.FIRST}`]: swordIconImage,
    [`AI${VisibleButtonState.FIRST}`]: aiIconImage,
    [`AI${VisibleButtonState.SECOND}`]: aiOnIconImage,
    [`Next${VisibleButtonState.FIRST}`]: skipIconImage,
    [`LuckShield${VisibleButtonState.FIRST}`]: luckShieldIconImage,
};

const ICON_IMAGE_NEED_ROTATE: Record<string, boolean> = {
    [spellbookIconImage]: false,
    [hourglassIconImage]: true,
    [swordIconImage]: false,
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
    borderRadius: "10px",
    padding: "1rem",
    boxShadow: "0 0 10px rgba(0,0,0,0.5)",
}));

const StyledIconButton = styled("button", {
    shouldForwardProp: (prop) => typeof prop === "string" && !["rotationDegrees", "isDark"].includes(prop),
})<{ rotationDegrees: number; isDark: boolean }>(({ rotationDegrees, isDark }) => ({
    width: 64,
    height: 64,
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
    "&:hover": {
        transform: `scale(1.05) rotate(${rotationDegrees}deg)`,
        ...(isDark
            ? {
                  boxShadow: "0 0 10px rgba(255, 255, 255, 0.5)",
                  filter: "brightness(1.1) drop-shadow(0 0 5px rgba(255, 255, 255, 0.5))",
              }
            : {
                  backgroundColor: "darkred",
                  boxShadow: "0 0 10px rgba(139, 0, 0, 0.5)",
                  filter: "brightness(1.1) drop-shadow(0 0 5px rgba(139, 0, 0, 0.5))",
              }),
    },
    "&:disabled": {
        opacity: 0.5,
        cursor: "not-allowed",
    },
}));

interface ButtonComponentProps {
    iconImage: string;
    text: string;
    isVisible: boolean;
    isDisabled: boolean;
    isDark: boolean;
    onClick?: () => void;
    isHourglass?: boolean;
    customSpriteName?: string;
}

interface ButtonComponentProps {
    iconImage: string;
    text: string;
    isVisible: boolean;
    isDisabled: boolean;
    isDark: boolean;
    onClick?: () => void;
    isHourglass?: boolean;
    customSpriteName?: string;
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
}) => {
    const [rotationDegrees, setRotationDegrees] = useState(0);

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

    if (!isVisible) {
        return null;
    }

    const needRotate = ICON_IMAGE_NEED_ROTATE[iconImage] || !!customSpriteName;
    const initialRotation = needRotate ? 180 : 0;

    return (
        <Tooltip title={text} placement="top">
            <StyledIconButton
                onClick={handleClick}
                disabled={isDisabled}
                rotationDegrees={isHourglass ? rotationDegrees : initialRotation}
                isDark={isDark}
                style={{
                    backgroundImage: `url(${iconImage})`,
                }}
            />
        </Tooltip>
    );
};

const DraggableToolbar: React.FC = () => {
    const [position, setPosition] = useState<{ x: number; y: number }>({
        x: INITIAL_POSITION_X,
        y: INITIAL_POSITION_Y,
    });
    const [isDragging, setIsDragging] = useState<boolean>(false);
    const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const [isVertical, setIsVertical] = useState<boolean>(false);
    const [buttonGroupChanged, setButtonGroupChanged] = useState<boolean>(false);
    const [buttonGroup, setButtonGroup] = useState<IVisibleButton[]>([]);
    const theme = useTheme();
    const manager = useManager();

    useEffect(() => {
        const connection = manager.onHasButtonsGroupUpdate.connect((hasChanged) => {
            setButtonGroupChanged(hasChanged);
        });

        return () => {
            connection.disconnect();
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
                setPosition({
                    x: e.clientX - dragOffset.x,
                    y: e.clientY - dragOffset.y,
                });
            }
        },
        [isDragging, dragOffset],
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
                gap: 1,
                zIndex: 4,
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
                            height: 32,
                            color: isDark ? "lightgrey" : "black",
                        }}
                    />
                </button>
            </Box>
            <Divider
                orientation={isVertical ? "horizontal" : "vertical"}
                sx={{ bgcolor: isDark ? "#ff9e76" : "#352100" }}
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
                            // If you need to perform any additional actions when the hourglass is clicked,
                            // you can add them here
                        }}
                        isHourglass={button.name === "Hourglass"}
                        customSpriteName={button.customSpriteName}
                    />
                );
            })}
        </StyledSheet>
    ) : null;
};

export default DraggableToolbar;
