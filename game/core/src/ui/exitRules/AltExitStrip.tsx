import Stack from "@mui/joy/Stack";
import Typography from "@mui/joy/Typography";
import React from "react";

import { ExitCasualtyMeter } from "./ExitCasualtyMeter";
import { ExitRulesPreviewNote } from "./ExitRulesPreviewNote";
import { formatAwayClock, type IExitStanding } from "./exitRulesModel";
import { t, tf, useTranslation } from "../../i18n/i18n";
import { hocColors } from "../hocTheme";

/** Under the Up Next row while Alt is held: board casualties, what leaving now counts as, and away time (plan §5). */
export const AltExitStrip: React.FC<{ standing: IExitStanding }> = ({ standing }) => {
    useTranslation();
    const status =
        standing.leaveOutcome === "concede"
            ? t("Leaving now: Concede, no penalty")
            : standing.leaveOutcome === "unscored"
              ? t("Leaving now: Abandon, unscored for both")
              : standing.leaveOutcome === "abandon"
                ? t("Leaving now: Abandon")
                : t("Casual match: leaving has no penalty");
    const statusColor =
        standing.leaveOutcome === "concede" || standing.leaveOutcome === "casual" ? hocColors.green : hocColors.danger;
    return (
        <Stack
            spacing={0.5}
            sx={{
                mt: 1,
                width: "min(520px, 100%)",
                px: 1.5,
                py: 1,
                borderRadius: 6,
                background: "rgba(10, 8, 6, 0.72)",
                border: "1px solid rgba(220, 177, 88, 0.35)",
                whiteSpace: "normal",
            }}
        >
            {standing.leaveOutcome !== "casual" && <ExitCasualtyMeter standing={standing} />}
            <Stack direction="row" flexWrap="wrap" justifyContent="space-between" columnGap={1.5}>
                <Typography level="body-sm" sx={{ color: statusColor, fontWeight: 700 }}>
                    {status}
                </Typography>
                {standing.ranked && (
                    <Typography level="body-xs" textColor={hocColors.mutedStrong}>
                        {standing.unlocked
                            ? t("Concede unlocked for the rest of the match")
                            : t("Concede unlocks at 50%")}
                        {standing.absenceUsedMs > 0
                            ? ` · ${tf("Away time {used} / {budget}", {
                                  used: formatAwayClock(standing.absenceUsedMs),
                                  budget: formatAwayClock(standing.absenceBudgetMs),
                              })}`
                            : ""}
                    </Typography>
                )}
            </Stack>
            <ExitRulesPreviewNote rules={standing} compact />
        </Stack>
    );
};
