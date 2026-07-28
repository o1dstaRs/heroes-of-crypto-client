import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Sheet, Box, Tooltip } from "@mui/joy";
import { styled } from "@mui/system";

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

/**
 * How each glyph is cropped out of its plaque. The atlas art is a decorated tile — a square plate with
 * ornamental corners (or, for the clover, a round medallion) with the glyph in the middle. `zoom` blows the
 * art up inside the button so the plate falls outside the circular clip; `inset` then pulls the whole layer
 * in from the button's rim so the glyph does not touch the border. Values are per icon because the plates
 * are not laid out identically.
 */
const GLYPH_CROP: Record<string, { zoom: number; inset: number }> = {
    // Round medallion, no corner ornaments: show it almost whole, filling the button to its rim.
    [luckShieldIconImage]: { zoom: 108, inset: 3 },
    // The spellbook already reads well at the conservative crop — left alone deliberately.
    [spellbookIconImage]: { zoom: 140, inset: 16 },
};
// Square plates: crop past the corner ornaments (they occupy the outer ~20%), which lands the glyph
// filling the disc.
const GLYPH_CROP_DEFAULT = { zoom: 168, inset: 7 };

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

// The `icon_*_black.webp` atlas is named for the dark theme it ships against — the glyphs themselves are
// already light. So the handoff's ember values are reached by warming them, NOT by inverting: an invert
// drives a light glyph to near-black and it vanishes on the obsidian disc.
const EMBER_GLYPH_FILTER =
    "sepia(48%) saturate(240%) hue-rotate(-6deg) brightness(1.02) drop-shadow(0 0 2px rgba(0,0,0,.9))";
const EMBER_GLYPH_FILTER_BRIGHT =
    "sepia(24%) saturate(165%) hue-rotate(-4deg) brightness(1.16) drop-shadow(0 0 3px rgba(243,212,136,.5))";

// Obsidian shell from the fight-sidebar handoff. The old bronze-trimmed stone panel read as another gold
// frame competing with the board; this one recedes and lets the ember glyphs carry the colour.
const StyledSheet = styled(Sheet)(() => ({
    backgroundImage: "linear-gradient(180deg, rgba(28,20,12,.96), rgba(8,6,4,.96))",
    padding: "12px 8px",
    borderRadius: "14px",
    border: "3px solid #0a0705",
    boxShadow: "0 6px 20px rgba(0,0,0,.75), inset 0 0 0 1px rgba(150,130,98,.2), inset 0 0 16px rgba(0,0,0,.6)",
}));

