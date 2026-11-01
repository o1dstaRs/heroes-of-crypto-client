import Button from "@mui/joy/Button";
import React from "react";
import { useNavigate } from "react-router";

import { FULLSCREEN_PRESENTATION_ATTRIBUTE } from "./fullscreen";
import { GAME_SYSTEM_CONTROLS_CENTER_HEIGHT_PX } from "./GameSystemControls";
import { hocSidebarImageButtonSx } from "./hocTheme";

/**
 * The lettering is sized against the PLATE, not the viewport: the footer slot is a size container, so a
 * sidebar too narrow for the plate's authored 209px shrinks the label with it instead of letting the
 * text run off both ends of its own background. Each pair below is the same size written twice — as a
 * cap in rem, and as the share of a full 209px plate that produces it.
 *
 * Fullscreen carries the label 69% larger (two owner passes of +30%). At the full plate that is ~173px
 * of lettering inside 193px of plate, so it still clears the frame on both sides.
 */
const PLATE_LABEL_FONT_SIZE = "clamp(0.6rem, 7.08cqw, 0.924rem)";
const PLATE_LABEL_FONT_SIZE_FULLSCREEN = "clamp(0.6rem, 11.97cqw, 1.5616rem)";

/**
 * "Play Ranked" link shown in the offline sandbox's right sidebar footer, so it follows that panel
 * instead of floating over the battlefield.
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
                // The plate shares the footer line with the corner controls and takes the space left of
                // them, up to its authored 209px. `min(100%, …)` is what keeps it from ever crossing the
                // sidebar's left edge.
                width: "min(100%, 209px)",
                flex: "0 1 auto",
                height: `${GAME_SYSTEM_CONTROLS_CENTER_HEIGHT_PX}px`,
                minHeight: `${GAME_SYSTEM_CONTROLS_CENTER_HEIGHT_PX}px`,
                px: 1,
                backgroundSize: "100% 100%",
                fontSize: PLATE_LABEL_FONT_SIZE,
                // The CSS fullscreen pseudo-class is the source of truth, with the attribute covering
                // browsers that enter fullscreen without firing the event React listens to — the same
                // trio the exit-fight plate uses.
                [`html[${FULLSCREEN_PRESENTATION_ATTRIBUTE}="true"] &`]: {
                    fontSize: PLATE_LABEL_FONT_SIZE_FULLSCREEN,
                },
                "html:fullscreen &": { fontSize: PLATE_LABEL_FONT_SIZE_FULLSCREEN },
                "html:-webkit-full-screen &": { fontSize: PLATE_LABEL_FONT_SIZE_FULLSCREEN },
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
