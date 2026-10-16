import Box from "@mui/joy/Box";
import React, { useCallback, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

import { registerVolumeSlot, VOLUME_SLOT_PRIORITY } from "./audio/volumeSlot";
import { FullscreenToggle } from "./RightSideBar/FullscreenToggle";

export const GAME_SYSTEM_CONTROLS_SIDE_INSET = "1rem";
export const GAME_SYSTEM_CONTROLS_BOTTOM_INSET = "1rem";
/**
 * Horizontal room a page must leave in the bottom-left corner for FullscreenCorner: the button itself plus
 * its inset from the edge plus a small gap. Pages whose content reaches that corner (the arena's chat room)
 * step their content clear by this much instead of letting the button land on it.
 */
export const FULLSCREEN_CORNER_CLEARANCE = "3.5rem";

export const GAME_SYSTEM_CONTROLS_CENTER_WIDTH = "min(209px, calc(100vw - 8rem))";
export const GAME_SYSTEM_CONTROLS_STACK_GAP = "0.33rem";
/** Both corner medallions (fullscreen, sound) are square and this size; other rows align against it. */
export const GAME_SYSTEM_CONTROL_SIZE_PX = 32;

/**
 * Draft variant: both system buttons share the right-hand corner, on ONE line — sound immediately left of
 * fullscreen, which keeps the corner itself. The social dock's medallion continues that same line further
 * left, so every corner control reads as a single row.
 */
export const GAME_SYSTEM_CONTROLS_STACK_GAP_PX = 5.28;
/** The footer plate (EXIT FIGHT, PLAY RANKED) that a host can put in the centre slot. */
export const GAME_SYSTEM_CONTROLS_CENTER_HEIGHT_PX = 35.2;
/** That plate's authored width, and so the width below which the footer row wraps instead of squeezing. */
export const GAME_SYSTEM_CONTROLS_CENTER_MIN_WIDTH_PX = 209;
/**
 * Height a host must reserve beneath its own content. The footer is one line wherever the plate fits
 * beside the controls and wraps to two where it does not, so reserve the taller of the two shapes.
 */
export const GAME_SYSTEM_CONTROLS_STACK_HEIGHT_PX =
    GAME_SYSTEM_CONTROL_SIZE_PX + GAME_SYSTEM_CONTROLS_STACK_GAP_PX + GAME_SYSTEM_CONTROLS_CENTER_HEIGHT_PX;
/** Sound and fullscreen, the pair the social dock measures from. */
export const GAME_SYSTEM_CONTROLS_STACK_WIDTH_PX = GAME_SYSTEM_CONTROL_SIZE_PX * 2 + GAME_SYSTEM_CONTROLS_STACK_GAP_PX;
/**
 * The whole right-hand corner: the social medallion, sound and fullscreen, with the same gap between
 * each. A centred plate reserves an empty flank of this width on the left so the plate stays on the
 * row's midpoint instead of centring in whatever space is left of the buttons.
 */
export const GAME_SYSTEM_CONTROLS_CORNER_FLANK_PX =
    GAME_SYSTEM_CONTROL_SIZE_PX * 3 + GAME_SYSTEM_CONTROLS_STACK_GAP_PX * 2;
export const gameSystemControlsStackSx = {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: GAME_SYSTEM_CONTROLS_STACK_GAP,
    pointerEvents: "auto",
} as const;

const volumeSlotSx = {
    width: GAME_SYSTEM_CONTROL_SIZE_PX,
    height: GAME_SYSTEM_CONTROL_SIZE_PX,
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
} as const;

export const gameSystemControlsSx = {
    position: "fixed",
    left: GAME_SYSTEM_CONTROLS_SIDE_INSET,
    right: GAME_SYSTEM_CONTROLS_SIDE_INSET,
    bottom: GAME_SYSTEM_CONTROLS_BOTTOM_INSET,
    display: "grid",
    gridTemplateColumns: `${GAME_SYSTEM_CONTROL_SIZE_PX}px minmax(0, 1fr) ${GAME_SYSTEM_CONTROL_SIZE_PX}px`,
    // END, not centre: the centre cell is whatever the phase puts there — the ranked footer, the ranked
    // panel, an EXIT FIGHT button — and it alone sets the row's height. Centring floated the 32px side
    // cells up by half the difference, so in a fight the speaker hovered above the social dock's buttons
    // while the row's own bottom inset said otherwise (owner report 2026-09-19). Anchoring the sides to
    // the bottom keeps fullscreen and volume on the dock's line whatever the centre grows to.
    alignItems: "end",
    pointerEvents: "none",
} as const;

/**
 * The fullscreen toggle on its own, pinned where the game row puts it.
 *
 * Screens outside a match — the arena at /play — have no phase row to hang controls on, but a player who
 * went fullscreen for a fight still wants the button when they come back out to queue (owner request
 * 2026-09-20). Sharing GameSystemControls' insets is the point: the button must not shift by a pixel
 * between the arena and the pick/fight screens, which it would the moment the two carried their own
 * numbers.
 *
 * Only the LEFT cell, deliberately. The full row would also lay an empty, click-catching 32px box in the
 * bottom-right corner, which on these screens is exactly where the social dock draws its own buttons.
 * Volume is left to whoever owns the slot there (the dock outranks this row anyway — see volumeSlot).
 *
 * Portalled to the body for the same reason the row is: it must not be clipped by a scrolling page.
 */
export const FullscreenCorner: React.FC<{ zIndex?: number }> = ({ zIndex = 60 }) => {
    if (typeof document === "undefined") {
        return null;
    }
    return createPortal(
        <Box
            data-fullscreen-corner
            sx={{
                position: "fixed",
                left: GAME_SYSTEM_CONTROLS_SIDE_INSET,
                bottom: GAME_SYSTEM_CONTROLS_BOTTOM_INSET,
                display: "flex",
                pointerEvents: "auto",
                zIndex,
                // A scrolling page slides its content under this button on the way past. The medallion is
                // cut out, so page text showed straight through it; a dark disc behind keeps the control
                // readable at every scroll position without reading as a second button.
                borderRadius: "50%",
                bgcolor: "rgba(10, 8, 6, 0.62)",
                boxShadow: "0 2px 10px rgba(0, 0, 0, 0.45)",
                backdropFilter: "blur(2px)",
            }}
        >
            <FullscreenToggle />
        </Box>,
        document.body,
    );
};

/**
 * One viewport-anchored home for the controls that must not jump when the game changes phase.
 *
 * Portalling to the document body keeps the row out of the sidebars' overflow clipping. The three slots
 * span the viewport during picks, or the right sidebar during placement and combat.
 */
export const GameSystemControls: React.FC<{
    center?: React.ReactNode;
    /** An action left of the centre plate, with equal gaps to it and the right-hand controls. */
    leading?: { content: React.ReactNode; width: number };
    sidebarWidth?: number;
    priority?: number;
    zIndex?: number;
    /** Stack sound above fullscreen in the right corner instead of splitting them across the row. */
    rightStack?: boolean;
    /**
     * Centre the plate between a leading action and the corner controls, or on the row when there is
     * no leading action. Off for a centre that must use all the width beside the buttons (the ranked
     * fight panel).
     */
    centerInRow?: boolean;
    /** Minimum content width beside the corner controls; smaller for the compact Premium fight footer. */
    centerMinWidth?: number;
    /** Keep sidebar content clear when the footer wraps after a resize or fullscreen change. */
    onHeightChange?: (height: number) => void;
}> = ({
    center,
    leading,
    sidebarWidth,
    priority = VOLUME_SLOT_PRIORITY.gameControls,
    zIndex = 60,
    rightStack = false,
    centerInRow = false,
    centerMinWidth = GAME_SYSTEM_CONTROLS_CENTER_MIN_WIDTH_PX,
    onHeightChange,
}) => {
    const controlsRef = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const controls = controlsRef.current;
        if (!controls || !onHeightChange) return;
        const measure = () => onHeightChange(Math.ceil(controls.getBoundingClientRect().height));
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(controls);
        return () => observer.disconnect();
    }, [onHeightChange, rightStack]);
    // The corner row is rebuilt when the footer changes shape (placement plate → fight). A layout
    // effect keyed only on priority would keep publishing the detached node, and the speaker —
    // portaled into that node — vanishes for the rest of the fight.
    const releaseVolumeSlot = useRef<() => void>(() => {});
    const volumeSlotRef = useCallback(
        (element: HTMLDivElement | null) => {
            releaseVolumeSlot.current();
            releaseVolumeSlot.current = element ? registerVolumeSlot(element, priority) : () => {};
        },
        [priority],
    );

    const anchorSx = {
        ...(sidebarWidth !== undefined
            ? { left: `calc(100% - ${sidebarWidth}px + ${GAME_SYSTEM_CONTROLS_SIDE_INSET})` }
            : {}),
        zIndex,
    };
    const leadingGap = 12;
    // Shrink the two text actions together down to 85%, then give them separate rows. Container
    // queries use the footer's real available width, including fullscreen and browser text scaling.
    const wrapLeadingQuery = `@container game-footer (max-width: ${
        ((leading?.width ?? 0) + GAME_SYSTEM_CONTROLS_CENTER_MIN_WIDTH_PX) * 0.85 +
        GAME_SYSTEM_CONTROLS_CORNER_FLANK_PX +
        leadingGap * 2
    }px)`;
    const stackLeadingQuery = `@container game-footer (max-width: ${
        (leading?.width ?? 0) + GAME_SYSTEM_CONTROLS_CORNER_FLANK_PX + leadingGap
    }px)`;

    const cornerRow = (
        <Box
            sx={{
                ...gameSystemControlsStackSx,
                // The social dock's medallion continues this row one control further left, but it is a
                // fixed element of its own and takes no space here. The padding is its slot, and the
                // fixed width is that slot plus sound and fullscreen, so a matching empty flank can
                // centre the plate.
                boxSizing: "border-box",
                width: GAME_SYSTEM_CONTROLS_CORNER_FLANK_PX,
                flexShrink: 0,
                gap: `${GAME_SYSTEM_CONTROLS_STACK_GAP_PX}px`,
                pl: `${GAME_SYSTEM_CONTROL_SIZE_PX + GAME_SYSTEM_CONTROLS_STACK_GAP_PX}px`,
            }}
        >
            <Box ref={volumeSlotRef} sx={volumeSlotSx} />
            <FullscreenToggle />
        </Box>
    );

    /**
     * One line. The corner controls keep the right edge. A plate that asks to be centred
     * (`centerInRow`) sits between the two flanks. A supplied leading action takes its actual width,
     * so the gaps beside the plate match even when that action is wider than the corner controls.
     */
    const controls = rightStack ? (
        <Box
            ref={controlsRef}
            data-game-system-controls
            sx={{
                position: "fixed",
                left: GAME_SYSTEM_CONTROLS_SIDE_INSET,
                right: GAME_SYSTEM_CONTROLS_SIDE_INSET,
                bottom: GAME_SYSTEM_CONTROLS_BOTTOM_INSET,
                display: "flex",
                flexDirection: "row",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: GAME_SYSTEM_CONTROLS_STACK_GAP,
                pointerEvents: "none",
                containerType: "inline-size",
                containerName: "game-footer",
                ...anchorSx,
            }}
        >
            {centerInRow ? (
                <Box
                    sx={{
                        display: leading ? "flex" : "grid",
                        flex: "1 1 100%",
                        width: "100%",
                        minWidth: 0,
                        gridTemplateColumns: `${GAME_SYSTEM_CONTROLS_CORNER_FLANK_PX}px minmax(0, 1fr) ${GAME_SYSTEM_CONTROLS_CORNER_FLANK_PX}px`,
                        columnGap: leading ? `${leadingGap}px` : 0,
                        justifyContent: leading ? "space-between" : undefined,
                        alignItems: "end",
                        ...(leading
                            ? {
                                  [wrapLeadingQuery]: {
                                      display: "grid",
                                      gridTemplateColumns: `minmax(0, 1fr) ${GAME_SYSTEM_CONTROLS_CORNER_FLANK_PX}px`,
                                      rowGap: "6px",
                                  },
                                  [stackLeadingQuery]: { gridTemplateColumns: "minmax(0, 1fr)" },
                              }
                            : {}),
                    }}
                >
                    <Box
                        aria-hidden={leading ? undefined : true}
                        sx={{
                            gridColumn: 1,
                            gridRow: 1,
                            minWidth: 0,
                            flex: leading ? `0 1 ${leading.width}px` : undefined,
                            pointerEvents: leading ? "auto" : "none",
                            ...(leading ? { [wrapLeadingQuery]: { gridRow: 2 } } : {}),
                        }}
                    >
                        {leading?.content}
                    </Box>
                    <Box
                        sx={{
                            gridColumn: 2,
                            gridRow: 1,
                            minWidth: 0,
                            flex: leading ? `0 1 ${GAME_SYSTEM_CONTROLS_CENTER_MIN_WIDTH_PX}px` : undefined,
                            containerType: "inline-size",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            pointerEvents: center ? "auto" : "none",
                            ...(leading ? { [wrapLeadingQuery]: { gridColumn: "1 / -1" } } : {}),
                        }}
                    >
                        {center}
                    </Box>
                    <Box
                        aria-hidden
                        sx={{
                            gridColumn: 3,
                            gridRow: 1,
                            flex: `0 0 ${GAME_SYSTEM_CONTROLS_CORNER_FLANK_PX}px`,
                            minHeight: GAME_SYSTEM_CONTROL_SIZE_PX,
                            ...(leading
                                ? {
                                      [wrapLeadingQuery]: { gridColumn: 2, gridRow: 2 },
                                      [stackLeadingQuery]: { gridColumn: 1, gridRow: 3 },
                                  }
                                : {}),
                        }}
                    />
                </Box>
            ) : (
                <Box
                    sx={{
                        flex: "1 1 auto",
                        // Its own line as soon as the plate cannot keep its authored width beside the
                        // controls; below that threshold this slot no longer fits, and the row wraps.
                        minWidth: `min(100%, ${centerMinWidth}px)`,
                        // The corner row is taken out of flow so the speaker's host node survives a
                        // phase change. This padding is the space it still occupies.
                        paddingRight: `${GAME_SYSTEM_CONTROLS_CORNER_FLANK_PX}px`,
                        containerType: "inline-size",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        // An empty centre slot must not swallow clicks aimed at whatever sits behind it.
                        pointerEvents: center ? "auto" : "none",
                    }}
                >
                    {center}
                </Box>
            )}
            <Box sx={{ position: "absolute", right: 0, bottom: 0 }}>{cornerRow}</Box>
        </Box>
    ) : (
        <Box ref={controlsRef} data-game-system-controls sx={{ ...gameSystemControlsSx, ...anchorSx }}>
            <Box sx={{ display: "flex", justifyContent: "flex-start", pointerEvents: "auto" }}>
                <FullscreenToggle />
            </Box>
            <Box
                sx={{
                    width: sidebarWidth !== undefined ? "100%" : GAME_SYSTEM_CONTROLS_CENTER_WIDTH,
                    minWidth: 0,
                    justifySelf: "center",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    // An empty centre slot must not swallow clicks aimed at whatever sits behind it.
                    pointerEvents: center ? "auto" : "none",
                }}
            >
                {center}
            </Box>
            <Box ref={volumeSlotRef} sx={{ ...volumeSlotSx, pointerEvents: "auto" }} />
        </Box>
    );

    return typeof document === "undefined" ? controls : createPortal(controls, document.body);
};

export default GameSystemControls;
