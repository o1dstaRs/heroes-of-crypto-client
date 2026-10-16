import { Box, Switch, Typography } from "@mui/joy";
import React from "react";

import { setPremiumSuggestedMoves } from "../../settings/premiumSuggestedMoves";
import { useTranslation } from "../../i18n/i18n";
import { hocFontFamily } from "../hocTheme";
import { PremiumIcon } from "../PremiumIcon";
import { PremiumSearchSlot } from "./PremiumSearch";
import { usePremiumSuggestedMoves } from "./usePremiumSuggestedMoves";

/** Fight footer: chat stays available whether or not the player wants board suggestions. */
export const PremiumFightControls: React.FC = () => {
    const suggestedMoves = usePremiumSuggestedMoves();
    const { t } = useTranslation();
    return (
        <Box
            data-premium-fight-controls
            sx={{
                width: "100%",
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "center",
                columnGap: 1.5,
                rowGap: 0.75,
            }}
        >
            <PremiumSearchSlot inline />
            <Switch
                size="sm"
                checked={suggestedMoves}
                onChange={(event) => setPremiumSuggestedMoves(event.target.checked)}
                slotProps={{ input: { "aria-label": t("Suggested moves") } }}
                startDecorator={
                    <Typography
                        startDecorator={<PremiumIcon size={14} />}
                        sx={{ color: "#efcfaf", fontFamily: hocFontFamily, fontSize: "0.72rem" }}
                    >
                        {t("Suggested moves")}
                    </Typography>
                }
                sx={{
                    flexShrink: 0,
                    "--Switch-trackWidth": "30px",
                    "--Switch-trackHeight": "18px",
                    "--Switch-thumbSize": "12px",
                    "--Switch-gap": "6px",
                    "& .MuiSwitch-track": {
                        bgcolor: suggestedMoves ? "#a75023" : "#40352e",
                        border: "1px solid",
                        borderColor: suggestedMoves ? "#d97d38" : "#745540",
                    },
                    "&:hover .MuiSwitch-track": { bgcolor: suggestedMoves ? "#bd602b" : "#59483b" },
                    "& .MuiSwitch-thumb": { bgcolor: suggestedMoves ? "#ffe0bf" : "#bca78e" },
                }}
            />
        </Box>
    );
};
