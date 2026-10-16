import Button from "@mui/joy/Button";
import Tooltip from "@mui/joy/Tooltip";
import React, { useState } from "react";
import { useNavigate } from "react-router";

import { useAuthContext } from "./auth/context/auth_context";
import { pickExitCloseButtonSx } from "./exitFightButtonSx";
import { ExitMatchDialog } from "./exitRules/ExitMatchDialog";
import { leaveOutcomeFor } from "./exitRules/exitRulesModel";
import { useDraftConduct } from "./exitRules/useDraftConduct";
import { useLeaveGuard } from "./exitRules/useLeaveGuard";
import { t, useTranslation } from "../i18n/i18n";

/**
 * The draft's exit control. The fight hasn't started, so in ranked leaving is always an Abandon (unscored for a
 * calibrating player); lobby and vs-AI drafts have no penalties. The server decides, this only explains it first.
 */
export const PickExitFightControl: React.FC<{ gameId: string }> = ({ gameId }) => {
    useTranslation();
    const { abandonGame } = useAuthContext();
    const navigate = useNavigate();
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    // Loaded with the draft and again when the dialog opens. Fetched only on opening, the dialog's first frame showed
    // the placed-player Abandon and "these rules start soon" until the answer arrived, and a quick confirm acted on it.
    const { casual, vsAi, conduct } = useDraftConduct(gameId, confirmOpen);
    // Closing the tab mid-draft abandons a ranked match too; the browser asks first.
    useLeaveGuard(!casual);

    const close = (): void => {
        if (!busy) {
            setConfirmOpen(false);
            setError("");
        }
    };

    return (
        <>
            {/* The full plate owned the bottom-centre slot the picks themselves want; the same forfeit now
                reads as a window close in the corner — small, unmistakably red, and out of the cards' way. */}
            <Tooltip title={t("Exit fight")} variant="soft" size="sm" placement="left">
                <Button
                    variant="solid"
                    color="danger"
                    aria-label={t("Exit fight")}
                    disabled={busy}
                    onClick={() => setConfirmOpen(true)}
                    sx={pickExitCloseButtonSx}
                >
                    ✕
                </Button>
            </Tooltip>
            <ExitMatchDialog
                open={confirmOpen}
                phase="draft"
                outcome={leaveOutcomeFor(!casual, "draft", false, conduct?.calibrating === true)}
                rules={{
                    ranked: !casual,
                    enforced: conduct?.rules.enforced === true,
                    enforceAtMs: conduct?.rules.enforceAtMs ?? 0,
                }}
                vsAi={vsAi}
                busy={busy}
                error={error}
                onCancel={close}
                onConfirm={async () => {
                    setBusy(true);
                    setError("");
                    try {
                        await abandonGame(gameId);
                        setConfirmOpen(false);
                        navigate("/play");
                    } catch {
                        setError(t("The match could not be left. Please try again."));
                    } finally {
                        setBusy(false);
                    }
                }}
            />
        </>
    );
};

export default PickExitFightControl;
