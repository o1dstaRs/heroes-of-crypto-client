import React from "react";

/**
 * Top-left post-match actions, shown on a FINISHED ranked board (for the participating player, not
 * observers/replay). Two buttons:
 *   - "Play another" — starts another ranked game (a fresh vs-AI match at the same tier, or the
 *     matchmaking/game-type screen for a human match);
 *   - "Home screen" — returns to the game-type selection screen (/play).
 *
 * These persist after the centered results overlay (FightFinishedOverlay) is dismissed, so the player
 * always has one-click access to the two next steps without being stranded on the finished board.
 * Styled to match the fixed-position badges (AiControlBadge / ExitReplayBadge): dark panel, gold
 * border, parchment/gold text. Anchored to the board's left edge via `left` (see aiBadgeLeft).
 */
const GOLD = "#f6d87c";

const FinishedActionButton: React.FC<{
    label: string;
    primary?: boolean;
    disabled?: boolean;
    onClick: () => void;
}> = ({ label, primary, disabled, onClick }) => (
    <button
        type="button"
        onClick={disabled ? undefined : onClick}
        disabled={disabled}
        style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 14px",
            borderRadius: 10,
            background: primary ? `linear-gradient(180deg, #f3d488 0%, ${GOLD} 100%)` : "rgba(7, 9, 13, 0.82)",
            border: `1px solid rgba(246, 216, 124, ${primary ? "0.9" : "0.55"})`,
            color: primary ? "#2d1606" : GOLD,
            fontWeight: 800,
            fontSize: 14,
            letterSpacing: 0.3,
            cursor: disabled ? "not-allowed" : "pointer",
            opacity: disabled ? 0.5 : 1,
            pointerEvents: "auto",
            boxShadow: primary ? `0 0 16px ${GOLD}66` : "0 0 14px rgba(246, 216, 124, 0.2)",
        }}
    >
        {label}
    </button>
);

export const RankedFinishedActions: React.FC<{
    left?: number;
    playAnotherLabel?: string;
    playAnotherBusy?: boolean;
    error?: string;
    onPlayAnother: () => void;
    onHome: () => void;
}> = ({ left = 16, playAnotherLabel = "Play another", playAnotherBusy, error, onPlayAnother, onHome }) => (
    <div
        style={{
            position: "absolute",
            left,
            top: 16,
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            pointerEvents: "none",
        }}
    >
        <div style={{ display: "flex", gap: 8, pointerEvents: "auto" }}>
            <FinishedActionButton
                label={playAnotherBusy ? "Starting…" : playAnotherLabel}
                primary
                disabled={playAnotherBusy}
                onClick={onPlayAnother}
            />
            <FinishedActionButton label="Home screen" onClick={onHome} />
        </div>
        {error && (
            <span
                style={{
                    pointerEvents: "auto",
                    maxWidth: 320,
                    color: "#ff8a8a",
                    fontSize: 12,
                    fontWeight: 600,
                    textShadow: "0 1px 2px rgba(0,0,0,0.8)",
                }}
            >
                {error}
            </span>
        )}
    </div>
);

export default RankedFinishedActions;
