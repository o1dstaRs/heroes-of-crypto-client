import { Snackbar } from "@mui/joy";
import WarningRoundedIcon from "@mui/icons-material/WarningRounded";
import React, { useEffect, useRef, useState } from "react";

import { t, tf, useTranslation } from "../../i18n/i18n";
import { usePickBanEvents } from "../context/PickBanContext";
import { useDraftConduct } from "../exitRules/useDraftConduct";

// Tight pick-phase windows (~15-30s) auto-pick on a player's behalf when the clock runs out (see
// pick_phase_daemon's timeout decider). That used to land completely silently — the draft summary
// would just update with a choice the player never made. The server flags the ONE SSE frame that
// carries the timeout fill (see PickBanContext.autoPickedSignal), and this toast surfaces it.
const AUTO_HIDE_MS = 5000;

const AutoPickToast: React.FC<{ gameId: string }> = ({ gameId }) => {
    useTranslation();
    const { autoPickedSignal } = usePickBanEvents();
    // Exit rules: once they're enforced, a ranked draft ends as the player's abandon after a set number of auto-picks.
    // The rules page says so; this is the moment it matters, so the toast says it too. Refreshed on every auto-pick.
    const { casual, conduct } = useDraftConduct(gameId, autoPickedSignal);
    const abandonLimit = !casual && conduct?.rules.enforced ? conduct.rules.draftAutoPicks : 0;
    const [open, setOpen] = useState(false);
    // Skip the toast on first mount (signal starts at 0, and a provider re-render shouldn't fire one)
    // — only genuine increments (a fresh `ap: true` frame) should pop it.
    const seenSignal = useRef(autoPickedSignal);

    useEffect(() => {
        if (autoPickedSignal !== seenSignal.current) {
            seenSignal.current = autoPickedSignal;
            setOpen(true);
        }
    }, [autoPickedSignal]);

    return (
        <Snackbar
            open={open}
            autoHideDuration={AUTO_HIDE_MS}
            onClose={(_event, reason) => {
                if (reason !== "clickaway") {
                    setOpen(false);
                }
            }}
            anchorOrigin={{ vertical: "top", horizontal: "center" }}
            variant="soft"
            color="warning"
            startDecorator={<WarningRoundedIcon />}
            sx={{ zIndex: 2000, mt: 2 }}
        >
            {t("Time ran out — we auto-picked for you.")}
            {abandonLimit > 0
                ? ` ${tf("{count} auto-picks in one ranked draft end the match as your abandon.", { count: abandonLimit })}`
                : ""}
        </Snackbar>
    );
};

export default AutoPickToast;
