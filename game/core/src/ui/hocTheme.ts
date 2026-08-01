export const hocColors = {
    black: "#070504",
    panel: "rgba(14, 9, 5, 0.94)",
    panelSoft: "rgba(23, 14, 7, 0.9)",
    orange: "#ff8f00",
    orangeDeep: "#d66f00",
    orangeSoft: "rgba(255, 143, 0, 0.16)",
    orangeBorder: "rgba(255, 143, 0, 0.42)",
    gold: "#dcb158",
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
export const hocFontFamily = '"Open Sans", Verdana, sans-serif';

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
    color: hocColors.black,
    bgcolor: hocColors.orange,
    border: `1px solid ${hocColors.gold}`,
    "&:hover": {
        bgcolor: hocColors.gold,
        color: hocColors.black,
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
    bgcolor: hocColors.orangeSoft,
    border: `1px solid ${hocColors.orangeBorder}`,
    "&:hover": {
        bgcolor: "rgba(255, 143, 0, 0.26)",
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

/** Destructive action (Delete): the same frame in the palette's ember red. */
export const hocActionDangerButtonSx = {
    ...hocActionButtonBaseSx,
    color: hocColors.parchment,
    bgcolor: "rgba(255, 90, 63, 0.16)",
    border: `1px solid rgba(255, 90, 63, 0.5)`,
    "&:hover": {
        bgcolor: "rgba(255, 90, 63, 0.3)",
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
