import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import { Box, Stack, Switch, Typography } from "@mui/joy";
import React, { useId, useState } from "react";

import { t } from "../../i18n/i18n";
import { setPremiumPreference, type PremiumPreference } from "../../settings/premiumPreferences";
import { hocColors } from "../hocTheme";
import { usePremiumPreference } from "./usePremiumPreference";
import { PremiumIcon } from "../PremiumIcon";

const PremiumSetting: React.FC<{
    preference: PremiumPreference;
    label: string;
    description: string;
    disabled?: boolean;
}> = ({ preference, label, description, disabled = false }) => {
    const checked = usePremiumPreference(preference);
    const id = useId();
    return (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, opacity: disabled ? 0.5 : 1 }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography id={`${id}-label`} level="body-sm" sx={{ color: hocColors.parchment, fontWeight: 750 }}>
                    {label}
                </Typography>
                <Typography
                    id={`${id}-description`}
                    level="body-xs"
                    sx={{ color: "rgba(239,228,204,0.58)", mt: 0.2, lineHeight: 1.45 }}
                >
                    {description}
                </Typography>
            </Box>
            <Switch
                size="sm"
                checked={checked}
                disabled={disabled}
                onChange={(event) => setPremiumPreference(preference, event.target.checked)}
                slotProps={{ input: { "aria-labelledby": `${id}-label`, "aria-describedby": `${id}-description` } }}
                sx={{
                    flexShrink: 0,
                    "& .MuiSwitch-track": { bgcolor: checked ? "#a75023" : "#40352e" },
                    "& .MuiSwitch-thumb": { bgcolor: "#ffe0bf" },
                }}
            />
        </Box>
    );
};

export const PremiumSettings: React.FC<{ reason: string }> = ({ reason }) => {
    const enabled = usePremiumPreference("enabled");
    const [open, setOpen] = useState(false);
    const panelId = useId();
    const reasonText =
        reason === "calibration"
            ? t("Included during calibration.")
            : reason === "test"
              ? t("Included during testing.")
              : t("Available with your Premium access.");
    return (
        <Box data-testid="premium-settings">
            <Box
                component="button"
                type="button"
                aria-expanded={open}
                aria-controls={open ? panelId : undefined}
                onClick={() => setOpen((current) => !current)}
                sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    width: "100%",
                    m: 0,
                    p: 0,
                    border: 0,
                    appearance: "none",
                    background: "transparent",
                    color: "inherit",
                    font: "inherit",
                    textAlign: "left",
                    cursor: "pointer",
                    "&:focus-visible": {
                        outline: "1px solid rgba(220,177,88,0.75)",
                        outlineOffset: 3,
                        borderRadius: "4px",
                    },
                }}
            >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                        component="span"
                        level="body-xs"
                        startDecorator={<PremiumIcon size={18} />}
                        sx={{
                            color: "var(--hoc-premium-accent)",
                            fontWeight: 800,
                            letterSpacing: "0.14em",
                            textTransform: "uppercase",
                        }}
                    >
                        {t("Premium")}
                    </Typography>
                    <Typography
                        component="span"
                        level="body-xs"
                        sx={{ display: "block", color: "rgba(239,228,204,0.58)", mt: 0.5 }}
                    >
                        {reasonText}
                    </Typography>
                </Box>
                <KeyboardArrowDownIcon
                    aria-hidden
                    sx={{
                        flexShrink: 0,
                        color: "var(--hoc-premium-accent)",
                        transform: open ? "rotate(180deg)" : "none",
                        transition: "transform 150ms ease",
                    }}
                />
            </Box>
            {open && (
                <Stack id={panelId} spacing={1.4} sx={{ mt: 1.3 }}>
                    <PremiumSetting
                        preference="enabled"
                        label={t("Premium assistance")}
                        description={t("Turn all Premium capabilities on or off. Your individual choices are kept.")}
                    />
                    <PremiumSetting
                        preference="chat"
                        label={t("Ask Premium")}
                        description={t("Show the chat button for questions about the game and your match.")}
                        disabled={!enabled}
                    />
                    <PremiumSetting
                        preference="draft"
                        label={t("Draft advice")}
                        description={t("Highlight recommended picks and show notes on your army so far.")}
                        disabled={!enabled}
                    />
                    <PremiumSetting
                        preference="setup"
                        label={t("Army setup guidance")}
                        description={t("Recommend builds and arrange your army during placement.")}
                        disabled={!enabled}
                    />
                    <PremiumSetting
                        preference="suggestedMoves"
                        label={t("Suggested moves")}
                        description={t("Draw recommended actions on the battlefield during combat.")}
                        disabled={!enabled}
                    />
                </Stack>
            )}
        </Box>
    );
};
