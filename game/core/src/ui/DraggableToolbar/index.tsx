import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Box, Tooltip } from "@mui/joy";
import { styled } from "@mui/system";

import { images } from "../../generated/image_imports";
import { TRIM_WIDTH_PX as BOARD_EDGE_TRIM_WIDTH_PX } from "../boardEdgeTrim";
export { toolbarColumnHeightPx } from "./toolbarMetrics";

const spellbookIconImage = images.combat_toolbar_ember_spellbook;
const hourglassIconImage = images.combat_toolbar_ember_hourglass;
const swordIconImage = images.combat_toolbar_ember_sword;
const bowIconImage = images.combat_toolbar_ember_bow;
const scepterIconImage = images.combat_toolbar_ember_scepter;
const aiIconImage = images.combat_toolbar_ember_ai;
const skipIconImage = images.combat_toolbar_ember_next;
const luckShieldIconImage = images.combat_toolbar_ember_luck;
const activeOptionIconImage = new URL("../../../images/icon_active_option.webp", import.meta.url).toString();
const inactiveOptionIconImage = new URL("../../../images/icon_inactive_option.webp", import.meta.url).toString();
import { IVisibleButton, VisibleButtonState } from "../../scenes/VisibleState";
import { useButtonContext } from "../context/ButtonContext";

let SCREEN_RATIO = Math.min(window.innerWidth / 1366, window.innerHeight / 768);

const BUTTON_NAME_TO_ICON_IMAGE: Record<string, string> = {
    [`Spellbook${VisibleButtonState.FIRST}`]: spellbookIconImage,
    [`Hourglass${VisibleButtonState.FIRST}`]: hourglassIconImage,
    [`TimeDenial${VisibleButtonState.FIRST}`]: hourglassIconImage,
    [`AttackType${VisibleButtonState.FIRST}`]: swordIconImage,
    [`AttackType${VisibleButtonState.SECOND}`]: bowIconImage,
    [`AttackType${VisibleButtonState.THIRD}`]: scepterIconImage,
    // Both AI states share one medallion: switching it on adds an "ON" badge over the art (see
    // ButtonComponent) instead of swapping in a second picture, so the button never changes identity.
    [`AI${VisibleButtonState.FIRST}`]: aiIconImage,
    [`AI${VisibleButtonState.SECOND}`]: aiIconImage,
    [`Next${VisibleButtonState.FIRST}`]: skipIconImage,
    [`LuckShield${VisibleButtonState.FIRST}`]: luckShieldIconImage,
};

// The selected ember artwork is a finished medallion, including its own dark face and bronze bezel. Keep
// every asset at 1:1 scale instead of cropping the bezel and rebuilding a second frame in CSS.
const GLYPH_CROP_DEFAULT = { zoom: 100, inset: 0 };

const ICON_IMAGE_NEED_ROTATE: Record<string, boolean> = {
    [spellbookIconImage]: false,
    [hourglassIconImage]: true,
    [swordIconImage]: false,
    [scepterIconImage]: false,
    [aiIconImage]: false,
    [skipIconImage]: false,
    [luckShieldIconImage]: false,
};

// The art now arrives already finished: a gold medallion, its own bezel included, on transparency. So it is
// left in its own colour rather than warmed to ember — the old sepia/saturate pass existed to push pale
// glyphs into gold on the obsidian disc, and running already-gold art through it just oversaturated the
// bezel. Only the shadow is kept, to hold the medallion off the panel behind it.
const GLYPH_FILTER = "drop-shadow(0 2px 3px rgba(0,0,0,.85))";
const ACTIVE_ICON_FILTER = "brightness(1.15)";
const ACTIVE_ICON_FILTER_BRIGHT = "brightness(1.27) drop-shadow(0 2px 5px rgba(243,212,136,.35))";

// Transparent layout-only column. The medallions now sit directly on the right sidebar's own texture.
const StyledSheet = styled(Box)(() => ({
    background: "transparent",
    padding: 0,
    boxSizing: "border-box",
    alignSelf: "flex-start",
    height: "auto",
    width: "max-content",
    borderRadius: 0,
    border: 0,
    boxShadow: "none",
}));

