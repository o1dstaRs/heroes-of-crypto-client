import React from "react";
import { useNavigate } from "react-router";

/**
 * Top-left "Play Ranked" link shown on the offline sandbox root ("/"). Ranked (vs-AI / vs-human) was
 * previously only reachable by typing /play directly — this is the one persistent nav affordance back
 * to it from the sandbox. Styled to match the other fixed-position badges (AiControlBadge /
 * ExitReplayBadge): dark dungeon panel, gold border, parchment text. Anchored at the board's left edge
 * (same `left` computation those bottom badges use) so it clears the LeftSideBar instead of floating
 * over it.
 */
export const PlayRankedBadge: React.FC<{ left?: number }> = ({ left = 16 }) => {
    const navigate = useNavigate();
    return (
        <button
            type="button"
            onClick={() => navigate("/play")}
            aria-label="Play ranked (vs AI or vs another player)"
            style={{
                position: "absolute",
                top: 16,
                left,
                zIndex: 7000,
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 14px",
                borderRadius: 10,
                background: "rgba(7, 9, 13, 0.82)",
                border: "1px solid rgba(246, 216, 124, 0.55)",
                color: "#f6d87c",
                fontWeight: 700,
                fontSize: 14,
                letterSpacing: 0.3,
                cursor: "pointer",
                pointerEvents: "auto",
                boxShadow: "0 0 14px rgba(246, 216, 124, 0.25)",
                transition: "box-shadow 0.2s ease, opacity 0.2s ease",
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = "0 0 20px rgba(246, 216, 124, 0.5)";
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = "0 0 14px rgba(246, 216, 124, 0.25)";
            }}
        >
            Play Ranked
        </button>
    );
};

export default PlayRankedBadge;
