import Box from "@mui/joy/Box";
import Button from "@mui/joy/Button";
import Stack from "@mui/joy/Stack";
import Textarea from "@mui/joy/Textarea";
import Typography from "@mui/joy/Typography";
import React, { useState } from "react";

import { formatRulesDate } from "./exitRulesModel";
import { LeaveRulesDialog } from "./LeaveRulesDialog";
import { appealDraftValid, appealStateText, lockGameText, lockReasonText } from "./lockModel";
import {
    rankedRequestErrorMessage,
    submitRankedAppeal,
    type RankedConduct,
    type RankedConductLock,
} from "../../api/ranked_conduct_client";
import { t, tf, useTranslation } from "../../i18n/i18n";
import { hocColors, hocPanelSx, hocSoftButtonSx } from "../hocTheme";

/**
 * The Ranked Arena while a lock is in force (plan §7, "The lock screen and appeal"): why it happened, the matches behind
 * it, and the one appeal the player can send, or where that appeal stands.
 */
export const RankedLockPanel: React.FC<{
    conduct: RankedConduct;
    lock: RankedConductLock;
    onChange: () => void;
}> = ({ conduct, lock, onChange }) => {
    const { language } = useTranslation();
    const [message, setMessage] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [rulesOpen, setRulesOpen] = useState(false);
    const minChars = conduct.rules.appealMinChars;
    const maxChars = conduct.rules.appealMaxChars;
    const appeal = conduct.appeal;
    const mutedUntil = conduct.appealMutedUntil > conduct.serverTimeMs ? conduct.appealMutedUntil : 0;

    const send = async (): Promise<void> => {
        setBusy(true);
        setError("");
        try {
            await submitRankedAppeal(message.trim());
            setMessage("");
            onChange();
        } catch (err) {
            setError(rankedRequestErrorMessage(err, t("Couldn't send your appeal. Please try again.")));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Box sx={{ ...hocPanelSx, p: 2, textAlign: "left" }} data-testid="ranked-lock-panel">
            <Stack spacing={1.25}>
                <Typography level="body-sm" textColor={hocColors.mutedStrong}>
                    {lockReasonText(lock.reason, lock.gameIds.length)}
                </Typography>
                {conduct.lockGames.length > 0 && (
                    <Stack component="ul" spacing={0.5} sx={{ m: 0, pl: 2.5 }}>
                        {conduct.lockGames.map((game) => (
                            <Typography
                                key={game.gameId}
                                component="li"
                                level="body-sm"
                                textColor={hocColors.mutedStrong}
                            >
                                {tf("vs {opponent} on {date}", {
                                    opponent: game.opponentUsername || t("Unknown opponent"),
                                    date: formatRulesDate(game.finishedTime, language),
                                })}
                                {" · "}
                                {lockGameText(game)}
                            </Typography>
                        ))}
                    </Stack>
                )}

                {appeal ? (
                    <Stack spacing={0.5}>
                        <Typography level="body-sm" textColor={hocColors.parchment}>
                            {appealStateText(appeal)}
                        </Typography>
                        {appeal.note && (
                            <Typography level="body-sm" textColor={hocColors.mutedStrong}>
                                {tf("Reviewer's note: {note}", { note: appeal.note })}
                            </Typography>
                        )}
                    </Stack>
                ) : mutedUntil ? (
                    <Typography level="body-sm" textColor={hocColors.mutedStrong}>
                        {tf("Appeals are paused on this account until {date}.", {
                            date: formatRulesDate(mutedUntil, language),
                        })}
                    </Typography>
                ) : (
                    <Stack spacing={0.75}>
                        <Typography
                            component="label"
                            htmlFor="ranked-appeal-message"
                            level="title-sm"
                            sx={{ color: hocColors.parchment }}
                        >
                            {t("Something went wrong? Tell us what happened.")}
                        </Typography>
                        <Textarea
                            slotProps={{ textarea: { id: "ranked-appeal-message", maxLength: maxChars } }}
                            minRows={3}
                            maxRows={8}
                            value={message}
                            disabled={busy}
                            onChange={(event) => setMessage(event.target.value)}
                        />
                        <Stack direction="row" spacing={1} alignItems="center">
                            <Typography level="body-xs" textColor={hocColors.muted} sx={{ mr: "auto" }}>
                                {tf(
                                    "At least {min} characters. One message per lock; we reply in your notifications.",
                                    {
                                        min: minChars,
                                    },
                                )}{" "}
                                {tf("{count} / {max} characters", { count: message.trim().length, max: maxChars })}
                            </Typography>
                            <Button
                                size="sm"
                                variant="solid"
                                loading={busy}
                                disabled={!appealDraftValid(message, minChars, maxChars)}
                                onClick={() => void send()}
                            >
                                {t("Send for review")}
                            </Button>
                        </Stack>
                        {error && (
                            <Typography level="body-sm" color="danger">
                                {error}
                            </Typography>
                        )}
                    </Stack>
                )}

                <Button
                    variant="plain"
                    size="sm"
                    onClick={() => setRulesOpen(true)}
                    sx={{ ...hocSoftButtonSx, alignSelf: "flex-start", px: 0.5 }}
                >
                    {t("Read the full rules")}
                </Button>
            </Stack>
            <LeaveRulesDialog open={rulesOpen} onClose={() => setRulesOpen(false)} />
        </Box>
    );
};
