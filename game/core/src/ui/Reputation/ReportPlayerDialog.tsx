import Button from "@mui/joy/Button";
import Modal from "@mui/joy/Modal";
import ModalDialog from "@mui/joy/ModalDialog";
import Radio from "@mui/joy/Radio";
import RadioGroup from "@mui/joy/RadioGroup";
import Stack from "@mui/joy/Stack";
import Textarea from "@mui/joy/Textarea";
import Typography from "@mui/joy/Typography";
import React, { useState } from "react";

import { rankedRequestErrorMessage } from "../../api/ranked_conduct_client";
import {
    REPORT_CATEGORIES,
    REPORT_NOTE_MAX_CHARS,
    submitPlayerReport,
    type ReportCategory,
} from "../../api/report_client";
import { t, tf, useTranslation } from "../../i18n/i18n";
import { hocColors, hocPanelSx, hocSoftButtonSx } from "../hocTheme";

const categoryLabel = (category: ReportCategory): string => {
    switch (category) {
        case "away_or_ai":
            return t("Was away, or let the AI play");
        case "win_trading":
            return t("Win trading or boosting");
        case "cheating":
            return t("Cheating or exploiting a bug");
        case "abusive":
            return t("Abusive name or chat");
        default:
            return t("Something else");
    }
};

/**
 * "Report player" from a ranked results screen (integrity phase 4, §9): pick what happened and optionally say more.
 * The server attaches the match's evidence, allows one report per match and 5 a day, and never locks anyone on a
 * report alone.
 */
export const ReportPlayerDialog: React.FC<{
    open: boolean;
    gameId: string;
    opponentName: string;
    onClose: () => void;
}> = ({ open, gameId, opponentName, onClose }) => {
    const { language } = useTranslation();
    const [category, setCategory] = useState<ReportCategory | "">("");
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [sent, setSent] = useState(false);

    const close = (): void => {
        if (!busy) {
            onClose();
        }
    };

    const send = async (): Promise<void> => {
        if (!category) {
            return;
        }
        setBusy(true);
        setError("");
        try {
            await submitPlayerReport({ gameId, category, note });
            setSent(true);
        } catch (err) {
            setError(rankedRequestErrorMessage(err, t("Couldn't send the report. Please try again.")));
        } finally {
            setBusy(false);
        }
    };

    const date = new Intl.DateTimeFormat(language === "ru" ? "ru-RU" : "en-GB", {
        day: "numeric",
        month: "short",
    }).format(new Date());

    return (
        <Modal open={open} onClose={close}>
            <ModalDialog sx={{ ...hocPanelSx, maxWidth: 440 }} data-testid="report-player-dialog">
                <Typography level="body-xs" textColor={hocColors.muted}>
                    {tf("Ranked match · {date}", { date })}
                </Typography>
                <Typography level="h4" sx={{ color: hocColors.parchment }}>
                    {tf("Report {name}", { name: opponentName })}
                </Typography>
                {sent ? (
                    <Stack spacing={1.5} sx={{ mt: 1 }}>
                        <Typography level="body-sm" textColor={hocColors.mutedStrong}>
                            {t("Thanks. If we act on this, you'll get a notification.")}
                        </Typography>
                        <Stack direction="row" justifyContent="flex-end">
                            <Button variant="solid" onClick={onClose}>
                                {t("Close")}
                            </Button>
                        </Stack>
                    </Stack>
                ) : (
                    <Stack spacing={1.25} sx={{ mt: 1 }}>
                        <Typography id="report-category-label" level="title-sm" sx={{ color: hocColors.parchment }}>
                            {t("What happened?")}
                        </Typography>
                        <RadioGroup
                            aria-labelledby="report-category-label"
                            value={category}
                            onChange={(event) => setCategory(event.target.value as ReportCategory)}
                        >
                            {REPORT_CATEGORIES.map((value) => (
                                <Radio
                                    key={value}
                                    value={value}
                                    label={categoryLabel(value)}
                                    disabled={busy}
                                    sx={{ color: hocColors.mutedStrong }}
                                />
                            ))}
                        </RadioGroup>
                        <Typography component="label" htmlFor="report-note" level="body-sm" textColor={hocColors.muted}>
                            {t("Anything we should look at? (optional)")}
                        </Typography>
                        <Textarea
                            slotProps={{ textarea: { id: "report-note", maxLength: REPORT_NOTE_MAX_CHARS } }}
                            minRows={2}
                            maxRows={6}
                            value={note}
                            disabled={busy}
                            onChange={(event) => setNote(event.target.value)}
                        />
                        <Typography level="body-xs" textColor={hocColors.muted}>
                            {t("Reports never lock anyone on their own: a person reviews them, with the match's data.")}
                        </Typography>
                        {error && (
                            <Typography level="body-sm" color="danger">
                                {error}
                            </Typography>
                        )}
                        <Stack direction="row" spacing={1} justifyContent="flex-end">
                            <Button variant="plain" onClick={close} disabled={busy} sx={hocSoftButtonSx}>
                                {t("Cancel")}
                            </Button>
                            <Button variant="solid" loading={busy} disabled={!category} onClick={() => void send()}>
                                {t("Send report")}
                            </Button>
                        </Stack>
                    </Stack>
                )}
            </ModalDialog>
        </Modal>
    );
};
