import Button from "@mui/joy/Button";
import React from "react";
import { useNavigate } from "react-router";

import { hocSidebarImageButtonSx } from "./hocTheme";

/**
 * "Play Ranked" link shown in the offline sandbox footer. It lives between the fullscreen and sound
 * controls in the right sidebar, so it follows that panel instead of floating over the battlefield.
 */
export const PlayRankedBadge: React.FC = () => {
    const navigate = useNavigate();
    return (
        <Button
            variant="plain"
            type="button"
            onClick={() => navigate("/play")}
            aria-label="Play ranked (vs AI or vs another player)"
            sx={{
                ...hocSidebarImageButtonSx("neutral"),
                justifySelf: "center",
                width: "min(100%, 209px)",
                height: "35.2px",
                minHeight: "35.2px",
                px: 1,
                backgroundSize: "100% 100%",
                fontSize: "0.924rem",
                fontWeight: 880,
                whiteSpace: "nowrap",
                cursor: "var(--hoc-cursor-interactive), pointer",
            }}
        >
            Play Ranked
        </Button>
    );
};

export default PlayRankedBadge;
