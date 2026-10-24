import { images } from "../../generated/image_imports";
import { hocDisplayFontFamily } from "../hocTheme";

/** Shared by the accepted-match waiting screen, live draft and augment handoff. */
export const draftShellSx = {
    width: "100%",
    height: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    p: 0,
    // Share the warm obsidian-and-ember palette used by the fight-results screen.
    backgroundColor: "#0b0704",
    // Keep the complete tavern composition visible on both axes, matching the live draft.
    backgroundImage: `url(${images.pick_phase_heroic_hearth_tavern_background_v10})`,
    backgroundSize: "100% 100%",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    color: "#e9e6df",
    overflow: "hidden",
    position: "relative",
    fontFamily: hocDisplayFontFamily,
    "& *, & *::before, & *::after": {
        fontFamily: `${hocDisplayFontFamily} !important`,
    },
} as const;
