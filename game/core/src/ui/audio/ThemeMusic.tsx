import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router";

import { images as rawImages } from "../../generated/image_imports";
import {
    DEFAULT_MUSIC_VOLUME,
    getAudioLevels,
    getAudioLevelsServerSnapshot,
    setMusicMuted,
    setMusicVolume,
    subscribeAudioLevels,
} from "../../settings/audioLevels";
import { isPrefightMusicActive, subscribePrefightMusic } from "./prefightMusic";
import { createThemeMusicPlayer, type ThemeMusicPlayer } from "./themeMusicPlayer";
import { getVolumeSlot, getVolumeSlotServerSnapshot, subscribeVolumeSlot } from "./volumeSlot";

const images = rawImages as Record<string, string>;
const musicMutedControlImage = images.ui_control_music_muted_forged_bronze_v1;
const musicOnControlImage = images.ui_control_music_on_forged_bronze_v1;

/**
 * The menu theme ("The Last Stand") and the volume control that governs it.
 *
 * Mounted ONCE, above the router, rather than inside each screen: a single long-lived <audio> element means
 * walking from matchmaking to the lobby list and on to the portal does not restart the track, which is
 * exactly what re-mounting per route would do.
 *
 * Which screens sing is decided here (see SINGING_ROUTES) — the fight itself is deliberately silent, and so
 * is the offline sandbox at "/".
 *
 * The site (heroesofcrypto.io) plays the same track on mode select and profile through its own copy of this,
 * site/src/components/ThemeMusic.astro. It is a DIFFERENT ORIGIN and cannot see this localStorage, so the
 * redirect pages under /play hand the setting over in the query string; the keys and the parameter names
 * used by settings/audioLevels have to match on both sides.
 *
 * The LEVEL itself is not owned here — it lives in settings/audioLevels alongside the separate one for
 * sound effects, so this medallion and the Audio section of the player settings move the same value.
 */
const FADE_MS = 900;

/**
 * The menu playlist, in order. Tracks run one after another and wrap back to the first, so the music never
 * stops while a player sits in the menus — a single looping track gets old fast at the matchmaking screen,
 * where the wait can be minutes.
 *
 * Each entry ships as Opus/WebM and MP3; the browser picks. Adding a track is a matter of dropping both
 * encodes into public/audio and appending here (and to the site's copy, which keeps its own list).
 */
const PLAYLIST = [
    { webm: "/audio/the_last_stand.webm", mp3: "/audio/the_last_stand.mp3" },
    { webm: "/audio/the_stone_lullaby.webm", mp3: "/audio/the_stone_lullaby.mp3" },
] as const;

/**
 * The pre-fight track. It replaces the menu playlist from the moment a ranked match is found until the fight
 * starts — match check, picks, augments, placement — then hands back to silence when the first turn begins.
 * A single track rather than a list: that stretch is a few minutes at most and wants one continuous mood.
 */
const PREFIGHT_TRACK = { webm: "/audio/iron_and_silk.webm", mp3: "/audio/iron_and_silk.mp3" } as const;

/** Route prefixes that carry the theme. Everything else — the fight, the sandbox — stays quiet.
 *
 * Note this governs what PLAYS, not where the speaker is offered: the control sits in the bottom-right
 * corner on every screen, the silent ones included. It is a setting, not a now-playing indicator — muting
 * or setting the level mid-fight is exactly when a player reaches for it, and the choice is stored, so it
 * is already in force by the time the music comes back. */
const SINGING_ROUTES = ["/play", "/lobbies", "/lobby/", "/portal"] as const;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const shouldSing = (pathname: string): boolean =>
    SINGING_ROUTES.some((route) => pathname === route || pathname.startsWith(route));

