import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Sheet, Box, Tooltip } from "@mui/joy";
import { styled } from "@mui/system";

import { images } from "../../generated/image_imports";
import { TRIM_WIDTH_PX as BOARD_EDGE_TRIM_WIDTH_PX } from "../boardEdgeTrim";

const spellbookIconImage = new URL("../../../images/icon_spellbook_black.webp", import.meta.url).toString();
const hourglassIconImage = images.combat_toolbar_hourglass;
const swordIconImage = new URL("../../../images/icon_sword_black.webp", import.meta.url).toString();
const bowIconImage = new URL("../../../images/icon_bow_black.webp", import.meta.url).toString();
const scepterIconImage = new URL("../../../images/icon_scepter_black.webp", import.meta.url).toString();
const aiIconImage = new URL("../../../images/icon_ai_black.webp", import.meta.url).toString();
const skipIconImage = new URL("../../../images/icon_skip_black.webp", import.meta.url).toString();
const luckShieldIconImage = new URL("../../../images/icon_luck_shield_black.webp", import.meta.url).toString();
const activeOptionIconImage = new URL("../../../images/icon_active_option.webp", import.meta.url).toString();
const inactiveOptionIconImage = new URL("../../../images/icon_inactive_option.webp", import.meta.url).toString();
const toolbarPanelImage = images.combat_toolbar_panel;
const toolbarButtonStyleImage = images.combat_toolbar_button;

import { IVisibleButton, VisibleButtonState } from "../../scenes/VisibleState";
import { useButtonContext } from "../context/ButtonContext";

let SCREEN_RATIO = Math.min(window.innerWidth / 1366, window.innerHeight / 768);

