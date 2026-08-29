/*
 * -----------------------------------------------------------------------------
 * This file is part of the game core of the Heroes of Crypto.
 *
 * Heroes of Crypto and Heroes of Crypto AI are registered trademarks.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 * -----------------------------------------------------------------------------
 */

import React, { useCallback, useEffect, useRef, useState } from "react";

import { t, useTranslation } from "../i18n/i18n";
import { refreshPersonalArmyTint } from "../scenes/personalArmyTint";
import {
    ARMY_COLOR_PRESETS,
    TEAM_DEFAULT_ARMY_COLOR_ID,
    readPlayerArmyColorId,
    writePlayerArmyColorId,
} from "../settings/playerArmyColor";

const hex = (color: number): string => `#${color.toString(16).padStart(6, "0")}`;

const PANEL_BACKGROUND = "rgba(7, 9, 13, 0.94)";
const GOLD = "#f6d87c";
const GOLD_EDGE = "rgba(246, 216, 124, 0.55)";

/**
 * The arena settings menu: a gear at the board's top-left corner opening a small panel.
 *
 * Its one setting today is the player's PERSONAL army colour — a local, cosmetic tint for their OWN units'
 * flag and light. It changes nothing about the match: the opponent's army stays in its team colour, the
 * opponent's screen is untouched, and a replay of this fight is still watched green against red. Nothing
 * here reaches the server.
 *
 * Mounted only for a live ranked fight this client is PLAYING (see RankedGameView): an observer and a
 * replay viewer have no "own" army to tint, so they are not offered the choice.
 */
export const ArenaSettingsMenu: React.FC<{ left?: number; top?: number }> = ({ left = 16, top = 16 }) => {
    useTranslation();
    const [open, setOpen] = useState(false);
    const [selected, setSelected] = useState<string>(() => readPlayerArmyColorId());
    const rootRef = useRef<HTMLDivElement | null>(null);

    // Click-away and Escape both close, because the panel floats over a board the player is trying to play
    // on: leaving it open would swallow clicks meant for their own units.
    useEffect(() => {
        if (!open) {
            return undefined;
        }
        const onPointerDown = (event: MouseEvent): void => {
            if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        const onKeyDown = (event: KeyboardEvent): void => {
            if (event.key === "Escape") {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", onPointerDown);
        document.addEventListener("keydown", onKeyDown);

        return () => {
            document.removeEventListener("mousedown", onPointerDown);
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [open]);

    const choose = useCallback((presetId: string) => {
        writePlayerArmyColorId(presetId);
        // The scene re-reads the preference here rather than on a timer; every tinted drawing already
        // redraws when its resolved colour changes, so the board follows on the next frame.
        refreshPersonalArmyTint();
        setSelected(presetId);
    }, []);

    const swatch = (presetId: string, label: string, background: string, borderColor: string): React.ReactElement => {
        const isSelected = selected === presetId;
        return (
            <button
                key={presetId}
                type="button"
                title={label}
                aria-label={label}
                aria-pressed={isSelected}
                onClick={() => choose(presetId)}
                style={{
                    width: 30,
                    height: 30,
                    borderRadius: 7,
                    background,
                    border: isSelected ? `2px solid ${GOLD}` : `1px solid ${borderColor}`,
                    boxShadow: isSelected ? `0 0 10px ${GOLD_EDGE}` : "none",
                    cursor: "pointer",
                    padding: 0,
                }}
            />
        );
    };

    return (
        <div ref={rootRef} style={{ position: "absolute", left, top, zIndex: 7000, pointerEvents: "auto" }}>
            <button
                type="button"
                onClick={() => setOpen((wasOpen) => !wasOpen)}
                aria-label={t("Settings")}
                aria-expanded={open}
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    background: PANEL_BACKGROUND,
                    border: `1px solid ${GOLD_EDGE}`,
                    color: GOLD,
                    fontSize: 17,
                    lineHeight: 1,
                    cursor: "pointer",
                    boxShadow: "0 0 14px rgba(246, 216, 124, 0.25)",
                }}
            >
                ⚙
            </button>
            {open && (
                <div
                    style={{
                        marginTop: 8,
                        width: 232,
                        padding: "12px 14px 14px",
                        borderRadius: 10,
                        background: PANEL_BACKGROUND,
                        border: `1px solid ${GOLD_EDGE}`,
                        boxShadow: "0 0 18px rgba(0, 0, 0, 0.55)",
                        color: GOLD,
                    }}
                >
                    <div style={{ fontWeight: 700, fontSize: 14, letterSpacing: 0.3, marginBottom: 2 }}>
                        {t("Your army colour")}
                    </div>
                    <div style={{ fontSize: 11, lineHeight: 1.4, color: "rgba(246, 216, 124, 0.72)" }}>
                        {t("Only you see this. Replays keep the true team colours.")}
                    </div>
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(5, 30px)",
                            gap: 8,
                            marginTop: 10,
                            justifyContent: "space-between",
                        }}
                    >
                        {ARMY_COLOR_PRESETS.map((preset) =>
                            swatch(preset.id, t(preset.label), hex(preset.color), "rgba(255, 255, 255, 0.25)"),
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={() => choose(TEAM_DEFAULT_ARMY_COLOR_ID)}
                        aria-pressed={selected === TEAM_DEFAULT_ARMY_COLOR_ID}
                        style={{
                            marginTop: 12,
                            width: "100%",
                            padding: "6px 8px",
                            borderRadius: 8,
                            background:
                                selected === TEAM_DEFAULT_ARMY_COLOR_ID ? "rgba(246, 216, 124, 0.16)" : "transparent",
                            border:
                                selected === TEAM_DEFAULT_ARMY_COLOR_ID
                                    ? `2px solid ${GOLD}`
                                    : `1px solid ${GOLD_EDGE}`,
                            color: GOLD,
                            fontWeight: 700,
                            fontSize: 12,
                            cursor: "pointer",
                        }}
                    >
                        {t("Team colours")}
                    </button>
                </div>
            )}
        </div>
    );
};

export default ArenaSettingsMenu;
