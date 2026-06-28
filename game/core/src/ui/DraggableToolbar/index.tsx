import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
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

const StyledSheet = styled(Sheet, {
    shouldForwardProp: (prop) => prop !== "isDragging",
})<{ isDragging?: boolean }>(({ theme, isDragging }) => ({
    backgroundImage: `url(${theme.palette.mode === "dark" ? blackImage : lightImage})`,
    backgroundSize: "cover",
    // Bronze/gold dungeon trim to match the tooltips + fire-lit board.
    border: `${Math.max(1, Math.round(2 * SCREEN_RATIO))}px solid`,
    borderColor: "#caa24f",
    borderRadius: `${10 * SCREEN_RATIO}px`,
    padding: `${0.7 * SCREEN_RATIO}rem`,
    // Depth shadow + a faint warm glow so it reads as a lit dungeon panel, plus an inner darkening
    // so the trim frames a recessed stone face.
    boxShadow: `0 ${3 * SCREEN_RATIO}px ${10 * SCREEN_RATIO}px rgba(0,0,0,0.6), 0 0 ${
        12 * SCREEN_RATIO
    }px rgba(220,177,88,0.18), inset 0 0 ${10 * SCREEN_RATIO}px rgba(0,0,0,0.45)`,
    // No position easing while dragging — the old left/top transition made the bar float behind the
    // cursor. Re-enabled on release so the snap-to-edge glides into place.
    transition: isDragging
        ? "none"
        : "left 0.4s cubic-bezier(0.22, 1, 0.36, 1), top 0.4s cubic-bezier(0.22, 1, 0.36, 1)",
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
        }
        if (onClick) {
            onClick();
        }
    }, [isHourglass, onClick]);

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

    const needRotate = ICON_IMAGE_NEED_ROTATE[iconImage];
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
        // Update: Landscape should stick to inside edge of sidebar (move left by button width)
        const x = isLandscape ? barSize - 48 * SCREEN_RATIO : width - barSize;

        return {
            x: x,
            y: height / 3.2,
            isVertical: true,
        };
    }, []);

    const [position, setPosition] = useState<{ x: number; y: number }>(() => {
        const ds = getDefaultSettings();
        return { x: ds.x, y: ds.y };
    });

    const [isDragging, setIsDragging] = useState<boolean>(false);
    const [isVertical, setIsVertical] = useState<boolean>(() => getDefaultSettings().isVertical);
    const theme = useTheme();

    const { buttons: buttonGroup, propagateClick } = useButtonContext();
    const toolbarRef = React.useRef<HTMLDivElement>(null);
    // Live drag state kept in refs so dragging doesn't re-render the bar on every mousemove.
    const positionRef = useRef(position);
    const draggingRef = useRef(false);
    const movedRef = useRef(false);
    const dragStartRef = useRef({ x: 0, y: 0 });
    const dragOffsetRef = useRef({ x: 0, y: 0 });
    const pendingRef = useRef<{ x: number; y: number } | null>(null);
    const rafRef = useRef<number | null>(null);
    useEffect(() => {
        positionRef.current = position;
    }, [position]);

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

    // Distinguish a real drag from a plain click so clicking a button doesn't fling the bar to an edge.
    const DRAG_THRESHOLD = 4;

    // On release, dock to whichever screen edge is closest (with a small margin).
    const snapToNearestEdge = useCallback((x: number, y: number): { x: number; y: number } => {
        const el = toolbarRef.current;
        const w = el?.offsetWidth ?? 0;
        const h = el?.offsetHeight ?? 0;
        const margin = Math.round(8 * SCREEN_RATIO);
        const winW = window.innerWidth;
        const winH = window.innerHeight;
        const distLeft = x;
        const distRight = winW - (x + w);
        const distTop = y;
        const distBottom = winH - (y + h);
        const nearest = Math.min(distLeft, distRight, distTop, distBottom);
        let nx = x;
        let ny = y;
        if (nearest === distLeft) nx = margin;
        else if (nearest === distRight) nx = winW - w - margin;
        else if (nearest === distTop) ny = margin;
        else ny = winH - h - margin;
        nx = Math.max(margin, Math.min(nx, winW - w - margin));
        ny = Math.max(margin, Math.min(ny, winH - h - margin));
        return { x: nx, y: ny };
    }, []);

    const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
        if (e.button !== 0) return;
        draggingRef.current = true;
        movedRef.current = false;
        dragStartRef.current = { x: e.clientX, y: e.clientY };
        dragOffsetRef.current = { x: e.clientX - positionRef.current.x, y: e.clientY - positionRef.current.y };
    }, []);

    useEffect(() => {
        const handleMove = (e: MouseEvent) => {
            if (!draggingRef.current || !toolbarRef.current) return;
            if (!movedRef.current) {
                const dx = e.clientX - dragStartRef.current.x;
                const dy = e.clientY - dragStartRef.current.y;
                if (dx * dx + dy * dy < DRAG_THRESHOLD * DRAG_THRESHOLD) return;
                movedRef.current = true;
                setIsDragging(true); // kills the position transition so the bar tracks the cursor 1:1
            }
            const w = toolbarRef.current.offsetWidth;
            const h = toolbarRef.current.offsetHeight;
            let newX = e.clientX - dragOffsetRef.current.x;
            let newY = e.clientY - dragOffsetRef.current.y;
            newX = Math.max(0, Math.min(newX, window.innerWidth - w));
            newY = Math.max(0, Math.min(newY, window.innerHeight - h));
            pendingRef.current = { x: newX, y: newY };
            positionRef.current = { x: newX, y: newY };
            // Coalesce bursts of mousemove into a single state write per frame.
            if (rafRef.current == null) {
                rafRef.current = window.requestAnimationFrame(() => {
                    rafRef.current = null;
                    if (pendingRef.current) setPosition(pendingRef.current);
                });
            }
        };
        const handleUp = () => {
            if (!draggingRef.current) return;
            draggingRef.current = false;
            if (rafRef.current != null) {
                window.cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
            if (!movedRef.current) return; // was a click, not a drag — leave the bar where it is
            setIsDragging(false); // re-enables the transition so the snap glides
            const snapped = snapToNearestEdge(positionRef.current.x, positionRef.current.y);
            positionRef.current = snapped;
            setPosition(snapped);
        };
        document.addEventListener("mousemove", handleMove);
        document.addEventListener("mouseup", handleUp);
        return () => {
            document.removeEventListener("mousemove", handleMove);
            document.removeEventListener("mouseup", handleUp);
        };
    }, [snapToNearestEdge]);

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

    // Memoized so the per-frame position updates during a drag don't re-render every button.
    const buttonsContent = useMemo(
        () => (
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
        ),

        [buttonGroup, isVertical, isDark, propagateClick],
    );

    return buttonGroup.length > 0 ? (
        <StyledSheet
            ref={toolbarRef}
            isDragging={isDragging}
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

            {buttonsContent}

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
