import { HOC_NUMERIC_FONT_FAMILY } from "../fontFamilies";
import { images } from "../generated/image_imports";

const sidebarSectionFrames = {
    army: images.ui_container_frame_1_9slice,
    board: images.ui_container_frame_2_9slice,
    team: images.ui_container_frame_2_9slice,
} as const;

const sidebarSectionFrameSlices = {
    army: "120 120 120 120",
    board: "104 104 104 104",
    team: "104 104 104 104",
} as const;

export const hocColors = {
    black: "#070504",
    panel: "rgba(14, 9, 5, 0.94)",
    panelSoft: "rgba(23, 14, 7, 0.9)",
    orange: "#ff8f00",
    orangeDeep: "#d66f00",
    orangeSoft: "rgba(255, 143, 0, 0.16)",
    orangeBorder: "rgba(255, 143, 0, 0.42)",
    gold: "#dcb158",
    sidebarTitle: "#d8c29c",
    parchment: "#efe4cc",
    muted: "rgba(239, 228, 204, 0.66)",
    mutedStrong: "rgba(239, 228, 204, 0.8)",
    danger: "#ff5a3f",
    // The green the player portal already scores wins in, promoted here so the Start button and any future
    // "go" affordance share one tone instead of each inventing their own.
    green: "#46d160",
    greenDeep: "#2f9b45",
};

export const hocPanelSx = {
    bgcolor: hocColors.panel,
    borderColor: hocColors.orangeBorder,
    color: hocColors.parchment,
    boxShadow: "0 14px 38px rgba(0,0,0,0.55)",
};

export const hocPrimaryButtonSx = {
    bgcolor: hocColors.orange,
    color: hocColors.black,
    fontWeight: 800,
    border: `1px solid ${hocColors.gold}`,
    "&:hover": {
        bgcolor: hocColors.gold,
        color: hocColors.black,
    },
    "&.Mui-disabled": {
        bgcolor: "rgba(255, 143, 0, 0.24)",
        color: "rgba(239, 228, 204, 0.42)",
    },
};

export const hocSoftButtonSx = {
    color: hocColors.parchment,
    bgcolor: hocColors.orangeSoft,
    border: `1px solid ${hocColors.orangeBorder}`,
    "&:hover": {
        bgcolor: "rgba(255, 143, 0, 0.24)",
    },
};

/**
 * The app's own typeface — the same stack `style.scss` puts on <body> and RenderableUnit puts on the board,
 * so panel labels and board labels read as one family. Stated explicitly on the action buttons below because
 * MUI Joy's Button sets its own fontFamily from the Joy theme and would otherwise not inherit it.
 */
export const hocFontFamily = HOC_NUMERIC_FONT_FAMILY;

/**
 * Project display face built for carved fantasy headings and controls. It contains Latin, Cyrillic,
 * numerals and punctuation; use the family alone when colour belongs to the component, or spread
 * `hocEngravedTextSx` for the same bronze-on-stone finish as the START plate.
 */
export const hocDisplayFontFamily = '"HoC Forge", Georgia, "Times New Roman", serif';
export const hocDisplayLetterSpacing = "0.121em";

export const hocEngravedTextSx = {
    fontFamily: hocDisplayFontFamily,
    fontStyle: "normal",
    fontWeight: 400,
    fontSynthesis: "none",
    letterSpacing: hocDisplayLetterSpacing,
    color: "#c89b70",
    WebkitTextStroke: "0.018em rgba(48,29,18,.9)",
    paintOrder: "stroke fill",
    textShadow: "0 .055em 0 #080605, 0 -.018em 0 rgba(255,220,171,.2), 0 .08em .15em rgba(0,0,0,.72)",
} as const;

/**
 * Shared look for the sidebar's action buttons (Start / Accept / Clone / Split / Delete). They used to be
 * background images with the wording BAKED INTO the artwork, which meant the labels neither scaled with the
 * bar nor matched any other text in the game. These draw the frame in CSS and set the label in hocFontFamily.
 */
const hocActionButtonBaseSx = {
    fontFamily: hocFontFamily,
    fontWeight: 700,
    letterSpacing: "0.09em",
    textTransform: "uppercase" as const,
    borderRadius: "3px",
    lineHeight: 1,
    transition: "background-color 0.15s ease, border-color 0.15s ease, transform 0.08s ease",
    "&:active": {
        transform: "translateY(1px)",
    },
};

/** Primary action (Start, Accept): filled ember, the loudest thing in the bar. */
export const hocActionPrimaryButtonSx = {
    ...hocActionButtonBaseSx,
    // Deep amber instead of the old flat #ff8f00 slab: about a third of its brightness, so it sits in the
    // darkened sidebar instead of glaring out of it. It is still plainly the brightest control on the bar —
    // the primary/secondary hierarchy survives on the fill AND on the gold rim, which the soft buttons lack.
    color: hocColors.parchment,
    bgcolor: "#7a4405",
    border: `1px solid ${hocColors.gold}`,
    "&:hover": {
        bgcolor: "#9c5806",
        color: hocColors.parchment,
    },
    "&.Mui-disabled": {
        bgcolor: "rgba(255, 143, 0, 0.2)",
        color: "rgba(239, 228, 204, 0.45)",
        border: `1px solid rgba(255, 143, 0, 0.28)`,
    },
};

