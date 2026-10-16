import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router";

import {
    getAudioLevels,
    getAudioLevelsServerSnapshot,
    musicGain,
    subscribeAudioLevels,
} from "../../settings/audioLevels";
import { AudioControl } from "./AudioControl";
import { isPrefightMusicActive, subscribePrefightMusic } from "./prefightMusic";
import { createThemeMusicPlayer, type ThemeMusicPlayer } from "./themeMusicPlayer";
import { getVolumeSlot, getVolumeSlotServerSnapshot, subscribeVolumeSlot } from "./volumeSlot";

/**
 * The menu theme ("The Last Stand") and the shared sound control.
 *
 * Mounted ONCE, above the router, rather than inside each screen: a single long-lived <audio> element means
 * walking from matchmaking to the lobby list and on to the portal does not restart the track, which is
 * exactly what re-mounting per route would do.
 *
 * Which menu screens sing is decided here (see SINGING_ROUTES). A ranked match is not one of those routes:
 * it plays "Iron and Silk" from the moment it is found until the player leaves, fight included. The offline
 * sandbox at "/" stays quiet.
 *
 * The site (heroesofcrypto.io) plays the same track on mode select and profile through its own copy of this,
 * site/src/components/ThemeMusic.astro. It is a DIFFERENT ORIGIN and cannot see this localStorage, so the
 * redirect pages under /play hand the setting over in the query string; the keys and the parameter names
 * used by settings/audioLevels have to match on both sides.
 *
 * All levels live in settings/audioLevels. The medallion controls master sound and offers the music
 * checkbox on every route; music and effects keep their separate balances in player settings.
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
 * The match track. It replaces the menu playlist from the moment a ranked match is found and stays there
 * through the fight — match check, picks, augments, placement, combat — until the player leaves. A single
 * track rather than a list: the match wants one continuous mood, and a fight can run long enough that
 * swapping tracks at the first turn is the thing that used to make the room go quiet.
 */
const PREFIGHT_TRACK = { webm: "/audio/iron_and_silk.webm", mp3: "/audio/iron_and_silk.mp3" } as const;

/** Route prefixes that carry the menu theme. A ranked match sings via the match-track flag instead, and
 * the offline sandbox stays quiet.
 *
 * Note this governs what PLAYS, not where the speaker is offered: the control sits in the bottom-right
 * corner on every screen, the silent ones included. It is a setting, not a now-playing indicator — muting
 * or setting the level mid-fight is exactly when a player reaches for it, and the choice is stored. */
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
    // Whether the last pass was on a singing screen: it separates "arrived somewhere with music" (fade it
    // in) from "the player moved a slider" (follow the handle).
    const wasSingingRef = useRef(false);
    // Shared with the Audio section of the player settings: whichever one the player reaches for, both
    // show the same level and the track follows it live.
    const levels = useSyncExternalStore(subscribeAudioLevels, getAudioLevels, getAudioLevelsServerSnapshot);
    const [prefight, setPrefight] = useState(false);
    const [needsUnlock, setNeedsUnlock] = useState(true);
    // Rendered into the sidebar's footer when there is one, beside the fullscreen toggle; otherwise it
    // floats in the bottom-right corner as before.
    const dockSlot = useSyncExternalStore(subscribeVolumeSlot, getVolumeSlot, getVolumeSlotServerSnapshot);

    useEffect(() => subscribePrefightMusic(setPrefight), []);

    // The match sings wherever it happens — it lives under /game, which is otherwise silent.
    const singing = prefight || shouldSing(pathname);
    const effectiveVolume = musicGain(levels);

    const getTargetVolume = useCallback(
        () => (shouldSing(window.location.pathname) || isPrefightMusicActive() ? musicGain() : 0),
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
                    // Detach the sources once silent so fight screens do not retain encoded or decoded
                    // menu music. The player restores the current track when music is wanted again.
                    if (clampedTarget === 0) {
                        playerRef.current?.releaseMedia();
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

    // Leaving the match silences it; coming back to a menu picks the playlist up again. The fight itself
    // does not: the match flag stays on, so this fade never runs at the first turn.
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
            if (effectiveVolume === 0) {
                stopFade();
                player.releaseMedia();
            } else {
                fadeTo(0);
            }
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

    const applyControlChange = useCallback(() => {
        // Read the store in the same gesture: React has not necessarily re-rendered after the checkbox
        // or slider writes it, and starting media here preserves the browser's user-gesture permission.
        const target = getTargetVolume();
        const audio = audioRef.current;
        const player = playerRef.current;
        player?.setTargetVolume(target);
        stopFade();
        if (target === 0) {
            player?.releaseMedia();
        } else if (player && (audio?.paused || !player.hasStarted())) {
            void player.start(target, true);
        } else if (audio) {
            audio.volume = target;
        }
    }, [getTargetVolume, stopFade]);

    const control = <AudioControl docked={Boolean(dockSlot)} onSettingsChange={applyControlChange} />;

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