const StyledIconButton = styled("button", {
    shouldForwardProp: (prop) => typeof prop === "string" && !["rotationDegrees", "clickEffectNeeded"].includes(prop),
})<{ rotationDegrees: number; clickEffectNeeded?: boolean }>(({ rotationDegrees, clickEffectNeeded }) => ({
    width: 57 * SCREEN_RATIO,
    height: 57 * SCREEN_RATIO,
    padding: 0,
    borderRadius: "50%",
    transition: "all 0.3s ease",
    position: "relative",
    overflow: "hidden",
    cursor: "pointer",
    transform: `rotate(${rotationDegrees}deg)`,
    // The selected artwork already contains the complete dark face and bronze rim.
    background: "transparent",
    border: 0,
    // The approved image ring already carries its own depth; a second CSS shadow made a thick black halo.
    boxShadow: "none",
    "&::before": {
        content: '""',
        position: "absolute",
        // These values stay explicit so custom sprites can keep using the same rendering layer.
        inset: "var(--hoc-glyph-inset)",
        // The layer clips itself, rather than relying on the button's overflow. Once `inset` shrinks it, the
        // button's circle no longer sits at the layer's edge, so the crop that hides the bezel would stop at
        // a smaller radius than the art needs and the ring would creep back in around the glyph.
        borderRadius: "50%",
        backgroundImage: "var(--hoc-glyph)",
        backgroundSize: "var(--hoc-glyph-zoom)",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center",
        filter: GLYPH_FILTER,
        // Keep the complete bronze bezel inside the circular clip. At 100% the outermost gold pixels of
        // the selected raster touched the button edge and were cut off on several medallions.
        // Every WebP is physically cropped to the same outer gold radius and transparent beyond it.
        transform: "scale(1)",
        transformOrigin: "center",
        transition: "filter 0.3s ease, transform 0.3s ease",
        pointerEvents: "none",
        zIndex: 1,
    },
    // Repeat only the centre of the medallion above the base artwork. The soft radial mask ends before the
    // bezel, so active symbols gain 15% brightness while the gold frame keeps exactly the same colour.
    "&:not(:disabled)::after": {
        content: '""',
        position: "absolute",
        inset: 0,
        borderRadius: "50%",
        backgroundImage: "var(--hoc-glyph)",
        backgroundSize: "var(--hoc-glyph-zoom)",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center",
        filter: ACTIVE_ICON_FILTER,
        maskImage: "radial-gradient(ellipse 38% 38% at center, #000 0 82%, rgba(0,0,0,.92) 90%, transparent 100%)",
        pointerEvents: "none",
        zIndex: 2,
    },
    "&:hover:not(:disabled)": {
        transform: `scale(1.15) rotate(${rotationDegrees}deg)`,
        background: "transparent",
        borderColor: "#8a7136",
        boxShadow: "none",
        filter: "brightness(1.12)",
        "&::after": { filter: ACTIVE_ICON_FILTER_BRIGHT },
    },
    "&:disabled": {
        transform: `scale(0.94) rotate(${rotationDegrees}deg)`,
        background: "transparent",
        borderColor: "#8a7136",
        boxShadow: "none",
        opacity: 1,
        cursor: "not-allowed",
    },
    // Keep the complete gold bezel at active brightness. Only the playable face and its symbol are muted,
    // so unavailable actions remain clearly visible without looking clickable.
    "&:disabled::after": {
        content: '\"\"',
        position: "absolute",
        inset: "13%",
        borderRadius: "50%",
        background: "rgba(0, 0, 0, .5)",
        boxShadow: "inset 0 1px 5px rgba(0, 0, 0, .5)",
        pointerEvents: "none",
        zIndex: 2,
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
    isAttackType?: boolean;
    /** Draws the "ON" badge over the artwork; the artwork itself stays put. */
    showOnBadge?: boolean;
    /** Keeps the canonical hourglass art and crosses it out while Nightmare's Time Denial is active. */
    showDeniedSlash?: boolean;
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
    isAttackType = false,
    showOnBadge = false,
    showDeniedSlash = false,
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

    const glyphCrop = GLYPH_CROP_DEFAULT;
    const needRotate = ICON_IMAGE_NEED_ROTATE[iconImage];
    const initialRotation = needRotate ? 180 : 0;
    // A pure melee creature has nothing to switch to, so its sword stays a plain action button without
    // the two-dot attack-mode toggle. Hybrid creatures still show the selector whenever multiple modes
    // are available; the existing ranged fallback keeps its two-state affordance during temporary locks.
    const isSingleMeleeAttack = isAttackType && numberOfOptions <= 1 && iconImage === swordIconImage;
    const displayedOptionCount = isSingleMeleeAttack
        ? 1
        : isAttackType
          ? Math.max(2, numberOfOptions)
          : numberOfOptions;
    const displayedSelectedOption =
        isAttackType && numberOfOptions <= 1 && iconImage === bowIconImage ? 2 : selectedOption;

    return (
        <Box
            sx={{
                width: 57 * SCREEN_RATIO,
                height: 57 * SCREEN_RATIO,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
            }}
        >
            <Box
                sx={{
                    display: "flex",
                    alignItems: "center",
                    height: 57 * SCREEN_RATIO,
                    position: "relative",
                    zIndex: 3,
                }}
            >
                <Tooltip title={text} placement="top">
                    {/* A disabled native button does not emit hover events. Keep the descriptive wrapper so
                        Time Denial (and every other disabled combat control) still explains itself. */}
                    <Box component="span" sx={{ display: "inline-flex", position: "relative" }}>
                        <StyledIconButton
                            onClick={handleClick}
                            disabled={isDisabled}
                            rotationDegrees={isHourglass ? rotationDegrees : initialRotation}
                            clickEffectNeeded={iconImage !== spellbookIconImage && iconImage !== hourglassIconImage}
                            style={
                                {
                                    // The complete medallion reaches the ::before layer through a custom
                                    // property, keeping hover and rotation effects off the surrounding panel.
                                    "--hoc-glyph": `url(${iconImage})`,
                                    "--hoc-glyph-zoom": `${glyphCrop.zoom}%`,
                                    "--hoc-glyph-inset": `${glyphCrop.inset}%`,
                                    width: 57 * SCREEN_RATIO,
                                    height: 57 * SCREEN_RATIO,
                                    ...(transfusionEffect
                                        ? {
                                              animation: "transfusion 1.5s linear",
                                              boxShadow: `0 0 ${14 * SCREEN_RATIO}px rgba(243,212,136,.7)`,
                                          }
                                        : {}),
                                } as React.CSSProperties
                            }
                            data-clickeffectneeded={
                                iconImage !== spellbookIconImage && iconImage !== hourglassIconImage
                            }
                        />
                        {showDeniedSlash && (
                            <Box
                                aria-hidden
                                sx={{
                                    position: "absolute",
                                    top: "50%",
                                    left: "12%",
                                    width: "76%",
                                    height: `${4 * SCREEN_RATIO}px`,
                                    borderRadius: "999px",
                                    background: "linear-gradient(180deg, #ff5148 0%, #c31313 52%, #650606 100%)",
                                    boxShadow: `0 0 ${2.5 * SCREEN_RATIO}px rgba(255, 34, 25, 0.9), 0 ${1 * SCREEN_RATIO}px ${1.5 * SCREEN_RATIO}px rgba(0, 0, 0, 0.95)`,
                                    transform: "translateY(-50%) rotate(-48deg)",
                                    transformOrigin: "center",
                                    pointerEvents: "none",
                                    zIndex: 5,
                                }}
                            />
                        )}
                    </Box>
                </Tooltip>
                {showOnBadge && (
                    // Sits over the medallion rather than replacing it, so the AI button keeps one face and
                    // only gains a state. Outside the button element on purpose: the button clips to its
                    // circle, which would cut a badge riding on the rim in half.
                    <Box
                        sx={{
                            position: "absolute",
                            top: -2 * SCREEN_RATIO,
                            right: -3 * SCREEN_RATIO,
                            minWidth: 20 * SCREEN_RATIO,
                            height: 20 * SCREEN_RATIO,
                            paddingX: `${2 * SCREEN_RATIO}px`,
                            borderRadius: "999px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: "#1f7a34",
                            border: `${1.5 * SCREEN_RATIO}px solid #7ce08f`,
                            color: "#eafbec",
                            fontSize: 10 * SCREEN_RATIO,
                            fontWeight: 800,
                            lineHeight: 1,
                            letterSpacing: "0.03em",
                            boxShadow: "0 0 8px rgba(124,224,143,.55), 0 1px 3px rgba(0,0,0,.8)",
                            pointerEvents: "none",
                            opacity: isDisabled ? 0.5 : 1,
                        }}
                    >
                        ON
                    </Box>
                )}
            </Box>
            {displayedOptionCount > 1 && (
                <Box
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: `${2 * SCREEN_RATIO}px`,
                        position: "absolute",
                        bottom: -1.5 * SCREEN_RATIO,
                        left: "50%",
                        transform: "translateX(-50%)",
                        minWidth: 23 * SCREEN_RATIO,
                        height: 11 * SCREEN_RATIO,
                        padding: `0 ${2.5 * SCREEN_RATIO}px`,
                        borderRadius: "999px",
                        background: "rgba(5, 5, 4, .88)",
                        border: `${0.8 * SCREEN_RATIO}px solid rgba(174, 133, 67, .82)`,
                        boxShadow: "0 1px 4px rgba(0,0,0,.9)",
                        zIndex: 6,
                        opacity: isDisabled ? 0.65 : 1,
                        pointerEvents: "none",
                    }}
                >
                    {Array.from({ length: displayedOptionCount }, (_, index) => {
                        return (
                            <img
                                key={index}
                                src={
                                    displayedOptionCount - index - 1 === displayedSelectedOption - 1
                                        ? activeOptionIconImage
                                        : inactiveOptionIconImage
                                }
                                alt={`Option ${index + 1}`}
                                style={{
                                    width: 9.1 * SCREEN_RATIO,
                                    height: 9.1 * SCREEN_RATIO,
                                    display: "block",
                                    filter: "drop-shadow(0 0 2px rgba(0,0,0,.9))",
                                }}
                            />
                        );
                    })}
                </Box>
            )}
        </Box>
    );
};

/**
 * How far the right sidebar insets its content from its own left edge: a 3px border plus 16px of padding.
 * The board-edge trim is painted over the first BOARD_EDGE_TRIM_WIDTH_PX of that, so the strip of bare panel
 * between the trim and the button column is the difference.
 */
const SIDEBAR_CONTENT_INSET_PX = 19;
/**
 * How far the button column reaches back past the sidebar's own left padding to meet the board trim.
 * Exported so the blocks under it — the log, the exit control, the footer — can start on the same edge
 * rather than on the padding's, which left them visibly narrower than the panels above.
 */
export const TRIM_OVERHANG_PX = SIDEBAR_CONTENT_INSET_PX - BOARD_EDGE_TRIM_WIDTH_PX;

/** The same sidebar's `p: 2`, vertically — what sits between the screen edge and the top of the column. */
const SIDEBAR_TOP_PAD_PX = 16;
/** Left of that padding, so the panel reads as reaching the top rather than being clipped by it. */
const TOP_CLEARANCE_PX = 4;

/**
 * How far `flushToTrim` lifts the button column above the row it sits in. Exported so whatever shares that
 * row can start on the same line: without it the panel beside the column began at the row's own top, a dozen
 * pixels below the column's rim, and the two read as stacked rather than side by side.
 */
export const TOOLBAR_TOP_LIFT_PX = SIDEBAR_TOP_PAD_PX - TOP_CLEARANCE_PX;

/**
 * `flushToTrim` slides the panel leftwards until it meets the board-edge trim, closing that strip. Its width
 * is unchanged — so the far edge comes with it, and the damage table beside it (flex: 1 1 auto) takes up the
 * width that frees. Opt-in because the toolbar is also mounted OUTSIDE the sidebar (RankedGameView), where a
 * negative margin would shift it against nothing.
 */
const DraggableToolbar: React.FC<{ flushToTrim?: boolean }> = ({ flushToTrim = false }) => {
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
                    gap: 1,
                }}
            >
                {buttonGroup.map((button) => (
                    <ButtonComponent
                        key={button.name}
                        iconImage={getButtonIcon(button)}
                        text={button.text}
                        isVisible={button.isVisible}
                        isDisabled={button.isDisabled}
                        onClick={() => propagateClick(button.name, button.state)}
                        isHourglass={button.name === "Hourglass" || button.name === "TimeDenial"}
                        customSpriteName={button.customSpriteName}
                        numberOfOptions={button.numberOfOptions}
                        selectedOption={button.selectedOption}
                        isAttackType={button.name === "AttackType"}
                        showOnBadge={button.name === "AI" && button.state === VisibleButtonState.SECOND}
                        showDeniedSlash={button.name === "TimeDenial"}
                    />
                ))}
            </Box>
        ),

        [buttonGroup, propagateClick],
    );

    // Every button hides itself when it is not applicable (ButtonComponent returns null), so on the
    // opponent's turn the group is non-empty but renders nothing. Drop the layout column too when there is
    // nothing inside it.
    const hasVisibleButton = buttonGroup.some((button) => button.isVisible);

    return hasVisibleButton ? (
        <StyledSheet
            sx={{
                // In-flow inside the right sidebar. This wrapper only positions the medallions; it paints
                // no panel, cell or background of its own.
                position: "relative",
                width: "auto",
                flex: "none",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 1,
                userSelect: "none",
                // A pure shift: no compensating padding, so the column keeps its own width and simply moves.
                ...(flushToTrim
                    ? {
                          marginLeft: `-${TRIM_OVERHANG_PX}px`,
                          // Up past the sidebar's own padding to sit just under the screen edge, and down
                          // over the full height of the row (which claims the bar's slack), so the column
                          // runs from the top of the screen to the top of the log.
                          marginTop: `-${TOOLBAR_TOP_LIFT_PX}px`,
                          // Height comes from the buttons and nothing else.
                          alignSelf: "flex-start",
                      }
                    : {}),
            }}
        >
            {buttonsContent}
        </StyledSheet>
    ) : null;
};

export default DraggableToolbar;
