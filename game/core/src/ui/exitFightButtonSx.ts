import { hocSidebarImageButtonSx } from "./hocTheme";

import { FULLSCREEN_PRESENTATION_ATTRIBUTE } from "./fullscreen";

export const EXIT_FIGHT_BUTTON_MAX_WIDTH_PX = 209;
export const EXIT_FIGHT_FULLSCREEN_SIDE_GAP_PX = 22;

/**
 * Expand the fullscreen plate inside the flexible middle track while preserving an even visual gap to both
 * round controls. The 209px cap keeps the frame from becoming oversized on unusually wide sidebars.
 */
export const fullscreenExitFightButtonSx = {
    width: `min(${EXIT_FIGHT_BUTTON_MAX_WIDTH_PX}px, calc(100% - ${EXIT_FIGHT_FULLSCREEN_SIDE_GAP_PX * 2}px))`,
    inlineSize: `min(${EXIT_FIGHT_BUTTON_MAX_WIDTH_PX}px, calc(100% - ${EXIT_FIGHT_FULLSCREEN_SIDE_GAP_PX * 2}px))`,
    minWidth: 0,
    maxWidth: `${EXIT_FIGHT_BUTTON_MAX_WIDTH_PX}px`,
    flex: "0 0 auto",
    justifySelf: "center",
} as const;

/**
 * Shared sandbox/ranked exit plate. Fullscreen keeps equal breathing room between EXIT FIGHT and both round
 * footer controls, matching the compact footer composition used at the normal game size.
 */
export const exitFightButtonSx = (isFullscreen: boolean) =>
    ({
        ...hocSidebarImageButtonSx("danger"),
        justifySelf: "center",
        width: `min(100%, ${EXIT_FIGHT_BUTTON_MAX_WIDTH_PX}px)`,
        ...(isFullscreen ? fullscreenExitFightButtonSx : {}),
        // The CSS fullscreen pseudo-class is the source of truth for the toolbar button. It also covers
        // browsers that enter fullscreen successfully but delay or omit the event consumed by React.
        [`html[${FULLSCREEN_PRESENTATION_ATTRIBUTE}="true"] &`]: fullscreenExitFightButtonSx,
        "html:fullscreen &": fullscreenExitFightButtonSx,
        "html:-webkit-full-screen &": fullscreenExitFightButtonSx,
        height: "35.2px",
        minHeight: "35.2px",
        px: 1,
        backgroundSize: "100% 100%",
        fontSize: "0.924rem",
        fontWeight: 880,
        whiteSpace: "nowrap",
    }) as const;

/**
 * Sized against the sound and fullscreen medallions, the other two corner controls, whose slots are
 * GAME_SYSTEM_CONTROL_SIZE_PX (32) square. Those two are ROUND artwork, so a filled square of the same
 * width reads clearly bigger — its corners add about a quarter more painted area. 32 * sqrt(pi) / 2 ≈ 28
 * is the square carrying the same optical mass as a 32px disc, which is what makes the three read as one
 * set. Change this only together with the medallion size.
 */
export const PICK_EXIT_CLOSE_BUTTON_SIZE_PX = 28;

/**
 * Draft corner exit. The full EXIT FIGHT plate owned the bottom-centre slot the picks themselves want; the
 * same forfeit now reads as a window close in the corner — small, unmistakably red, and out of the cards' way.
 */
export const pickExitCloseButtonSx = {
    width: `${PICK_EXIT_CLOSE_BUTTON_SIZE_PX}px`,
    height: `${PICK_EXIT_CLOSE_BUTTON_SIZE_PX}px`,
    minWidth: `${PICK_EXIT_CLOSE_BUTTON_SIZE_PX}px`,
    minHeight: `${PICK_EXIT_CLOSE_BUTTON_SIZE_PX}px`,
    p: 0,
    borderRadius: "5px",
    border: "1px solid rgba(255,150,150,.52)",
    background: "linear-gradient(180deg, rgba(158,34,34,.95), rgba(92,17,17,.96))",
    boxShadow: "0 3px 9px rgba(0,0,0,.5), inset 0 1px rgba(255,214,214,.18)",
    color: "#ffe3e3",
    fontFamily: "Georgia, serif",
    fontSize: "1.02rem",
    fontWeight: 800,
    lineHeight: 1,
    transition: "filter 140ms ease, transform 120ms ease",
    "&:hover": {
        background: "linear-gradient(180deg, rgba(190,44,44,.97), rgba(112,20,20,.97))",
        filter: "brightness(1.08)",
        transform: "scale(1.06)",
    },
    "&:active": { transform: "scale(.96)" },
} as const;