export const ThemeMusic: React.FC = () => {
    const { pathname } = useLocation();
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const webmSourceRef = useRef<HTMLSourceElement | null>(null);
    const mp3SourceRef = useRef<HTMLSourceElement | null>(null);
    const playerRef = useRef<ThemeMusicPlayer | null>(null);
    const fadeRef = useRef<number | null>(null);
    const effectiveVolumeRef = useRef(0);
    // Whether the last pass was on a singing screen: it separates "arrived somewhere with music" (fade it
    // in) from "the player moved a slider" (follow the handle).
    const wasSingingRef = useRef(false);
    const [volumeExpanded, setVolumeExpanded] = useState(false);
    // Shared with the Audio section of the player settings: whichever one the player reaches for, both
    // show the same level and the track follows it live.
    const { musicVolume: volume, musicMuted: muted } = useSyncExternalStore(
        subscribeAudioLevels,
        getAudioLevels,
        getAudioLevelsServerSnapshot,
    );
    const [prefight, setPrefight] = useState(false);
    const [needsUnlock, setNeedsUnlock] = useState(true);
    const volumeCollapseTimerRef = useRef<number | null>(null);
    // Rendered into the sidebar's footer when there is one, beside the fullscreen toggle; otherwise it
    // floats in the bottom-right corner as before.
    const dockSlot = useSyncExternalStore(subscribeVolumeSlot, getVolumeSlot, getVolumeSlotServerSnapshot);

    const cancelVolumeCollapse = useCallback(() => {
        if (volumeCollapseTimerRef.current !== null) {
            window.clearTimeout(volumeCollapseTimerRef.current);
            volumeCollapseTimerRef.current = null;
        }
    }, []);

    const showVolumeControl = useCallback(() => {
        cancelVolumeCollapse();
        setVolumeExpanded(true);
    }, [cancelVolumeCollapse]);

    const scheduleVolumeCollapse = useCallback(() => {
        cancelVolumeCollapse();
        volumeCollapseTimerRef.current = window.setTimeout(() => {
            setVolumeExpanded(false);
            volumeCollapseTimerRef.current = null;
        }, 260);
    }, [cancelVolumeCollapse]);

    useEffect(() => cancelVolumeCollapse, [cancelVolumeCollapse]);

    useEffect(() => subscribePrefightMusic(setPrefight), []);

    // The pre-fight stretch sings wherever it happens — it lives under /game, which is otherwise silent.
    const singing = prefight || shouldSing(pathname);
    const effectiveVolume = muted ? 0 : volume;
    effectiveVolumeRef.current = effectiveVolume;

    const getTargetVolume = useCallback(
        () => (shouldSing(window.location.pathname) || isPrefightMusicActive() ? effectiveVolumeRef.current : 0),
        [],
    );

    const stopFade = useCallback(() => {
        if (fadeRef.current !== null) {
            cancelAnimationFrame(fadeRef.current);
            fadeRef.current = null;
        }
    }, []);

    // Fade rather than snap: the theme arriving at full volume the instant someone clicks is startling, and
    // that first click is usually aimed at something else entirely.
    const fadeTo = useCallback(
        (target: number) => {
            const audio = audioRef.current;
            if (!audio) {
                return;
            }
            stopFade();
            const clampedTarget = clamp01(target);
            if (audio.paused && clampedTarget === 0) {
                audio.volume = 0;
                return;
            }
            const from = audio.volume;
            const startedAt = performance.now();
            const step = (now: number): void => {
                const t = Math.min(1, (now - startedAt) / FADE_MS);
                audio.volume = clamp01(from + (clampedTarget - from) * t);
                if (t < 1) {
                    fadeRef.current = requestAnimationFrame(step);
                } else {
                    fadeRef.current = null;
                    // Pause once silent so a muted tab is not decoding audio for nothing.
                    if (clampedTarget === 0) {
                        audio.pause();
                    }
                }
            };
            fadeRef.current = requestAnimationFrame(step);
        },
        [stopFade],
    );

    // Keep media state outside React's source-render cycle. load() aborts the old play promise, so the
    // player generation-checks every attempt before it is allowed to affect the currently playing track.
    useEffect(() => {
        const audio = audioRef.current;
        const webmSource = webmSourceRef.current;
        const mp3Source = mp3SourceRef.current;
        if (!audio || !webmSource || !mp3Source) {
            return undefined;
        }
        const player = createThemeMusicPlayer({
            audio,
            webmSource,
            mp3Source,
            playlist: PLAYLIST,
            getTargetVolume,
            fadeTo,
            onPlaybackStarted: () => {
                stopFade();
                setNeedsUnlock(false);
            },
            onPlaybackBlocked: () => setNeedsUnlock(true),
        });
        playerRef.current = player;
        return () => {
            player.destroy();
            if (playerRef.current === player) {
                playerRef.current = null;
            }
        };
    }, [fadeTo, getTargetVolume, stopFade]);

    // Switching into the ranked preparation sequence selects its one-track loop; leaving restores the menu
    // playlist at the same index it had before. If playback was already unlocked, the hand-off starts now.
    useEffect(() => {
        const player = playerRef.current;
        if (!player) {
            return;
        }
        if (prefight) {
            void player.playSingle(PREFIGHT_TRACK);
        } else {
            void player.resumePlaylist();
        }
    }, [prefight]);

    const start = useCallback(() => {
        const target = getTargetVolume();
        if (target > 0) {
            void playerRef.current?.start(target, true);
        }
    }, [getTargetVolume]);

    // Keep the unlock listeners until play ACTUALLY succeeds. A source swap can reject an older play()
    // promise after a newer one has started, and a blocked mobile attempt must remain retryable from the
    // next ordinary click/touch without requiring the player to jiggle the volume toggle.
    useEffect(() => {
        if (!needsUnlock || !singing || effectiveVolume === 0) {
            return undefined;
        }
        const onGesture = (): void => start();
        const events = ["click", "keydown", "touchend"] as const;
        for (const event of events) {
            window.addEventListener(event, onGesture, { capture: true, passive: true });
        }
        return () => {
            for (const event of events) {
                window.removeEventListener(event, onGesture, true);
            }
        };
    }, [effectiveVolume, needsUnlock, singing, start]);

    // Leaving for the fight silences it; coming back picks it up again.
    useEffect(() => {
        const audio = audioRef.current;
        const player = playerRef.current;
        if (!audio || !player) {
            return;
        }
        const arrivedOrLeft = wasSingingRef.current !== singing;
        wasSingingRef.current = singing;
        const target = singing ? effectiveVolume : 0;
        player.setTargetVolume(target);
        if (target === 0) {
            fadeTo(0);
            return;
        }
        if (player.hasStarted()) {
            if (audio.paused) {
                void player.start(target, true);
            } else if (arrivedOrLeft) {
                fadeTo(target);
            } else {
                // A LEVEL change, from either slider: track it as it is dragged. Fading to each step would
                // chase the handle by most of a second, which is useless for setting a level by ear.
                stopFade();
                audio.volume = target;
            }
        } else {
            setNeedsUnlock(true);
        }
    }, [singing, effectiveVolume, fadeTo, stopFade]);

    const silent = muted || volume === 0;

    // The forged medallion stays the same size in both placements. Docking only changes who owns the
    // positioning, while the floating fallback keeps its fixed bottom-corner anchor.
    const containerStyle: React.CSSProperties = dockSlot
        ? {
              position: "relative",
              width: 32,
              height: 32,
              flex: "0 0 32px",
              color: "#dcb158",
          }
        : {
              position: "fixed",
              right: "1rem",
              bottom: "1rem",
              zIndex: 60,
              width: 32,
              height: 32,
              color: "#e8e2d4",
          };

    const control = (
        <div
            onMouseEnter={showVolumeControl}
            onMouseLeave={scheduleVolumeCollapse}
            onFocus={showVolumeControl}
            onBlur={scheduleVolumeCollapse}
            style={containerStyle}
        >
            <button
                type="button"
                aria-pressed={silent}
                aria-label="Toggle music"
                onClick={() => {
                    const nextMuted = !muted;
                    setMusicMuted(nextMuted);
                    // Pressing the speaker at zero means "I want to hear it" — do not unmute into silence.
                    const nextVolume = !nextMuted && volume === 0 ? DEFAULT_MUSIC_VOLUME : volume;
                    if (nextVolume !== volume) {
                        setMusicVolume(nextVolume);
                    }
                    const nextTarget = singing && !nextMuted ? nextVolume : 0;
                    const audio = audioRef.current;
                    const player = playerRef.current;
                    player?.setTargetVolume(nextTarget);
                    if (nextTarget === 0) {
                        fadeTo(0);
                    } else if (player && (audio?.paused || !player.hasStarted())) {
                        void player.start(nextTarget, true);
                    } else {
                        fadeTo(nextTarget);
                    }
                }}
                style={{
                    display: "grid",
                    placeItems: "center",
                    width: 32,
                    height: 32,
                    flex: "0 0 auto",
                    padding: 0,
                    // Artwork supplies both the circular frame and its pictogram; the button retains the
                    // interaction and the slider remains a separate layer above it.
                    borderRadius: 0,
                    border: "none",
                    backgroundColor: "transparent",
                    backgroundImage: `url(${silent ? musicMutedControlImage : musicOnControlImage})`,
                    backgroundPosition: "center",
                    backgroundRepeat: "no-repeat",
                    backgroundSize: "contain",
                    color: "inherit",
                    cursor: "pointer",
                    transition: "filter 140ms ease, transform 140ms ease",
                }}
            />
            <div
                style={{
                    position: "absolute",
                    left: "50%",
                    bottom: "100%",
                    width: 32,
                    height: 94,
                    transform: "translateX(-50%)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: volumeExpanded ? 1 : 0,
                    pointerEvents: volumeExpanded ? "auto" : "none",
                    transition: "opacity 140ms ease",
                }}
                onMouseEnter={showVolumeControl}
                onMouseLeave={scheduleVolumeCollapse}
            >
                <div
                    className="hoc-volume-slider-shell"
                    style={
                        {
                            // The visible fill ends at the centre of the 12px thumb while respecting the
                            // range input's six-pixel end stops. Keep the thumb itself exactly the same size.
                            "--hoc-volume-level": `${Math.round(4 + volume * 78)}px`,
                        } as React.CSSProperties
                    }
                >
                    <input
                        type="range"
                        className="hoc-volume-slider"
                        min={0}
                        max={100}
                        step={1}
                        value={Math.round(volume * 100)}
                        aria-label="Music volume"
                        aria-orientation="vertical"
                        onChange={(event) => {
                            const next = clamp01(Number(event.target.value) / 100);
                            setMusicVolume(next);
                            if (next > 0) {
                                setMusicMuted(false);
                            }
                            const audio = audioRef.current;
                            const player = playerRef.current;
                            const nextTarget = singing ? next : 0;
                            player?.setTargetVolume(nextTarget);
                            if (audio) {
                                // Dragging is continuous, so track it directly rather than fading to each step.
                                stopFade();
                                if (nextTarget === 0) {
                                    audio.volume = 0;
                                    audio.pause();
                                } else if (player && (audio.paused || !player.hasStarted())) {
                                    void player.start(nextTarget, true);
                                } else {
                                    audio.volume = nextTarget;
                                }
                            }
                        }}
                    />
                </div>
            </div>
        </div>
    );

    return (
        <>
            {/* Never inside the portal: re-parenting the element would remount it and drop the track's
                position the moment a sidebar appeared or went away. */}
            <audio ref={audioRef} preload="none">
                <source ref={webmSourceRef} src={PLAYLIST[0].webm} type="audio/webm; codecs=opus" />
                <source ref={mp3SourceRef} src={PLAYLIST[0].mp3} type="audio/mpeg" />
            </audio>
            {dockSlot ? createPortal(control, dockSlot) : control}
        </>
    );
};
