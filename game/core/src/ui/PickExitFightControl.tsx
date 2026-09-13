import Button from "@mui/joy/Button";
import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";

import { useAuthContext } from "./auth/context/auth_context";
import { exitFightButtonSx } from "./exitFightButtonSx";
import { ExitMatchDialog } from "./exitRules/ExitMatchDialog";
import { leaveOutcomeFor } from "./exitRules/exitRulesModel";
import { useLeaveGuard } from "./exitRules/useLeaveGuard";
import { useFullscreenActive } from "./useFullscreenActive";
import { fetchRankedConduct, type RankedConduct } from "../api/ranked_conduct_client";
import { t, useTranslation } from "../i18n/i18n";
import { isMarkedVsAiGame } from "../utils/aiOpponent";

/**
 * The draft's exit control. The fight hasn't started, so in ranked leaving is always an Abandon (unscored for a
 * calibrating player); lobby and vs-AI drafts have no penalties. The server decides, this only explains it first.
 */
export const PickExitFightControl: React.FC<{ gameId: string }> = ({ gameId }) => {
    useTranslation();
    const { abandonGame } = useAuthContext();
    const isFullscreen = useFullscreenActive();
    const navigate = useNavigate();
    const location = useLocation();
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [conduct, setConduct] = useState<RankedConduct | undefined>();
    const vsAi = isMarkedVsAiGame(gameId);
    const casual = vsAi || (location.state as { from?: string } | null)?.from === "lobby";
    // Closing the tab mid-draft abandons a ranked match too; the browser asks first.
    useLeaveGuard(!casual);

    useEffect(() => {
        if (!confirmOpen || casual) {
            return undefined;
        }
        let cancelled = false;
        void fetchRankedConduct()
            .then((next) => {
                if (!cancelled) {
                    setConduct(next);
                }
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [casual, confirmOpen]);

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
                {t("EXIT FIGHT")}
            </Button>
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