/** Secondary action (Clone, Split): outlined, so it never competes with the primary beside it. */
export const hocActionSoftButtonSx = {
    ...hocActionButtonBaseSx,
    color: hocColors.parchment,
    // Roughly half the former wash, so Clone / Split read as raised panel rather than as amber tiles.
    bgcolor: "rgba(255, 143, 0, 0.09)",
    border: `1px solid ${hocColors.orangeBorder}`,
    "&:hover": {
        bgcolor: "rgba(255, 143, 0, 0.18)",
        borderColor: hocColors.orange,
        color: hocColors.orange,
    },
};

/**
 * Start: the one "go" button in the bar, so it steps out of the ember palette into the portal's green and
 * breathes a soft halo to draw the eye. The glow is a box-shadow pulse rather than the old 73-frame sprite
 * animation — no atlas to decode, and it keeps working at any size. Held still for anyone who has asked the
 * system for reduced motion.
 */
export const hocStartButtonSx = {
    ...hocActionButtonBaseSx,
    color: "#06210c",
    // 1% transparent (was 10%, dialled back by 9 points): just enough for the leather to bleed through and
    // stop the fill reading as a flat sticker. The fill alone is softened — dropping the element's own
    // opacity would have dimmed the label and border with it.
    bgcolor: "rgba(70, 209, 96, 0.99)",
    border: `1px solid ${hocColors.greenDeep}`,
    "@keyframes hocStartPulse": {
        "0%, 100%": { boxShadow: `0 0 6px 0 rgba(70, 209, 96, 0.28)` },
        "50%": { boxShadow: `0 0 16px 3px rgba(70, 209, 96, 0.62)` },
    },
    animation: "hocStartPulse 2.4s ease-in-out infinite",
    "&:hover": {
        bgcolor: "rgba(94, 224, 119, 0.99)",
        color: "#06210c",
        borderColor: hocColors.green,
    },
    "&.Mui-disabled": {
        animation: "none",
        boxShadow: "none",
        bgcolor: "rgba(70, 209, 96, 0.16)",
        color: "rgba(239, 228, 204, 0.45)",
        border: `1px solid rgba(70, 209, 96, 0.28)`,
    },
    "@media (prefers-reduced-motion: reduce)": {
        animation: "none",
    },
};

/**
 * The obsidian shell the floating toolbar column wears: a dark vertical gradient inside a bronze outline,
 * with an inner rim and a drop shadow so it reads as a raised, framed control rather than a flat strip of
 * sidebar. Shared here so collapsible headers can be built to look like that toolbar instead of like plain
 * list rows. (DraggableToolbar still carries its own copy of these numbers; it can adopt this later.)
 */
export const hocObsidianPanelSx = {
    // Neutral fill to match the board-tinted sidebars; the bronze rim stays as the accent.
    backgroundImage: "linear-gradient(180deg, rgba(21,21,19,.96), rgba(6,6,6,.96))",
    borderRadius: "14px",
    border: "2.34px solid #3a382f",
    boxShadow: "0 6px 20px rgba(0,0,0,.75), inset 0 0 0 1px rgba(150,130,98,.2), inset 0 0 16px rgba(0,0,0,.6)",
};

/** Exact OFF/ON radio artwork cropped from the user-selected concept sheet. */
export const hocFantasyRadioSx = {
    "& .MuiRadio-radio": {
        position: "relative",
        width: "23.4px",
        height: "23.4px",
        flex: "0 0 23.4px",
        border: "none",
        borderRadius: "50%",
        color: "transparent",
        backgroundColor: "transparent",
        backgroundImage: `url(${images.ui_fantasy_radio_off})`,
        backgroundSize: "100% 100%",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        boxShadow: "none",
    },
    "& .MuiRadio-radio.Mui-checked": {
        color: "transparent",
        backgroundColor: "transparent",
        backgroundImage: `url(${images.ui_fantasy_radio_on})`,
        boxShadow: "none",
    },
    "& .MuiRadio-radio::before, & .MuiRadio-radio::after": {
        display: "none",
    },
} as const;

/**
 * Exact frame cut from the supplied HUD reference.  `border-image` treats it as a 9-slice: the four real
 * corners remain undistorted while the original left/right and top/bottom rails stretch to the section's
 * current dimensions.  The centre of the screenshot is never painted, so none of its Green-row content
 * leaks into these controls.
 */
