import Button from "@mui/joy/Button";
import Modal from "@mui/joy/Modal";
import ModalDialog from "@mui/joy/ModalDialog";
import Stack from "@mui/joy/Stack";
import Typography from "@mui/joy/Typography";
import React, { useState } from "react";

import { ExitCasualtyMeter } from "./ExitCasualtyMeter";
import { ExitRulesPreviewNote } from "./ExitRulesPreviewNote";
import type { ExitRulesPhase, IExitRulesInfo, IExitStanding, LeaveOutcome } from "./exitRulesModel";
import { LeaveRulesDialog } from "./LeaveRulesDialog";
import { useRankedExitRules } from "./useRankedExitRules";
import { t, useTranslation } from "../../i18n/i18n";
import { hocColors, hocPanelSx, hocSoftButtonSx } from "../hocTheme";

export interface ExitMatchDialogProps {
    open: boolean;
    phase: ExitRulesPhase;
    outcome: LeaveOutcome;
    rules: IExitRulesInfo;
    /** Placement and fight show the board meter; the draft has no board yet. */
    standing?: IExitStanding;
    vsAi?: boolean;
    busy?: boolean;
    error?: string;
    onConfirm: () => void | Promise<void>;
    onCancel: () => void;
}

/**
 * The one exit dialog for the draft, placement and the fight (plan §5): it names what leaving right now counts as, before
 * the click. The safe choice is always the filled button on the right.
 */
export const ExitMatchDialog: React.FC<ExitMatchDialogProps> = ({
    open,
    phase,
    outcome,
    rules,
    standing,
    vsAi = false,
    busy = false,
    error,
    onConfirm,
    onCancel,
}) => {
    useTranslation();
    const lockRules = useRankedExitRules();
    const [rulesOpen, setRulesOpen] = useState(false);
    const dangerous = outcome === "abandon" || outcome === "unscored";

    const title =
        outcome === "casual"
            ? t("Leave this match?")
            : outcome === "concede"
              ? t("Concede this match?")
              : phase === "draft"
                ? t("Leave the draft?")
                : t("Abandon this match?");

    let body: string;
    if (outcome === "casual") {
        body = vsAi
            ? t("The AI wins this match. Nothing else changes.")
            : t("This is a casual match: your opponent wins, and nothing else changes.");
    } else if (outcome === "concede") {
        body = t(
            "Half the battlefield has fallen, so leaving now is a Concede: an ordinary loss, with no strike and no cooldown.",
        );
    } else if (outcome === "unscored") {
        body = t(
            "You're still in your calibration matches, so abandoning makes this match unscored for both players: nobody wins, loses or gains rating. It still counts as an abandon for you.",
        );
    } else {
        body =
            phase === "fight"
                ? t("Less than half the battlefield has fallen, so leaving now is an Abandon.")
                : t("The fight hasn't started, so leaving now is an Abandon.");
    }

    const confirmLabel =
        outcome === "casual" ? t("Leave match") : outcome === "concede" ? t("Concede") : t("Abandon match");
    const cancelLabel =
        phase === "draft" ? t("Back to draft") : phase === "placement" ? t("Back to placement") : t("Keep playing");

    return (
        <>
            <Modal open={open} onClose={() => !busy && onCancel()}>
                <ModalDialog sx={hocPanelSx}>
                    <Typography level="h4" sx={{ color: dangerous ? hocColors.danger : hocColors.parchment }}>
                        {title}
                    </Typography>
                    <Stack spacing={1.5} sx={{ mt: 1, minWidth: 300, maxWidth: 380 }}>
                        {standing && phase !== "draft" && outcome !== "casual" && (
                            <ExitCasualtyMeter standing={standing} />
                        )}
                        <Typography level="body-sm" textColor={hocColors.mutedStrong}>
                            {body}
                        </Typography>
                        {outcome === "abandon" && (
                            <Stack component="ul" spacing={0.5} sx={{ m: 0, pl: 2.5 }}>
                                <Typography component="li" level="body-sm" textColor={hocColors.mutedStrong}>
                                    {t("You take the loss, at full rating")}
                                </Typography>
                                <Typography component="li" level="body-sm" textColor={hocColors.mutedStrong}>
                                    {t("You wait 5 minutes before you can queue ranked again")}
                                </Typography>
                                <Typography component="li" level="body-sm" textColor={hocColors.mutedStrong}>
                                    {lockRules?.lockRulesEnforced
                                        ? t("2 abandons in a row lock ranked for 24 hours, 3 in a row for 7 days")
                                        : t("3 abandons in a row suspend your ranked play")}
                                </Typography>
                            </Stack>
                        )}
                        <ExitRulesPreviewNote rules={rules} />
                        {error && (
                            <Typography level="body-sm" color="danger">
                                {error}
                            </Typography>
                        )}
                        <Stack direction="row" spacing={1} alignItems="center">
                            {outcome !== "casual" && (
                                <Button
                                    variant="plain"
                                    size="sm"
                                    onClick={() => setRulesOpen(true)}
                                    sx={{ ...hocSoftButtonSx, mr: "auto", px: 0.5 }}
                                >
                                    {t("How leaving works")}
                                </Button>
                            )}
                            <Stack direction="row" spacing={1} sx={{ ml: "auto" }}>
                                <Button
                                    variant="plain"
                                    color={dangerous ? "danger" : "neutral"}
                                    loading={busy}
                                    onClick={() => void onConfirm()}
                                    sx={dangerous ? undefined : hocSoftButtonSx}
                                >
                                    {confirmLabel}
                                </Button>
                                <Button variant="solid" disabled={busy} onClick={onCancel}>
                                    {cancelLabel}
                                </Button>
                            </Stack>
                        </Stack>
                    </Stack>
                </ModalDialog>
            </Modal>
            <LeaveRulesDialog open={rulesOpen} onClose={() => setRulesOpen(false)} rules={rules} />
        </>
    );
};
