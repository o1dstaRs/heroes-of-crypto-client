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
