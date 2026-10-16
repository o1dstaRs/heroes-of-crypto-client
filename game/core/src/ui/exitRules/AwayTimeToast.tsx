import Snackbar from "@mui/joy/Snackbar";
import Stack from "@mui/joy/Stack";
import Typography from "@mui/joy/Typography";
import React, { useEffect, useRef, useState } from "react";

import { awayNoticeDue, formatAwayClock, formatRulesDate, type IExitStanding } from "./exitRulesModel";
import { t, tf, useTranslation } from "../../i18n/i18n";
import { hocColors } from "../hocTheme";

/**
 * After a reconnect or a missed turn in a ranked match: how much of the away allowance is used and what happens when it
 * runs out (plan §5, "Coming back after a disconnect"). While the rules are only announced it says when they start.
 */
export const AwayTimeToast: React.FC<{ standing: IExitStanding }> = ({ standing }) => {
    const { language } = useTranslation();
    const [open, setOpen] = useState(false);
    const [shown, setShown] = useState<IExitStanding | undefined>();
    const lastShownRef = useRef({ absenceUsedMs: 0, missedTurns: 0 });

    useEffect(() => {
        if (awayNoticeDue(standing, lastShownRef.current)) {
            lastShownRef.current = { absenceUsedMs: standing.absenceUsedMs, missedTurns: standing.missedTurns };
            setShown(standing);
            setOpen(true);
        }
    }, [standing]);

    if (!shown) {
        return null;
    }
    const used = formatAwayClock(shown.absenceUsedMs);
    const budget = formatAwayClock(shown.absenceBudgetMs);
    const left = formatAwayClock(Math.max(0, shown.absenceBudgetMs - shown.absenceUsedMs));
    let headline: string;
    let consequence = "";
    if (shown.enforced) {
        headline = tf("You were away {used} this match. If you're away another {left}, the match ends for you.", {
            used,
            left,
        });
        consequence = shown.unlocked
            ? t("It would count as a Concede: half the board is already destroyed.")
            : t("It would count as an Abandon unless half the board is destroyed by then.");
    } else if (shown.enforceAtMs > 0) {
        headline = tf("You were away {used} this match. From {date}, away time is limited to {budget} per match.", {
            used,
            budget,
            date: formatRulesDate(shown.enforceAtMs, language),
        });
    } else {
        headline = tf("You were away {used} this match. Soon, away time will be limited to {budget} per match.", {
            used,
            budget,
        });
    }

    return (
        <Snackbar
            open={open}
            onClose={() => setOpen(false)}
            autoHideDuration={9000}
            anchorOrigin={{ vertical: "top", horizontal: "center" }}
            variant="soft"
            sx={{
                zIndex: 2000,
                maxWidth: 520,
                background: "rgba(20, 15, 10, 0.94)",
                border: "1px solid rgba(220,177,88,.45)",
            }}
        >
            <Stack spacing={0.5}>
                <Typography level="body-sm" sx={{ color: hocColors.parchment }}>
                    {headline}
                </Typography>
                {consequence && (
                    <Typography level="body-xs" textColor={hocColors.mutedStrong}>
                        {consequence}
                    </Typography>
                )}
            </Stack>
        </Snackbar>
    );
};
