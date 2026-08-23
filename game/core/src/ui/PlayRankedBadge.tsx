import React from "react";
import { useNavigate } from "react-router";

/**
 * "Play Ranked" link shown in the offline sandbox footer. It lives between the fullscreen and sound
 * controls in the right sidebar, so it follows that panel instead of floating over the battlefield.
 */
export const PlayRankedBadge: React.FC = () => {
    const navigate = useNavigate();
    return (
        <button
            type="button"
            onClick={() => navigate("/play")}
            aria-label="Play ranked (vs AI or vs another player)"
            style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                justifySelf: "center",
                maxWidth: "100%",
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
                whiteSpace: "nowrap",
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
