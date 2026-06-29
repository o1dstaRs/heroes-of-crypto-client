import React from "react";

/**
 * Bottom-left "AI Toggle On" badge with a soft pulse, shown while the AI is playing this player's
 * turns. In ranked this is driven by the server's per-player aiControlled flag (turned on after two
 * consecutive missed turns); in the sandbox it mirrors the local AI toggle. It clears when the player
 * takes control again (a real action in ranked / toggling the AI button off in the sandbox).
 */
export const AiControlBadge: React.FC = () => (
    <div
        style={{
            position: "absolute",
            left: 16,
            bottom: 16,
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
            pointerEvents: "none",
            boxShadow: "0 0 14px rgba(246, 216, 124, 0.25)",
            animation: "hocAiBadgePulse 1.4s ease-in-out infinite",
        }}
    >
        <style>
            {`@keyframes hocAiBadgePulse {
                0%, 100% { opacity: 0.62; box-shadow: 0 0 8px rgba(246,216,124,0.18); }
                50% { opacity: 1; box-shadow: 0 0 18px rgba(246,216,124,0.45); }
            }
            @keyframes hocAiBadgeDot {
                0%, 100% { transform: scale(0.85); opacity: 0.7; }
                50% { transform: scale(1.25); opacity: 1; }
            }`}
        </style>
        <span
            style={{
                width: 9,
                height: 9,
                borderRadius: "50%",
                background: "#f6d87c",
                animation: "hocAiBadgeDot 1.4s ease-in-out infinite",
            }}
        />
        AI Toggle On
    </div>
);
