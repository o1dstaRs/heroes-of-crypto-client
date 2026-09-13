import Button from "@mui/joy/Button";
import Modal from "@mui/joy/Modal";
import ModalDialog from "@mui/joy/ModalDialog";
import Stack from "@mui/joy/Stack";
import Typography from "@mui/joy/Typography";
import React from "react";

import { ExitRulesPreviewNote } from "./ExitRulesPreviewNote";
import type { IExitRulesInfo } from "./exitRulesModel";
import { t, useTranslation } from "../../i18n/i18n";
import { hocColors, hocPanelSx, hocSoftButtonSx } from "../hocTheme";

const Heading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <Typography level="title-md" sx={{ color: hocColors.parchment, mt: 1 }}>
        {children}
    </Typography>
);

const Line: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <Typography level="body-sm" textColor={hocColors.mutedStrong}>
        {children}
    </Typography>
);

/** "Leaving a ranked match" in the client: the same rules the website publishes (plan §10), phase 2 edition. */
export const LeaveRulesDialog: React.FC<{ open: boolean; onClose: () => void; rules?: IExitRulesInfo }> = ({
    open,
    onClose,
    rules,
}) => {
    useTranslation();
    return (
        <Modal open={open} onClose={onClose}>
            <ModalDialog sx={{ ...hocPanelSx, maxWidth: 560, overflowY: "auto" }}>
                <Typography level="h4" sx={{ color: hocColors.parchment }}>
                    {t("Leaving a ranked match")}
                </Typography>
                <Stack spacing={1} sx={{ mt: 1 }}>
                    <Line>{t("You can always leave, but when you leave decides how it counts.")}</Line>
                    {rules && <ExitRulesPreviewNote rules={rules} />}

                    <Heading>{t("Concede or Abandon")}</Heading>
                    <Line>
                        {t(
                            "Board casualties count the XP destroyed across both armies: every stack is worth its creatures' XP at the start of the fight, and summoned creatures don't count. Hold Alt during a fight to see them.",
                        )}
                    </Line>
                    <Line>
                        {t(
                            "Once half the board's XP is destroyed, leaving is a Concede: an ordinary loss, with no strike. It stays that way for the rest of the match.",
                        )}
                    </Line>
                    <Line>
                        {t(
                            "Before that, or during the draft or placement, leaving is an Abandon: a loss, and a 5-minute wait before you can queue ranked again. 3 abandons in a row suspend your ranked play until support reviews it.",
                        )}
                    </Line>
                    <Line>
                        {t("The line is the same for every player, and no ending ever halves the rating change.")}
                    </Line>

                    <Heading>{t("During calibration")}</Heading>
                    <Line>
                        {t(
                            "If you abandon while you're still calibrating, the match is unscored for both players. It still counts as an abandon for you.",
                        )}
                    </Line>

                    <Heading>{t("If you disconnect or step away")}</Heading>
                    <Line>
                        {t(
                            "Each match gives you 5 minutes of away time: time disconnected after the first 10 seconds of each drop, turns that run out while you're connected, and draft picks made for you.",
                        )}
                    </Line>
                    <Line>
                        {t(
                            "While you're away, your units only wait or defend. The match ends for you when your away time runs out, when you miss 4 turns in a row, or when 3 of your draft picks are made for you. It counts as a Concede or an Abandon by the rule above.",
                        )}
                    </Line>

                    <Heading>{t("Money and server problems")}</Heading>
                    <Line>
                        {t(
                            "If you abandon, your wager goes to your opponent and bets on the match are refunded. If our servers have a problem, the match is voided: no result, no penalty, and stakes are returned.",
                        )}
                    </Line>
                    <Line>{t("Casual lobby and vs-AI matches have no penalties.")}</Line>
                </Stack>
                <Stack direction="row" justifyContent="flex-end" sx={{ mt: 1.5 }}>
                    <Button variant="plain" onClick={onClose} sx={hocSoftButtonSx}>
                        {t("Close")}
                    </Button>
                </Stack>
            </ModalDialog>
        </Modal>
    );
};