export const hocSidebarSectionSx = (variant: keyof typeof sidebarSectionFrames) => ({
    position: "relative" as const,
    width: "100%",
    overflow: "hidden",
    boxSizing: "border-box" as const,
    border: "10px solid transparent",
    borderImageSource: `url(${sidebarSectionFrames[variant]})`,
    borderImageSlice: sidebarSectionFrameSlices[variant],
    borderImageWidth: "10px",
    // Extend opened sections by repeating the original side-rail texture instead of stretching one strip.
    borderImageRepeat: "stretch round",
    borderImageOutset: 0,
    borderRadius: 0,
    background: "rgba(5, 6, 6, 0.66)",
    boxShadow: "0 7px 16px rgba(0,0,0,.72), inset 0 0 18px rgba(0,0,0,.58)",
});

/** Header row inside hocSidebarSectionSx. */
export const hocSidebarSectionHeaderSx = {
    minHeight: "64px",
    px: 2,
    py: 1.25,
    borderRadius: 0,
    borderBottom: "1px solid rgba(112, 75, 42, 0.35)",
    backgroundColor: "rgba(0,0,0,.1)",
    "--ListItemButton-hoverBackground": "transparent",
    "--ListItemButton-selectedBackground": "transparent",
    transform: "scale(1)",
    transformOrigin: "center",
    transition: "transform .16s ease, box-shadow .18s ease",
    "@media (max-height: 800px)": {
        minHeight: "52px",
        py: 0.5,
    },
    "&:hover": {
        backgroundColor: "transparent !important",
        transform: "scale(1.018)",
        boxShadow: "inset 0 0 18px rgba(188,119,49,.08)",
    },
    "&:focus-visible, &.Mui-selected, &.Mui-selected:hover": {
        backgroundColor: "transparent !important",
    },
};

/** Image-backed fantasy action button used by the setup controls in the right sidebar. */
export const hocSidebarImageButtonSx = (variant: "primary" | "neutral" | "danger" = "neutral") => ({
    fontFamily: hocDisplayFontFamily,
    fontWeight: 800,
    fontSynthesis: "weight",
    letterSpacing: hocDisplayLetterSpacing,
    textTransform: "uppercase" as const,
    color: "#cda078",
    minHeight: "45px",
    border: 0,
    borderRadius: 0,
    backgroundColor: "transparent",
    backgroundImage: `${
        variant === "primary"
            ? "linear-gradient(rgba(105,48,18,.46),rgba(105,48,18,.46))"
            : variant === "danger"
              ? "linear-gradient(rgba(92,10,10,.58),rgba(92,10,10,.58))"
              : "linear-gradient(rgba(4,5,6,.16),rgba(4,5,6,.16))"
    }, url(${images.ui_start_button_plate_trimmed})`,
    backgroundBlendMode: "color, normal",
    backgroundSize: "100% 100%",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    WebkitTextStroke: "0.045em rgba(43,25,15,.96)",
    paintOrder: "stroke fill",
    textShadow: "0 .075em 0 #070504, 0 -.022em 0 rgba(255,222,178,.24), 0 .12em .08em rgba(0,0,0,.82)",
    filter: "brightness(.9) saturate(.88)",
    transition: "filter .15s ease, transform .08s ease",
    "&:hover": {
        backgroundColor: "transparent",
        color: "#d8ab80",
        filter: "brightness(1.09) contrast(1.04) drop-shadow(0 0 7px rgba(224,83,34,.28))",
    },
    "&:active": { transform: "translateY(1px)", filter: "brightness(.92)" },
    "&.Mui-disabled": { opacity: 0.42, color: "rgba(232,211,173,.65)", filter: "grayscale(.65) brightness(.68)" },
});

/** Destructive action (Delete): the same frame in the palette's ember red. */
export const hocActionDangerButtonSx = {
    ...hocActionButtonBaseSx,
    color: hocColors.parchment,
    bgcolor: "rgba(255, 90, 63, 0.10)",
    border: `1px solid rgba(255, 90, 63, 0.5)`,
    "&:hover": {
        bgcolor: "rgba(255, 90, 63, 0.22)",
        borderColor: hocColors.danger,
        color: hocColors.danger,
    },
};

// Error/alert styling in the game's palette (MUI Joy's default `color="danger"` renders a pink that's
// off-theme, especially on the un-themed loading/error screens). Uses hocColors.danger (an ember red-orange).
export const hocDangerAlertSx = {
    bgcolor: "rgba(255, 90, 63, 0.14)",
    color: hocColors.parchment,
    border: `1px solid rgba(255, 90, 63, 0.5)`,
};

// Spinner in the game's orange instead of MUI Joy's default blue.
export const hocSpinnerSx = {
    "--CircularProgress-progressColor": hocColors.orange,
    "--CircularProgress-trackColor": "rgba(255, 143, 0, 0.18)",
};

export const hocInputSx = {
    bgcolor: "rgba(0,0,0,0.28)",
    color: hocColors.parchment,
    borderColor: hocColors.orangeBorder,
    "--Input-focusedHighlight": hocColors.orange,
    "&:hover": {
        borderColor: hocColors.orange,
    },
    "& input::placeholder": {
        color: "rgba(239, 228, 204, 0.42)",
        opacity: 1,
    },
};
