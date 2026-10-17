import Modal from "@mui/joy/Modal";
import ModalDialog from "@mui/joy/ModalDialog";
import Stack from "@mui/joy/Stack";
import Typography from "@mui/joy/Typography";
import { useDraftConduct } from "./exitRules/useDraftConduct";
import { useLeaveGuard } from "./exitRules/useLeaveGuard";
import { useTranslation } from "../i18n/i18n";
import Button from "@mui/joy/Button";
import React, { useState } from "react";
import { useNavigate } from "react-router";

import { GameCornerExitButton } from "./GameCornerExit";
import { hocColors, hocPanelSx, hocSoftButtonSx } from "./hocTheme";
import { useAuthContext } from "./auth/context/auth_context";

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
    const { casual } = useDraftConduct(gameId, confirmOpen);
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
            <GameCornerExitButton disabled={busy} onClick={() => setConfirmOpen(true)} />
            <Modal open={confirmOpen} onClose={close}>
                <ModalDialog sx={hocPanelSx}>
                    <Typography level="h4" sx={{ color: hocColors.parchment }}>
                        Exit the fight?
                    </Typography>
                    <Stack spacing={2} sx={{ mt: 1, minWidth: 300, maxWidth: 360 }}>
                        <Typography level="body-sm" textColor={hocColors.mutedStrong}>
                            Leaving during picks forfeits the match and counts as a loss. This cannot be undone.
                        </Typography>
                        {error && (
                            <Typography level="body-sm" color="danger">
                                {error}
                            </Typography>
                        )}
                        <Stack direction="row" spacing={1} justifyContent="flex-end">
                            <Button variant="plain" disabled={busy} onClick={close} sx={hocSoftButtonSx}>
                                Cancel
                            </Button>
                            <Button
                                variant="solid"
                                color="danger"
                                loading={busy}
                                onClick={async () => {
                                    setBusy(true);
                                    setError("");
                                    try {
                                        await abandonGame(gameId);
                                        setConfirmOpen(false);
                                        navigate("/play");
                                    } catch {
                                        setError("The fight could not be forfeited. Please try again.");
                                    } finally {
                                        setBusy(false);
                                    }
                                }}
                            >
                                Forfeit
                            </Button>
                        </Stack>
                    </Stack>
                </ModalDialog>
            </Modal>
        </>
    );
};

export default PickExitFightControl;
