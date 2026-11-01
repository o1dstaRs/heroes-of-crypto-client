import React, { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";

import { images } from "../../generated/image_imports";
import { useTranslation } from "../../i18n/i18n";
import { readGameViewport } from "../../viewport/gameViewport";
import {
    DEFAULT_MASTER_VOLUME,
    DEFAULT_EFFECTS_VOLUME,
    getAudioLevels,
    getAudioLevelsServerSnapshot,
    setMasterMuted,
    setMasterVolume,
    setMusicMuted,
    setEffectsMuted,
    setEffectsVolume,
    subscribeAudioLevels,
} from "../../settings/audioLevels";

/** One control for every route; its host can move without changing the saved audio preferences. */
export const AudioControl: React.FC<{ docked: boolean; onSettingsChange: () => void }> = ({
    docked,
    onSettingsChange,
}) => {
    const { t } = useTranslation();
    const { masterVolume, masterMuted, musicMuted, effectsMuted, effectsVolume } = useSyncExternalStore(
        subscribeAudioLevels,
        getAudioLevels,
        getAudioLevelsServerSnapshot,
    );
    const [expanded, setExpanded] = useState(false);
    const touch = readGameViewport().touch;
    const rootRef = useRef<HTMLDivElement>(null);
    const collapseTimer = useRef<number | null>(null);
    const popupId = useId();

    const cancelCollapse = useCallback(() => {
        if (collapseTimer.current !== null) {
            window.clearTimeout(collapseTimer.current);
            collapseTimer.current = null;
        }
    }, []);

    const show = useCallback(() => {
        cancelCollapse();
        setExpanded(true);
    }, [cancelCollapse]);

    const scheduleCollapse = useCallback(() => {
        cancelCollapse();
        collapseTimer.current = window.setTimeout(() => {
            setExpanded(false);
            collapseTimer.current = null;
        }, 260);
    }, [cancelCollapse]);

    useEffect(() => cancelCollapse, [cancelCollapse]);
    useEffect(() => {
        if (!touch || !expanded) return;
        const dismiss = (event: PointerEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) setExpanded(false);
        };
        document.addEventListener("pointerdown", dismiss, true);
        return () => document.removeEventListener("pointerdown", dismiss, true);
    }, [touch, expanded]);

    const silent = masterMuted || masterVolume === 0;
    const toggleMute = () => {
        const nextMuted = !silent;
        setMasterMuted(nextMuted);
        if (!nextMuted && masterVolume === 0) setMasterVolume(DEFAULT_MASTER_VOLUME);
        onSettingsChange();
    };
    const changeVolume = (next: number) => {
        setMasterVolume(next);
        if (next > 0) setMasterMuted(false);
        onSettingsChange();
    };
    return (
        <div
            ref={rootRef}
            className="hoc-audio-control"
            data-touch-audio={touch || undefined}
            onMouseEnter={() => {
                if (!touch) show();
            }}
            onMouseLeave={() => {
                if (!touch) scheduleCollapse();
            }}
            onFocus={() => {
                if (!touch) show();
            }}
            onBlur={(event) => {
                if (!touch && !event.currentTarget.contains(event.relatedTarget)) scheduleCollapse();
            }}
            onKeyDown={(event) => {
                if (event.key === "Escape" && expanded) {
                    event.stopPropagation();
                    cancelCollapse();
                    setExpanded(false);
                }
            }}
            style={{
                ...(docked
                    ? { position: "relative", flex: "0 0 32px" }
                    : { position: "fixed", right: "1rem", bottom: "1rem", zIndex: 60 }),
                width: 32,
                height: 32,
                color: "#dcb158",
            }}
        >
            <button
                type="button"
                aria-pressed={touch ? undefined : silent}
                aria-label={t(touch ? "Sound settings" : silent ? "Unmute sound" : "Mute sound")}
                aria-expanded={expanded}
                aria-controls={popupId}
                onClick={() => {
                    if (touch) {
                        cancelCollapse();
                        setExpanded((value) => !value);
                        onSettingsChange();
                    } else toggleMute();
                }}
                style={{
                    display: "grid",
                    placeItems: "center",
                    width: 32,
                    height: 32,
                    padding: 0,
                    borderRadius: 0,
                    border: "none",
                    backgroundColor: "transparent",
                    backgroundImage: `url(${silent ? images.ui_control_music_muted_forged_bronze_v1 : images.ui_control_music_on_forged_bronze_v1})`,
                    backgroundPosition: "center",
                    backgroundRepeat: "no-repeat",
                    backgroundSize: "contain",
                    color: "inherit",
                    cursor: "pointer",
                }}
            />
            <div
                id={popupId}
                className="hoc-audio-popup"
                aria-hidden={!expanded}
                style={{
                    position: "absolute",
                    right: -4,
                    bottom: "100%",
                    minWidth: 106,
                    padding: "10px 8px",
                    boxSizing: "border-box",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 8,
                    background: "linear-gradient(180deg, #2d1b0d, #160d06)",
                    border: "1px solid #8c602d",
                    borderRadius: 6,
                    boxShadow: "0 4px 14px rgba(0,0,0,0.7)",
                    opacity: expanded ? 1 : 0,
                    pointerEvents: expanded ? "auto" : "none",
                    transition: "opacity 140ms ease",
                }}
            >
                <span className="hoc-audio-heading" style={{ fontSize: 12, color: "#efe4cc" }}>
                    {t("Sound")} · {Math.round(masterVolume * 100)}%
                </span>
                {touch ? (
                    <div
                        className="hoc-touch-volume-row"
                        style={{ "--hoc-touch-volume": `${Math.round(masterVolume * 100)}%` } as React.CSSProperties}
                    >
                        <button
                            type="button"
                            aria-label={t("Decrease sound volume")}
                            onClick={() => changeVolume(Math.max(0, masterVolume - 0.1))}
                            tabIndex={expanded ? 0 : -1}
                        >
                            −
                        </button>
                        <input
                            type="range"
                            min={0}
                            max={100}
                            step={1}
                            value={Math.round(masterVolume * 100)}
                            aria-label={t("Sound volume")}
                            tabIndex={expanded ? 0 : -1}
                            onChange={(event) => changeVolume(Number(event.target.value) / 100)}
                        />
                        <button
                            type="button"
                            aria-label={t("Increase sound volume")}
                            onClick={() => changeVolume(Math.min(1, masterVolume + 0.1))}
                            tabIndex={expanded ? 0 : -1}
                        >
                            +
                        </button>
                    </div>
                ) : (
                    <div
                        className="hoc-volume-slider-shell"
                        style={
                            { "--hoc-volume-level": `${Math.round(4 + masterVolume * 78)}px` } as React.CSSProperties
                        }
                    >
                        <input
                            type="range"
                            className="hoc-volume-slider"
                            min={0}
                            max={100}
                            step={1}
                            value={Math.round(masterVolume * 100)}
                            aria-label={t("Sound volume")}
                            aria-orientation="vertical"
                            tabIndex={expanded ? 0 : -1}
                            onChange={(event) => {
                                changeVolume(Number(event.target.value) / 100);
                            }}
                        />
                    </div>
                )}
                {touch && (
                    <button
                        type="button"
                        aria-pressed={silent}
                        aria-label={t(silent ? "Unmute sound" : "Mute sound")}
                        onClick={toggleMute}
                        tabIndex={expanded ? 0 : -1}
                    >
                        {t(silent ? "Unmute sound" : "Mute sound")}
                    </button>
                )}
                {touch && (
                    <label className="hoc-touch-effects-toggle">
                        <input
                            type="checkbox"
                            checked={!effectsMuted && effectsVolume > 0}
                            tabIndex={expanded ? 0 : -1}
                            onChange={(event) => {
                                setEffectsMuted(!event.target.checked);
                                if (event.target.checked && effectsVolume === 0)
                                    setEffectsVolume(DEFAULT_EFFECTS_VOLUME);
                                onSettingsChange();
                            }}
                        />
                        {t("Sound effects")}
                    </label>
                )}
                <label
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        fontSize: 13,
                        color: "#efe4cc",
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                    }}
                >
                    <input
                        type="checkbox"
                        checked={!musicMuted}
                        tabIndex={expanded ? 0 : -1}
                        onChange={(event) => {
                            setMusicMuted(!event.target.checked);
                            onSettingsChange();
                        }}
                        style={{ width: 14, height: 14, margin: 0, accentColor: "#dcb158", colorScheme: "dark" }}
                    />
                    {t("Music")}
                </label>
            </div>
        </div>
    );
};
