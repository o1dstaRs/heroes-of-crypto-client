import { Snackbar } from "@mui/joy";
import WarningRoundedIcon from "@mui/icons-material/WarningRounded";
import React, { useEffect, useRef, useState } from "react";

import { usePickBanEvents } from "../context/PickBanContext";

// Tight pick-phase windows (~15-30s) auto-pick on a player's behalf when the clock runs out (see
// pick_phase_daemon's timeout decider). That used to land completely silently — the draft summary
// would just update with a choice the player never made. The server flags the ONE SSE frame that
// carries the timeout fill (see PickBanContext.autoPickedSignal), and this toast surfaces it.
const AUTO_HIDE_MS = 5000;

const AutoPickToast: React.FC = () => {
    const { autoPickedSignal } = usePickBanEvents();
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
            Time ran out — we auto-picked for you.
        </Snackbar>
    );
};

export default AutoPickToast;