const BUTTON_NAME_TO_ICON_IMAGE: Record<string, string> = {
    [`Spellbook${VisibleButtonState.FIRST}`]: spellbookIconImage,
    [`Hourglass${VisibleButtonState.FIRST}`]: hourglassIconImage,
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

/**
 * How each glyph is fitted into its button. `zoom` scales the art inside the button; `inset` pulls the whole
 * layer in from the rim so nothing touches the border.
 *
 * The atlas art is a gold medallion: an ornate bezel ring around a dark field with the glyph in the middle.
 * Only the GLYPH is wanted — the button draws the frame, so showing the medallion whole put a gold ring
 * inside the button's own rim and every icon read as two concentric frames.
 *
 * The crop is measured, not guessed. A radial luminance profile over all six icons puts the bezel's bright
 * ring at r ≈ 0.72–1.0 of the source radius, peaking at 0.80, with the glyph field inside r ≈ 0.70. Blowing
 * the art up to 160% pushes everything past r ≈ 0.62 outside the layer's circular clip, so the bezel is gone
 * with margin to spare while the glyph still sits comfortably inside.
 *
 * `inset` is a PERCENTAGE, so it scales the rendered glyph without touching the crop: the window stays the
 * same fraction of the source whatever the box size. 8.6% leaves the layer at 82.8% of the button — the
 * glyph a tenth smaller than a flush 4% inset, with a ring of bare disc around it.
 */
const GLYPH_CROP: Record<string, { zoom: number; inset: number }> = {
    // The selected polished hourglass is already a clean transparent cutout rather than an atlas
    // medallion, so it needs no bezel-removal zoom.
    [hourglassIconImage]: { zoom: 70, inset: 8.6 },
    // The AI medallion carries far more dead field than the others: its brain ends at r ≈ 0.58 of the
    // source while the bezel does not begin until r ≈ 0.70, so the default crop framed the glyph in a wide
    // ring of bare medallion, and the default inset added its own margin on top of that — together they
    // left the brain filling barely three quarters of the button.
    //
    // 172% puts the visible disc at r ≈ 0.58, right on the brain's own edge. Nothing of the glyph is lost:
    // the crown sparkles sit inside 0.58 too. This is well clear of the bezel, so raising the zoom here
    // costs nothing — the earlier 190/15 override went the other way and cropped INTO the brain.
    //
    // A flush inset 0 then let the brain run right out to the rim and bury the button's frame; 5% holds it
    // a tenth off the edge, which is where the frame reads again.
    [aiIconImage]: { zoom: 172, inset: 5 },
};
const GLYPH_CROP_DEFAULT = { zoom: 160, inset: 8.6 };

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
/**
 * The height the sidebar reserves for the button column.
 *
 * Six slots — the whole roster is Spellbook, Hourglass, AttackType, AI, Next and LuckShield — plus the
 * frame's padding and rim. It is a RESERVATION, not a measurement: buttons come and go as the turn changes
 * (none of them apply on the opponent's turn, and the frame hides itself entirely), and a row sized to
 * whatever happens to be visible would drag the damage table and the fight log up and down all fight. The
 * frame itself still hugs its buttons inside this box; what is fixed is the space the box occupies.
 */
export const toolbarColumnHeightPx = (): number => {
    const screenRatio = Math.min(window.innerWidth / 1366, window.innerHeight / 768);
    const slots = 6;
    const gap = 8; // the column's `gap: 1`
    const framePadding = 22; // 11px above the first button, 11px below the last
    const frameRim = 0; // the approved frame is painted inside that padding
    // Each medallion now sits in a square bronze cell, matching the compact combat-sidebar mockup.
    const cellSize = 57;
    return Math.round(cellSize * screenRatio * slots + gap * (slots - 1) + framePadding + frameRim);
};

// How far the option markers under a multi-state button sit from the centre of their row.
const OPTION_ARC_RADIUS = 7.6;

const GLYPH_FILTER = "drop-shadow(0 2px 3px rgba(0,0,0,.85))";
const GLYPH_FILTER_BRIGHT = "brightness(1.12) drop-shadow(0 2px 5px rgba(243,212,136,.45))";

// Obsidian shell from the fight-sidebar handoff. The old bronze-trimmed stone panel read as another gold
// frame competing with the board; this one recedes and lets the ember glyphs carry the colour.
const StyledSheet = styled(Sheet)(() => ({
    // One complete raster panel: frame and field are precomposed from the approved second mockup, so no
    // independently stretched rails can bow, drift, or leave seams at their corners.
    backgroundImage: `url(${toolbarPanelImage})`,
    backgroundPosition: "center",
    backgroundSize: "100% 100%",
    backgroundRepeat: "no-repeat",
    padding: "19px 10px 13px",
    boxSizing: "border-box",
    alignSelf: "stretch",
    height: "calc(100% + 19px)",
    // Collapse the unused side gutters around the 57px medallions. The row beside us is flexible, so every
    // pixel removed here is handed directly to the DAMAGE panel while this panel's left edge stays fixed.
    aspectRatio: "124 / 684",
    marginTop: "-7px",
    marginBottom: "-12px",
    borderRadius: 0,
    // The four rails above are literal crops from the approved concept, not a CSS approximation.
    border: 0,
    boxShadow: "0 6px 20px rgba(0,0,0,.75), inset 0 0 16px rgba(0,0,0,.72)",
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
    // The button draws the frame, not the art: an obsidian disc with a black rim, matching the panel it sits
    // on. The medallion's own gold bezel is cropped away (see GLYPH_CROP_DEFAULT) precisely so this one rim
    // is the only ring on screen. The glyph rides on the ::before layer, which keeps the filter off the disc.
    backgroundColor: "#211309",
    backgroundImage: `url(${toolbarButtonStyleImage})`,
    backgroundSize: "100% 100%",
    backgroundRepeat: "no-repeat",
    backgroundPosition: "center",
    border: 0,
    // The approved image ring already carries its own depth; a second CSS shadow made a thick black halo.
    boxShadow: "none",
    "&::before": {
        content: '""',
        position: "absolute",
        // Both values come from GLYPH_CROP, set per icon on the element (see ButtonComponent).
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
        transform: "scale(0.81)",
        transformOrigin: "center",
        transition: "filter 0.3s ease, transform 0.3s ease",
        pointerEvents: "none",
    },
    "&:hover:not(:disabled)": {
        transform: `scale(1.15) rotate(${rotationDegrees}deg)`,
        backgroundColor: "#211309",
        backgroundImage: `url(${toolbarButtonStyleImage})`,
        borderColor: "#8a7136",
        boxShadow: "none",
        filter: "brightness(1.12)",
        "&::before": { filter: GLYPH_FILTER_BRIGHT },
    },
    "&:disabled": {
        backgroundColor: "#160e08",
        backgroundImage: `url(${toolbarButtonStyleImage})`,
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
    /** Draws the "ON" badge over the artwork; the artwork itself stays put. */
    showOnBadge?: boolean;
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
    showOnBadge = false,
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
                                width: 57 * SCREEN_RATIO,
                                height: 57 * SCREEN_RATIO,
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
            {numberOfOptions > 1 && (
                <Box
                    sx={{
                        display: "flex",
                        justifyContent: "center",
                        position: "absolute",
                        bottom: 1 * SCREEN_RATIO,
                        left: 6 * SCREEN_RATIO,
                        width: 45 * SCREEN_RATIO,
                        height: 9.1 * SCREEN_RATIO,
                    }}
                >
                    {Array.from({ length: numberOfOptions }, (_, index) => {
                        const angle = (index / (numberOfOptions - 1)) * Math.PI;
                        // The arc's radius, not its centre — the row of dots stays centred under the button
                        // and only draws itself in. At the old 12.6 the two attack-type markers sat almost
                        // at the medallion's edges and read as two unrelated lights rather than as one
                        // two-state control.
                        const x = (12.6 + OPTION_ARC_RADIUS * Math.cos(angle) - 4.55) * SCREEN_RATIO;
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
                        text={button.name}
                        isVisible={button.isVisible}
                        isDisabled={button.isDisabled}
                        onClick={() => propagateClick(button.name, button.state)}
                        isHourglass={button.name === "Hourglass"}
                        customSpriteName={button.customSpriteName}
                        numberOfOptions={button.numberOfOptions}
                        selectedOption={button.selectedOption}
                        showOnBadge={button.name === "AI" && button.state === VisibleButtonState.SECOND}
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
                width: "auto",
                flex: "none",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 1,
                userSelect: "none",
                // A pure shift: no compensating padding, so the panel keeps its own width and simply moves
                // over. The damage table next to it is the flexible item in the row, so the width freed at
                // this panel's far edge goes to the table rather than to empty space.
                ...(flushToTrim
                    ? {
                          marginLeft: `-${TRIM_OVERHANG_PX}px`,
                          // Up past the sidebar's own padding to sit just under the screen edge, and down
                          // over the full height of the row (which claims the bar's slack), so the column
                          // runs from the top of the screen to the top of the log.
                          marginTop: `-${TOOLBAR_TOP_LIFT_PX}px`,
                          // Height comes from the buttons and nothing else. Stretching the frame over the
                          // row's full height left a long dead tail under the last medallion — the panel
                          // reached the fight log while the buttons stopped a third of the way down. The
                          // frame's own 12px padding now closes it off under the last button exactly as it
                          // opens above the first.
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
