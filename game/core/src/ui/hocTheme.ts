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
