import React, { useState, useEffect } from "react";
import { Sheet, IconButton, Box, Divider, Tooltip } from "@mui/joy";
import { useTheme } from "@mui/joy/styles";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import RotateRightIcon from "@mui/icons-material/RotateRight";
import { styled, keyframes } from "@mui/system";

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

const BUTTON_NAME_TO_ICON_IMAGE = {
    [`Spellbook${VisibleButtonState.FIRST}`]: spellbookIconImage,
    [`Hourglass${VisibleButtonState.FIRST}`]: hourglassIconImage,
    [`AttackType${VisibleButtonState.FIRST}`]: swordIconImage,
    [`AI${VisibleButtonState.FIRST}`]: aiIconImage,
    [`AI${VisibleButtonState.SECOND}`]: aiOnIconImage,
    [`Next${VisibleButtonState.FIRST}`]: skipIconImage,
    [`LuckShield${VisibleButtonState.FIRST}`]: luckShieldIconImage,
};

const DraggableToolbar = () => {
    const [position, setPosition] = useState({ x: INITIAL_POSITION_X, y: INITIAL_POSITION_Y });
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: INITIAL_POSITION_X, y: INITIAL_POSITION_Y });
    const [isVertical, setIsVertical] = useState(false);
    const [buttonGroupChanged, setButtonGroupChanged] = useState(false);
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
            setButtonGroupChanged(false); // Reset the state to re-render
        }
    }, [buttonGroupChanged, manager]);

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
        backgroundImage: `url(${isDark ? blackImage : lightImage})`,
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

    const createIconButton = (
        iconImage: string,
        text: string,
        isVisible: boolean,
        isDisabled: boolean,
        onClick?: () => void,
    ) => (
        <Tooltip title={isVisible ? text : "Hidden"} style={{ zIndex: 5 }}>
            <IconButton
                sx={{
                    width: 64,
                    height: 64,
                    padding: 0,
                    backgroundImage: `url(${iconImage})`,
                    backgroundSize: "cover",
                    transition: "all 0.3s ease",
                    display: isVisible ? "block" : "none",
                    opacity: isDisabled ? 0.5 : 1,
                    pointerEvents: isDisabled ? "none" : "auto",
                    position: "relative",
                    "&:hover": {
                        animation: `${isDark ? shineEffectWhite : shineEffectRed} 1.5s infinite`,
                        transform: "scale(1.05)",
                        ...(!isDark && {
                            backgroundColor: "darkred",
                            boxShadow: "0 0 10px rgba(139, 0, 0, 0.5)",
                            filter: "brightness(1.1) drop-shadow(0 0 5px rgba(139, 0, 0, 0.5))",
                        }),
                        ...(isDark && {
                            boxShadow: "0 0 10px rgba(255, 255, 255, 0.5)",
                            filter: "brightness(1.1) drop-shadow(0 0 5px rgba(255, 255, 255, 0.5))",
                        }),
                    },
                    "&::after": {
                        display: "block",
                        textAlign: "center",
                        marginTop: "0.5rem",
                        color: isDark ? "lightgrey" : "black",
                        fontSize: "0.75rem",
                    },
                }}
                onClick={onClick}
            />
        </Tooltip>
    );

    const buttonNameToIconButton: { [key: string]: JSX.Element } = {};
    const buttonNameToState: { [key: string]: VisibleButtonState } = {};
    for (const b of buttonGroup) {
        const newIconButton = createIconButton(
            BUTTON_NAME_TO_ICON_IMAGE[`${b.name as keyof typeof BUTTON_NAME_TO_ICON_IMAGE}${b.state}`] as string,
            b.text,
            b.isVisible,
            b.isDisabled,
            () => manager.PropagateButtonClicked(b.name, b.state),
        );
        buttonNameToIconButton[b.name] = newIconButton;
        buttonNameToState[b.name] = b.state;
    }

    return Object.keys(buttonNameToIconButton).length > 0 ? (
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
            {Object.keys(buttonNameToIconButton).map((buttonName, index) => {
                const ButtonComponent = buttonNameToIconButton[buttonName];
                return <React.Fragment key={index}>{ButtonComponent}</React.Fragment>;
            })}
        </StyledSheet>
    ) : null;
};

export default DraggableToolbar;
