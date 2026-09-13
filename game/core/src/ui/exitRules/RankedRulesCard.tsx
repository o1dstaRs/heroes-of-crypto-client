import Button from "@mui/joy/Button";
import Modal from "@mui/joy/Modal";
import ModalDialog from "@mui/joy/ModalDialog";
import Stack from "@mui/joy/Stack";
import Typography from "@mui/joy/Typography";
import React, { useState } from "react";

import { ExitRulesPreviewNote } from "./ExitRulesPreviewNote";
import type { IExitRulesInfo } from "./exitRulesModel";
import { LeaveRulesDialog } from "./LeaveRulesDialog";
import { t, useTranslation } from "../../i18n/i18n";
import { hocColors, hocPanelSx, hocSoftButtonSx } from "../hocTheme";

/** Shown before a player's first ranked search, and again whenever the rules version changes (plan §10). */
export const RankedRulesCard: React.FC<{
    open: boolean;
    rules: IExitRulesInfo;
    busy?: boolean;
    error?: string;
    onAccept: () => void | Promise<void>;
    onClose: () => void;
}> = ({ open, rules, busy = false, error, onAccept, onClose }) => {
    useTranslation();
    const [fullRulesOpen, setFullRulesOpen] = useState(false);
    const points = [
        t(
            "Leave once half the board's XP is destroyed and it's an ordinary loss. Leave before that and it's an Abandon: a loss, and a 5-minute wait before your next ranked search.",
        ),
        t("If you abandon during your calibration matches, the match is unscored for both players."),
        t("You have 5 minutes of away time per match. While you're away, your units only wait or defend."),
        t("3 abandons in a row suspend your ranked play."),
    ];
    return (
        <>
            <Modal open={open} onClose={() => !busy && onClose()}>
                <ModalDialog sx={{ ...hocPanelSx, maxWidth: 440 }}>
                    <Typography level="h4" sx={{ color: hocColors.parchment }}>
                        {t("How ranked works")}
                    </Typography>
                    <Stack component="ul" spacing={1} sx={{ m: 0, mt: 1, pl: 2.5 }}>
                        {points.map((point) => (
                            <Typography key={point} component="li" level="body-sm" textColor={hocColors.mutedStrong}>
                                {point}
                            </Typography>
                        ))}
                    </Stack>
                    <ExitRulesPreviewNote rules={rules} />
                    {error && (
                        <Typography level="body-sm" color="danger">
                            {error}
                        </Typography>
                    )}
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1.5 }}>
                        <Button
                            variant="plain"
                            size="sm"
                            onClick={() => setFullRulesOpen(true)}
                            sx={{ ...hocSoftButtonSx, mr: "auto", px: 0.5 }}
                        >
                            {t("Read the full rules")}
                        </Button>
                        <Button variant="solid" loading={busy} onClick={() => void onAccept()}>
                            {t("Got it")}
                        </Button>
                    </Stack>
                </ModalDialog>
            </Modal>
            <LeaveRulesDialog open={fullRulesOpen} onClose={() => setFullRulesOpen(false)} rules={rules} />
        </>
    );
};
