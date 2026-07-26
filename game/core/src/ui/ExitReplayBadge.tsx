import React from "react";

/**
 * Bottom-left "Exit Replay" button, shown (with a soft pulse) only while a fight replay is playing back.
 * Clicking it leaves the replay: back to the account/game-selection screen in ranked, or the regular
 * sandbox screen in sandbox — the concrete destination is supplied by the caller via `onExit`.
 *
 * Positioned at the same bottom-left spot as the AI-toggle badge; the two never show at once (the AI is
 * not driving turns during a replay). Unlike that badge this one is interactive (pointerEvents: auto).
 */
export const ExitReplayBadge: React.FC<{ left?: number; onExit: () => void }> = ({ left = 16, onExit }) => (
    <button
        type="button"
        onClick={onExit}
        aria-label="Exit replay"
        style={{
            position: "absolute",
            left,
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
            cursor: "pointer",
            pointerEvents: "auto",
            boxShadow: "0 0 14px rgba(246, 216, 124, 0.25)",
            animation: "hocExitReplayPulse 1.4s ease-in-out infinite",
        }}
    >
        <style>
            {`@keyframes hocExitReplayPulse {
                0%, 100% { opacity: 0.68; box-shadow: 0 0 8px rgba(246,216,124,0.18); }
                50% { opacity: 1; box-shadow: 0 0 18px rgba(246,216,124,0.45); }
            }
            @keyframes hocExitReplayDot {
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
                animation: "hocExitReplayDot 1.4s ease-in-out infinite",
            }}
        />
        Exit Replay
    </button>
);

export default ExitReplayBadge;
