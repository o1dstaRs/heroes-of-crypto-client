import Box from "@mui/joy/Box";
import Stack from "@mui/joy/Stack";
import Typography from "@mui/joy/Typography";
import React from "react";

import { casualtyPercent, formatXp, type IExitStanding } from "./exitRulesModel";
import { t, tf, useTranslation } from "../../i18n/i18n";
import { hocColors } from "../hocTheme";

/**
 * Board casualties against the 50% line: one number that rises toward a marked line, never "units remaining" (plan §3).
 * Green once the line has been reached, because from then on leaving is an ordinary loss.
 */
export const ExitCasualtyMeter: React.FC<{ standing: IExitStanding }> = ({ standing }) => {
    useTranslation();
    const percent = casualtyPercent(standing.boardBp);
    const fill = standing.unlocked ? hocColors.green : hocColors.gold;
    return (
        <Stack spacing={0.5} sx={{ width: "100%", minWidth: 0 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="baseline" spacing={1}>
                <Typography level="body-xs" textColor={hocColors.mutedStrong} sx={{ minWidth: 0 }}>
                    {standing.xpTotal > 0
                        ? tf("Board destroyed · {destroyed} / {total} XP", {
                              destroyed: formatXp(standing.xpDestroyed),
                              total: formatXp(standing.xpTotal),
                          })
                        : t("The fight hasn't started: nothing destroyed yet")}
                </Typography>
                <Typography level="title-sm" sx={{ color: fill, fontVariantNumeric: "tabular-nums" }}>
                    {`${percent}%`}
                </Typography>
            </Stack>
            <Box
                role="meter"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
                sx={{
                    position: "relative",
                    height: 8,
                    borderRadius: 2,
                    background: "rgba(239, 228, 204, 0.14)",
                    overflow: "visible",
                }}
            >
                <Box sx={{ width: `${percent}%`, height: "100%", borderRadius: 2, background: fill }} />
                <Box
                    aria-hidden
                    sx={{
                        position: "absolute",
                        left: "50%",
                        top: -3,
                        bottom: -3,
                        width: 2,
                        background: hocColors.parchment,
                        boxShadow: "0 0 4px rgba(0,0,0,.8)",
                    }}
                />
            </Box>
        </Stack>
    );
};
