import React, { useEffect, useState } from "react";

import { meteorIconDataUrl } from "./meteorIcon";
import { nextLapHazard } from "./nextLapHazard";
import { usePixiManager } from "../pixi/PixiGameManager";
import type { IVisibleState } from "../scenes/VisibleState";
import { t, useTranslation } from "../i18n/i18n";

/**
 * Bottom-centre warning for what lands when this lap ends — the map closing in, or an armageddon wave.
 * Both were previously announced only by a small icon in the timer area that had to be HOVERED to read,
 * so a player who didn't know the mechanic got no warning at all. This states it in words, in the one
 * place the eye already goes between turns, and disappears on laps where nothing is coming.
 *
 * Bottom-CENTRE deliberately: the bottom-left corner is taken by the AI / replay / ranked badges.
 */
export const NextLapHazardBadge: React.FC = () => {
    useTranslation();
    // Self-subscribing (same idiom as MessageBox) so each host mounts it with no props to thread.
    const manager = usePixiManager();
    const [visibleState, setVisibleState] = useState<IVisibleState>({} as IVisibleState);
    useEffect(() => {
        const connection = manager.onVisibleStateUpdated.connect(setVisibleState);
        return () => {
            connection.disconnect();
        };
    }, [manager]);

    const hazard = nextLapHazard(visibleState);
    if (!hazard) {
        return null;
    }

    const isArmageddon = hazard.kind === "armageddon";
    const accent = isArmageddon ? "#ff9a6c" : "#8fd3ff";
    const glow = isArmageddon ? "rgba(255, 154, 108, 0.45)" : "rgba(143, 211, 255, 0.4)";

    return (
        <div
            title={t(hazard.detail)}
            style={{
                position: "absolute",
                left: "50%",
                transform: "translateX(-50%)",
                bottom: 16,
                zIndex: 7000,
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 14px",
                borderRadius: 10,
                background: "rgba(7, 9, 13, 0.82)",
                border: `1px solid ${accent}8c`,
                color: accent,
                fontWeight: 700,
                fontSize: 14,
                letterSpacing: 0.3,
                whiteSpace: "nowrap",
                pointerEvents: "none",
                boxShadow: `0 0 14px ${glow}`,
                animation: "hocHazardPulse 1.6s ease-in-out infinite",
            }}
        >
            <style>
                {`@keyframes hocHazardPulse {
                    0%, 100% { opacity: 0.72; }
                    50% { opacity: 1; }
                }`}
            </style>
            {isArmageddon ? (
                <img src={meteorIconDataUrl} alt="" style={{ width: 18, height: 18 }} />
            ) : (
                // Four arrows pressing inward — the board closing on itself.
                <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                        d="M3 3l5 5M8 3H3v5M21 3l-5 5M16 3h5v5M3 21l5-5M8 21H3v-5M21 21l-5-5M16 21h5v-5"
                        fill="none"
                        stroke={accent}
                        strokeWidth="2"
                        strokeLinecap="round"
                    />
                </svg>
            )}
            {t(hazard.label)}
        </div>
    );
};
