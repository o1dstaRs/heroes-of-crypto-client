import Button from "@mui/joy/Button";
import Modal from "@mui/joy/Modal";
import ModalDialog from "@mui/joy/ModalDialog";
import Stack from "@mui/joy/Stack";
import Typography from "@mui/joy/Typography";
import React, { useState } from "react";
import { useNavigate } from "react-router";

import { exitFightButtonSx } from "./exitFightButtonSx";
import { hocColors, hocPanelSx, hocSoftButtonSx } from "./hocTheme";
import { useAuthContext } from "./auth/context/auth_context";
import { useFullscreenActive } from "./useFullscreenActive";

/** The pick-phase counterpart to combat's forfeit control. */
export const PickExitFightControl: React.FC<{ gameId: string }> = ({ gameId }) => {
    const { abandonGame } = useAuthContext();
    const isFullscreen = useFullscreenActive();
    const navigate = useNavigate();
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const close = (): void => {
        if (!busy) {
            setConfirmOpen(false);
            setError("");
        }
    };

    return (
        <>
            <Button
                variant="soft"
                color="danger"
                disabled={busy}
                onClick={() => setConfirmOpen(true)}
                sx={exitFightButtonSx(isFullscreen)}
            >
                EXIT FIGHT
            </Button>
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
