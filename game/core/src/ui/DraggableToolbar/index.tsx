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
 * How each glyph is fitted into its button. `zoom` scales the art inside the button; `inset` pulls the whole
 * layer in from the rim so nothing touches the border.
 *
 * The whole set is now round medallions — the glyph sits on its own disc that already fills the source
 * canvas edge to edge (verified: the opaque area is π/4 of the square, i.e. an inscribed circle). So the art
 * needs showing very nearly whole, and the button's own rim becomes its frame.
 *
 * It used to be square plates with ornamental corners, which had to be zoomed to 168% so the plate fell
 * outside the circular clip. Feeding a medallion through that crop threw away roughly 40% of it — the disc
 * was blown up until its edge, and part of the glyph, was clipped away. Hence the far gentler default.
 * Per-icon entries stay available for art that does not follow the medallion layout.
 */
const GLYPH_CROP: Record<string, { zoom: number; inset: number }> = {};
// The medallion is cut to its own circle and already includes the bezel, so it maps 1:1 onto the button:
// no zoom to push a plate out of frame, no inset to hold a glyph off a rim that no longer exists.
const GLYPH_CROP_DEFAULT = { zoom: 100, inset: 0 };

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

// The art now arrives already finished: a gold medallion, its own bezel included, on transparency. So it is
// left in its own colour rather than warmed to ember — the old sepia/saturate pass existed to push pale
// glyphs into gold on the obsidian disc, and running already-gold art through it just oversaturated the
// bezel. Only the shadow is kept, to hold the medallion off the panel behind it.
const GLYPH_FILTER = "drop-shadow(0 2px 3px rgba(0,0,0,.85))";
const GLYPH_FILTER_BRIGHT = "brightness(1.12) drop-shadow(0 2px 5px rgba(243,212,136,.45))";

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
    // No shell of our own: the medallion art carries its own bezel, so an obsidian disc and a rim behind it
    // only produced a second ring around the first. The button is a bare, transparent circle and the glyph
    // layer is the whole of it.
    background: "transparent",
    border: "none",
    boxShadow: "none",
    "&::before": {
        content: '""',
        position: "absolute",
        // Both values come from GLYPH_CROP, set per icon on the element (see ButtonComponent).
        inset: "var(--hoc-glyph-inset)",
        backgroundImage: "var(--hoc-glyph)",
        backgroundSize: "var(--hoc-glyph-zoom)",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center",
        filter: GLYPH_FILTER,
        transition: "filter 0.3s ease",
        pointerEvents: "none",
    },
    "&:hover:not(:disabled)": {
        transform: `scale(1.15) rotate(${rotationDegrees}deg)`,
        "&::before": { filter: GLYPH_FILTER_BRIGHT },
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
