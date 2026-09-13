import React, { useEffect, useRef, useState } from "react";

import { t } from "../i18n/i18n";
import { battleSidebarWidth } from "../pixi/boardFit";

/**
 * Left position (px) for the AI badge so it sits at the bottom-left of the FIGHT board, not over the
 * left sidebar. Its left edge is the shared, reduced sidebar width; a small inset is added.
 */
export const aiBadgeLeft = (windowSize: { width: number; height: number }): number => {
    return battleSidebarWidth(windowSize.width, windowSize.height) + 16;
};

const BACK_IN_CONTROL_MS = 5_000;

/**
 * Bottom-left badge shown while the AI is playing this player's turns. The default label is the sandbox's
 * "AI Toggle On"; ranked seats use SeatAiControlNotice, which explains a server takeover instead. The "back"
 * tone is a still, green confirmation that the player has control again.
 */
export const AiControlBadge: React.FC<{ left?: number; label?: string; hint?: string; tone?: "ai" | "back" }> = ({
    left = 16,
    label = "AI Toggle On",
    hint,
    tone = "ai",
}) => {
    const rgb = tone === "back" ? "70, 209, 96" : "246, 216, 124";
    const pulsing = tone === "ai";
    return (
        <div
            className={pulsing ? "hoc-ai-badge" : undefined}
            style={{
                position: "absolute",
                left,
                bottom: 16,
                zIndex: 7000,
                display: "flex",
                alignItems: hint ? "flex-start" : "center",
                gap: 8,
                maxWidth: 440,
                padding: "8px 14px",
                borderRadius: 10,
                background: "rgba(7, 9, 13, 0.82)",
                border: `1px solid rgba(${rgb}, 0.55)`,
                color: `rgb(${rgb})`,
                fontWeight: 700,
                fontSize: 14,
                letterSpacing: 0.3,
                pointerEvents: "none",
                boxShadow: `0 0 14px rgba(${rgb}, 0.25)`,
                animation: pulsing ? "hocAiBadgePulse 1.4s ease-in-out infinite" : undefined,
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
                }
                @media (prefers-reduced-motion: reduce) {
                    .hoc-ai-badge, .hoc-ai-badge-dot { animation: none !important; }
                }`}
            </style>
            <span
                className={pulsing ? "hoc-ai-badge-dot" : undefined}
                style={{
                    flex: "none",
                    width: 9,
                    height: 9,
                    marginTop: hint ? 5 : 0,
                    borderRadius: "50%",
                    background: `rgb(${rgb})`,
                    animation: pulsing ? "hocAiBadgeDot 1.4s ease-in-out infinite" : undefined,
                }}
            />
            <span style={{ display: "grid", gap: 2 }}>
                <span>{label}</span>
                {hint && (
                    <span style={{ fontWeight: 500, fontSize: 12.5, letterSpacing: 0.2, opacity: 0.85 }}>{hint}</span>
                )}
            </span>
        </div>
    );
};

/**
 * The local player's own AI badge. A server takeover (the seat's aiControlled flag, set after a disconnect or
 * missed turns) says what happened and how to end it, so a player coming back is never left guessing why
 * their units moved on their own. When it ends, a short "back in control" confirms it. Otherwise the co-op
 * sandbox's manual toggle shows the plain "AI Toggle On".
 */
export const SeatAiControlNotice: React.FC<{ aiControlled: boolean; toggleOn: boolean; left?: number }> = ({
    aiControlled,
    toggleOn,
    left,
}) => {
    const wasAiControlledRef = useRef(aiControlled);
    const [backInControl, setBackInControl] = useState(false);

    useEffect(() => {
        const wasAiControlled = wasAiControlledRef.current;
        wasAiControlledRef.current = aiControlled;
        if (aiControlled) {
            setBackInControl(false);
            return undefined;
        }
        if (!wasAiControlled) {
            return undefined;
        }
        setBackInControl(true);
        const timer = window.setTimeout(() => setBackInControl(false), BACK_IN_CONTROL_MS);
        return () => window.clearTimeout(timer);
    }, [aiControlled]);

    if (aiControlled) {
        return (
            <AiControlBadge
                left={left}
                label={t("You were away — the AI is playing your turns")}
                hint={t("Make your next move to take back control")}
            />
        );
    }
    if (backInControl) {
        return <AiControlBadge left={left} tone="back" label={t("You're back in control")} />;
    }
    if (toggleOn) {
        return <AiControlBadge left={left} />;
    }
    return null;
};