const StyledIconButton = styled("button", {
    shouldForwardProp: (prop) => typeof prop === "string" && !["rotationDegrees", "clickEffectNeeded"].includes(prop),
})<{ rotationDegrees: number; clickEffectNeeded?: boolean }>(({ rotationDegrees, clickEffectNeeded }) => ({
    width: 45 * SCREEN_RATIO,
    height: 45 * SCREEN_RATIO,
    padding: 0,
    borderRadius: "50%",
    transition: "all 0.3s ease",
    position: "relative",
    overflow: "hidden",
    cursor: "pointer",
    transform: `rotate(${rotationDegrees}deg)`,
    // Obsidian disc with a black rim. The glyph rides on the ::before layer so the ember filter tints the
    // artwork only — filtering the button itself inverted the disc along with it.
    background: "radial-gradient(circle at 42% 32%, #2b2118, #120c07 70%)",
    border: "2px solid #241a10",
    boxShadow: "inset 0 2px 6px rgba(0,0,0,.9), 0 0 12px rgba(0,0,0,.5)",
    "&::before": {
        content: '""',
        position: "absolute",
        // Both values come from GLYPH_CROP, set per icon on the element (see ButtonComponent).
        inset: "var(--hoc-glyph-inset)",
        backgroundImage: "var(--hoc-glyph)",
        backgroundSize: "var(--hoc-glyph-zoom)",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center",
        filter: EMBER_GLYPH_FILTER,
        transition: "filter 0.3s ease",
        pointerEvents: "none",
    },
    "&:hover:not(:disabled)": {
        transform: `scale(1.15) rotate(${rotationDegrees}deg)`,
        background: "radial-gradient(circle at 42% 32%, #3a2c1c, #1a1109 70%)",
        borderColor: "#8a7136",
        boxShadow: "inset 0 2px 6px rgba(0,0,0,.8), 0 0 18px rgba(243,212,136,.4)",
        "&::before": { filter: EMBER_GLYPH_FILTER_BRIGHT },
    },
    "&:disabled": {
        background: "radial-gradient(circle at 42% 32%, #201811, #0d0905 70%)",
        borderColor: "rgba(202,162,79,.35)",
        boxShadow: "none",
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
}));

interface ButtonComponentProps {
    iconImage: string;
    text: string;
    isVisible: boolean;
    isDisabled: boolean;
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

    const glyphCrop = GLYPH_CROP[iconImage] ?? GLYPH_CROP_DEFAULT;
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
                        clickEffectNeeded={iconImage !== spellbookIconImage && iconImage !== hourglassIconImage}
                        style={
                            {
                                // The glyph URL reaches the ::before layer through a custom property, so the
                                // ember filter tints the artwork without touching the disc underneath.
                                "--hoc-glyph": `url(${iconImage})`,
                                "--hoc-glyph-zoom": `${glyphCrop.zoom}%`,
                                "--hoc-glyph-inset": `${glyphCrop.inset}%`,
                                width: 45 * SCREEN_RATIO,
                                height: 45 * SCREEN_RATIO,
                                ...(transfusionEffect
                                    ? {
                                          animation: "transfusion 1.5s linear",
                                          boxShadow: `0 0 ${14 * SCREEN_RATIO}px rgba(243, 212, 136, 0.7)`,
                                      }
                                    : {}),
                            } as React.CSSProperties
                        }
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
    // Kept only so the styled components re-render at the right scale after a resize/zoom — SCREEN_RATIO
    // is module-level and read at render time.
    const [, bumpScaleTick] = useState(0);

    const updateScreenRatios = useCallback(() => {
        SCREEN_RATIO = Math.min(window.innerWidth / 1366, window.innerHeight / 768);
        bumpScaleTick((tick) => tick + 1);
    }, []);
    const { buttons: buttonGroup, propagateClick } = useButtonContext();

    useEffect(() => {
        window.addEventListener("resize", updateScreenRatios);
        window.addEventListener("zoom", updateScreenRatios as EventListener);
        document.addEventListener("fullscreenchange", updateScreenRatios);

        return () => {
            window.removeEventListener("resize", updateScreenRatios);
            window.removeEventListener("zoom", updateScreenRatios as EventListener);
            document.removeEventListener("fullscreenchange", updateScreenRatios);
        };
    }, [updateScreenRatios]);

    const getButtonIcon = (button: IVisibleButton) => {
        if (button.customSpriteName) {
            // @ts-ignore: src params
            return images[button.customSpriteName];
        }
        return BUTTON_NAME_TO_ICON_IMAGE[`${button.name}${button.state}`];
    };

    const buttonsContent = useMemo(
        () => (
            <Box
                sx={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
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
                        onClick={() => propagateClick(button.name, button.state)}
                        isHourglass={button.name === "Hourglass"}
                        customSpriteName={button.customSpriteName}
                        numberOfOptions={button.numberOfOptions}
                        selectedOption={button.selectedOption}
                    />
                ))}
            </Box>
        ),

        [buttonGroup, propagateClick],
    );

    // Every button hides itself when it is not applicable (ButtonComponent returns null), so on the
    // opponent's turn the group is non-empty but renders nothing — which used to leave an empty framed
    // column sitting in the sidebar. Drop the frame too when there is nothing inside it.
    const hasVisibleButton = buttonGroup.some((button) => button.isVisible);

    return hasVisibleButton ? (
        <StyledSheet
            sx={{
                // In-flow inside the right sidebar. It used to float over the board — first wherever the
                // player had dragged it, then pinned to the board's right edge — and either way it sat on
                // cells that have to be clickable to move and attack. Sized to the button column so the
                // damage table sits beside it rather than under it.
                position: "relative",
                width: "fit-content",
                flex: "none",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 1.5,
                userSelect: "none",
            }}
        >
            {buttonsContent}
        </StyledSheet>
    ) : null;
};

export default DraggableToolbar;
