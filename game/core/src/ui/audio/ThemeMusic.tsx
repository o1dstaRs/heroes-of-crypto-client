import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router";

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
const DEFAULT_VOLUME = 0.5; // "medium"
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

/** Route prefixes that carry the theme. Everything else — the fight, the sandbox — stays quiet. */
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
    const fadeRef = useRef<number | null>(null);
    const startedRef = useRef(false);
    const initial = useRef(readInitialSettings());
    const [volume, setVolume] = useState(initial.current.volume);
    const [muted, setMuted] = useState(initial.current.muted);
    const [trackIndex, setTrackIndex] = useState(0);

    const singing = shouldSing(pathname);
    const effectiveVolume = muted ? 0 : volume;

    // Fade rather than snap: the theme arriving at full volume the instant someone clicks is startling, and
    // that first click is usually aimed at something else entirely.
    const fadeTo = useCallback((target: number) => {
        const audio = audioRef.current;
        if (!audio) {
            return;
        }
        if (fadeRef.current !== null) {
            cancelAnimationFrame(fadeRef.current);
        }
        const from = audio.volume;
        const startedAt = performance.now();
        const step = (now: number): void => {
            const t = Math.min(1, (now - startedAt) / FADE_MS);
            audio.volume = clamp01(from + (target - from) * t);
            if (t < 1) {
                fadeRef.current = requestAnimationFrame(step);
            } else {
                fadeRef.current = null;
                // Pause once silent so a muted tab is not decoding audio for nothing.
                if (target === 0) {
                    audio.pause();
                }
            }
        };
        fadeRef.current = requestAnimationFrame(step);
    }, []);

    const start = useCallback(() => {
        const audio = audioRef.current;
        if (!audio || startedRef.current || !shouldSing(window.location.pathname)) {
            return;
        }
        startedRef.current = true;
        audio.volume = 0;
        audio
            .play()
            .then(() => fadeTo(muted ? 0 : volume))
            .catch(() => {
                // Autoplay still refused (some mobile power-saving modes). The toggle stays, so the player
                // can ask for it explicitly.
                startedRef.current = false;
            });
    }, [fadeTo, muted, volume]);

    // Autoplay is blocked until the page has been interacted with, so the theme waits for the first gesture
    // of any kind and slips in behind it.
    useEffect(() => {
        const onGesture = (): void => start();
        const events = ["pointerdown", "keydown", "touchstart"] as const;
        for (const event of events) {
            window.addEventListener(event, onGesture, { once: true, passive: true });
        }
        return () => {
            for (const event of events) {
                window.removeEventListener(event, onGesture);
            }
        };
    }, [start]);

    // Leaving for the fight silences it; coming back picks it up again.
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) {
            return;
        }
        if (!singing) {
            fadeTo(0);
            return;
        }
        if (startedRef.current) {
            if (audio.paused) {
                audio.play().catch(() => undefined);
            }
            fadeTo(effectiveVolume);
        }
    }, [singing, effectiveVolume, fadeTo]);

    // One track ending hands over to the next, wrapping at the end of the list. `loop` is deliberately NOT
    // set on the element: it would pin playback to a single track and this handler would never fire.
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) {
            return undefined;
        }
        const onEnded = (): void => setTrackIndex((current) => (current + 1) % PLAYLIST.length);
        audio.addEventListener("ended", onEnded);
        return () => audio.removeEventListener("ended", onEnded);
    }, []);

    // Load and play whatever track the list has moved to. Skipped on the very first render so it does not
    // fight the autoplay gate — `started` only becomes true once a gesture has let us in.
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio || !startedRef.current) {
            return;
        }
        audio.load();
        audio.volume = 0;
        audio
            .play()
            .then(() => fadeTo(shouldSing(window.location.pathname) ? (muted ? 0 : volume) : 0))
            .catch(() => undefined);
        // volume/muted are read at fade time on purpose: a mid-track volume change must not reload the track.
    }, [trackIndex]);

    useEffect(() => {
        try {
            window.localStorage.setItem(VOLUME_KEY, String(volume));
            window.localStorage.setItem(MUTED_KEY, muted ? "1" : "0");
        } catch {
            // The choice just will not outlive the session.
        }
    }, [volume, muted]);

    if (!singing) {
        // The element itself stays mounted (so the track keeps its position); only the control is hidden.
        return (
            <audio ref={audioRef} preload="none" hidden>
                <source src={PLAYLIST[trackIndex].webm} type="audio/webm; codecs=opus" />
                <source src={PLAYLIST[trackIndex].mp3} type="audio/mpeg" />
            </audio>
        );
    }

    const silent = muted || volume === 0;

    return (
        <div
            style={{
                position: "fixed",
                right: "1rem",
                bottom: "1rem",
                zIndex: 60,
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.4rem 0.6rem",
                borderRadius: "999px",
                background: "rgba(12, 14, 20, 0.72)",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                backdropFilter: "blur(6px)",
                color: silent ? "#8d8778" : "#e8e2d4",
            }}
        >
            <audio ref={audioRef} preload="none">
                <source src={PLAYLIST[trackIndex].webm} type="audio/webm; codecs=opus" />
                <source src={PLAYLIST[trackIndex].mp3} type="audio/mpeg" />
            </audio>
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
                    if (!startedRef.current) {
                        start();
                        return;
                    }
                    const audio = audioRef.current;
                    if (audio?.paused && !nextMuted) {
                        audio.play().catch(() => undefined);
                    }
                    fadeTo(nextMuted ? 0 : nextVolume);
                }}
                style={{
                    display: "grid",
                    placeItems: "center",
                    width: "2rem",
                    height: "2rem",
                    padding: 0,
                    border: 0,
                    borderRadius: "50%",
                    background: "transparent",
                    color: "inherit",
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
                    if (audio) {
                        // Dragging is continuous, so track it directly rather than fading to each step.
                        if (fadeRef.current !== null) {
                            cancelAnimationFrame(fadeRef.current);
                            fadeRef.current = null;
                        }
                        if (audio.paused && next > 0 && startedRef.current) {
                            audio.play().catch(() => undefined);
                        }
                        audio.volume = next;
                    }
                    if (!startedRef.current) {
                        start();
                    }
                }}
                style={{ width: "5.5rem", accentColor: "#ffd88a", cursor: "pointer" }}
            />
        </div>
    );
};
