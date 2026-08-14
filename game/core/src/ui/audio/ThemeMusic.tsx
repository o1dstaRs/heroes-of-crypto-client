import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router";

import { isPrefightMusicActive, subscribePrefightMusic } from "./prefightMusic";
import { createThemeMusicPlayer, type ThemeMusicPlayer } from "./themeMusicPlayer";
import { getVolumeSlot, getVolumeSlotServerSnapshot, subscribeVolumeSlot } from "./volumeSlot";

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
 * below have to match on both sides.
 */
const VOLUME_KEY = "hoc:themeVolume";
const MUTED_KEY = "hoc:themeMuted";
// 10% (owner call, down from a "medium" 0.5): the menu theme opened far louder than most players wanted
// on first load, so it now starts quiet and is turned UP by anyone who wants it. Must stay in step with
// ThemeMusic.astro — a player who has never touched the slider crosses between the two origins with no
// stored value, and a mismatch is an audible jump.
const DEFAULT_VOLUME = 0.1;
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

/**
 * The volume to open with: a value handed over from the site wins, then this origin's own stored setting,
 * then the medium default. Reading the URL first is what makes the setting follow the player across the
 * origin boundary — arriving with one means they just set it next door.
 */
const readInitialSettings = (): { volume: number; muted: boolean } => {
    let volume = DEFAULT_VOLUME;
    let muted = false;
    try {
        const storedVolume = window.localStorage.getItem(VOLUME_KEY);
        if (storedVolume !== null && Number.isFinite(Number(storedVolume))) {
            volume = clamp01(Number(storedVolume));
        }
        muted = window.localStorage.getItem(MUTED_KEY) === "1";
    } catch {
        // Private mode / storage disabled: the default still gives the player music.
    }
    try {
        const params = new URLSearchParams(window.location.search);
        const fromUrl = params.get("vol");
        if (fromUrl !== null && Number.isFinite(Number(fromUrl))) {
            volume = clamp01(Number(fromUrl));
            muted = params.get("muted") === "1";
        }
    } catch {
        // Malformed query string — keep whatever was stored.
    }
    return { volume, muted };
};

export const ThemeMusic: React.FC = () => {
    const { pathname } = useLocation();
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const webmSourceRef = useRef<HTMLSourceElement | null>(null);
    const mp3SourceRef = useRef<HTMLSourceElement | null>(null);
    const playerRef = useRef<ThemeMusicPlayer | null>(null);
    const fadeRef = useRef<number | null>(null);
    const effectiveVolumeRef = useRef(0);
    const initial = useRef(readInitialSettings());
    const [volumeExpanded, setVolumeExpanded] = useState(false);
    const [volume, setVolume] = useState(initial.current.volume);
    const [muted, setMuted] = useState(initial.current.muted);
    const [prefight, setPrefight] = useState(false);
    const [needsUnlock, setNeedsUnlock] = useState(true);
    // Rendered into the sidebar's footer when there is one, beside the fullscreen toggle; otherwise it
    // floats in the bottom-right corner as before.
    const dockSlot = useSyncExternalStore(subscribeVolumeSlot, getVolumeSlot, getVolumeSlotServerSnapshot);

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
        const target = singing ? effectiveVolume : 0;
        player.setTargetVolume(target);
        if (target === 0) {
            fadeTo(0);
            return;
        }
        if (player.hasStarted()) {
            if (audio.paused) {
                void player.start(target, true);
            } else {
                fadeTo(target);
            }
        } else {
            setNeedsUnlock(true);
        }
    }, [singing, effectiveVolume, fadeTo]);

    useEffect(() => {
        try {
            window.localStorage.setItem(VOLUME_KEY, String(volume));
            window.localStorage.setItem(MUTED_KEY, muted ? "1" : "0");
        } catch {
            // The choice just will not outlive the session.
        }
    }, [volume, muted]);

    const silent = muted || volume === 0;

    // Docked, the control is nothing but the speaker and whatever slider it opens: no disc, no rim, no
    // backdrop, matching the fullscreen toggle it sits opposite. The pill only exists in the floating
    // fallback, where the control has bare screen under it and needs something to read against.
    const containerStyle: React.CSSProperties = dockSlot
        ? {
              position: "relative",
              display: "flex",
              alignItems: "center",
              gap: volumeExpanded ? "0.5rem" : 0,
              color: silent ? "rgba(220, 177, 88, 0.45)" : "#dcb158",
          }
        : {
              position: "fixed",
              right: "1rem",
              bottom: "1rem",
              zIndex: 60,
              display: "flex",
              alignItems: "center",
              gap: volumeExpanded ? "0.5rem" : 0,
              padding: volumeExpanded ? "0.25rem 0.6rem 0.25rem 0.25rem" : 0,
              borderRadius: "999px",
              background: volumeExpanded ? "rgba(12, 14, 20, 0.72)" : "transparent",
              border: volumeExpanded ? "1px solid rgba(255, 255, 255, 0.12)" : "none",
              backdropFilter: volumeExpanded ? "blur(6px)" : "none",
              transition: "padding 140ms ease, background 140ms ease",
              color: silent ? "#8d8778" : "#e8e2d4",
          };

    const control = (
        <div
            onMouseEnter={() => setVolumeExpanded(true)}
            onMouseLeave={() => setVolumeExpanded(false)}
            onFocus={() => setVolumeExpanded(true)}
            style={containerStyle}
        >
            <button
                type="button"
                aria-pressed={silent}
                aria-label="Toggle music"
                title="Music volume"
                onClick={() => {
                    const nextMuted = !muted;
                    setMuted(nextMuted);
                    // Pressing the speaker at zero means "I want to hear it" — do not unmute into silence.
                    const nextVolume = !nextMuted && volume === 0 ? DEFAULT_VOLUME : volume;
                    if (nextVolume !== volume) {
                        setVolume(nextVolume);
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
                    // Docked it is just the glyph, like the fullscreen toggle beside it. The disc is for
                    // the floating fallback only, where there is bare screen behind the icon.
                    borderRadius: 0,
                    border: "none",
                    background: "transparent",
                    color: silent ? "rgba(220, 177, 88, 0.45)" : "#dcb158",
                    cursor: "pointer",
                }}
            >
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
                    <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
                    {silent ? (
                        <path
                            d="M16 9.5l5 5m0-5l-5 5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                        />
                    ) : (
                        <path
                            d="M16.5 8.5a4.5 4.5 0 0 1 0 7M19 6a8 8 0 0 1 0 12"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                        />
                    )}
                </svg>
            </button>
            <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={Math.round(volume * 100)}
                aria-label="Music volume"
                onChange={(event) => {
                    const next = clamp01(Number(event.target.value) / 100);
                    setVolume(next);
                    if (next > 0) {
                        setMuted(false);
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
                style={{
                    width: volumeExpanded ? "5.5rem" : 0,
                    opacity: volumeExpanded ? 1 : 0,
                    // Collapsed it must take NO room at all, so the control is exactly the 32px speaker.
                    margin: 0,
                    minWidth: 0,
                    overflow: "hidden",
                    transition: "width 140ms ease, opacity 140ms ease",
                    accentColor: "#ffd88a",
                    cursor: "pointer",
                }}
            />
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
