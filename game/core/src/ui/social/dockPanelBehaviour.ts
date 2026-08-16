/**
 * The two decisions DockPanelShell makes, kept as pure functions so they can be tested without a DOM.
 *
 * The panel is a card in the bottom-right corner, never a full-screen modal. It used to be a centred
 * MUI Modal outside a fight, which blanked and blurred whatever you were reading — the portal included —
 * to show you a friend list.
 */

/** Width of the in-fight panel: the strip left beside the square, centred board. */
export const DOCK_PANEL_COLUMN_WIDTH = "clamp(300px, calc((100vw - min(100vw, 100vh)) / 2 - 16px), 460px)";

/** Marks the dock button row, so an outside-click does not fight the button's own toggle. */
export const DOCK_BUTTON_MARKER = "data-social-dock-button";

/**
 * In a fight the panel follows the sidebar column so it never covers the board; anywhere else it takes
 * the width the panel asked for, capped so a narrow window still fits it.
 */
export const dockPanelWidth = (inGame: boolean, width: number, maxWidth?: string): string =>
    inGame ? DOCK_PANEL_COLUMN_WIDTH : `min(${width}px, ${maxWidth ?? "94vw"})`;

export interface OutsidePointerContext {
    open: boolean;
    inGame: boolean;
    /** The pointer landed inside the panel card itself. */
    insidePanel: boolean;
    /** The pointer landed on one of the dock buttons. */
    onDockButton: boolean;
}

/**
 * Whether a pointer-down anywhere on the page should close the panel.
 *
 * This is the backdrop's old job without the backdrop. It deliberately does NOT apply in a fight: out
 * there a click on the board is a move, and dismissing a friend list must not cost the player a turn.
 * Clicks on the dock buttons are ignored too — those toggle the panel themselves, and closing here as
 * well would shut it on the way down and let the button reopen it on the way up.
 */
export const shouldDismissOnOutsidePointer = ({
    open,
    inGame,
    insidePanel,
    onDockButton,
}: OutsidePointerContext): boolean => open && !inGame && !insidePanel && !onDockButton;
