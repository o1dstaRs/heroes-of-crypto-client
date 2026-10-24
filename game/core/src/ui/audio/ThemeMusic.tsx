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
 * The arena theme ("The Besieged Town") and the shared sound control.
 *
 * Mounted ONCE, above the router, rather than inside each screen: a single long-lived <audio> element means
 * moving from the ranked arena into a match does not restart the track.
 *
 * The ranked arena carries the menu playlist. A ranked match uses its own track:
 * it plays "Iron and Silk" from the moment it is found until the player leaves, fight included. The offline
 * sandbox at "/" stays quiet.
 *
 * All levels live in settings/audioLevels. The medallion controls master sound and offers the music
 * checkbox on every route; music and effects keep their separate balances in player settings.
 */
const FADE_MS = 900;
/** How long two songs overlap. */
const CROSSFADE_MS = 2200;

/**
 * The menu playlist, in order. The arena theme plays first, then the older menu songs, and the list wraps
 * so the music never stops while a player sits in the menus — a single looping track gets old fast at the
 * matchmaking screen, where the wait can be minutes.
 *
 * Each entry ships as Opus/WebM and MP3; the browser picks. Adding a track is a matter of dropping both
 * encodes into public/audio and appending here.
 */
const PLAYLIST = [
    { webm: "/audio/the_besieged_town.webm", mp3: "/audio/the_besieged_town.mp3" },
    { webm: "/audio/the_last_stand.webm", mp3: "/audio/the_last_stand.mp3" },
    { webm: "/audio/the_stone_lullaby.webm", mp3: "/audio/the_stone_lullaby.mp3" },
] as const;
const PLAYBACK_KEY = "hoc:themePlayback";

const readThemeMemory = (): { index: number; time: number; matchTime?: number } | null => {
    try {
        const raw = sessionStorage.getItem(PLAYBACK_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as { index?: unknown; time?: unknown; matchTime?: unknown };
        if (typeof parsed.index !== "number" || !Number.isInteger(parsed.index)) return null;
        if (parsed.index < 0 || parsed.index >= PLAYLIST.length) return null;
        if (typeof parsed.time !== "number" || !Number.isFinite(parsed.time) || parsed.time < 0) return null;
        const memory: { index: number; time: number; matchTime?: number } = {
            index: parsed.index,
            time: parsed.time,
        };
        // Absent means the menu was playing. Zero is a real position: the match track had just started.
        if (parsed.matchTime !== undefined) {
            if (typeof parsed.matchTime !== "number" || !Number.isFinite(parsed.matchTime) || parsed.matchTime < 0) {
                return memory;
            }
            memory.matchTime = parsed.matchTime;
        }
        return memory;
    } catch {
        return null;
    }
};

/** A ranked match lives at /game/:id. The replay is /game/:id/replay and stays quiet. */
const isLiveGamePath = (pathname: string): boolean => /^\/game\/[^/]+\/?$/.test(pathname);

/**
 * The match track. It replaces the menu playlist from the moment a ranked match is found and stays there
 * through the fight — match check, picks, augments, placement, combat — until the player leaves. A single
 * track rather than a list: the match wants one continuous mood, and a fight can run long enough that
 * swapping tracks at the first turn is the thing that used to make the room go quiet.
 */
const PREFIGHT_TRACK = { webm: "/audio/iron_and_silk.webm", mp3: "/audio/iron_and_silk.mp3" } as const;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** The ranked arena carries the menu theme. A ranked match sings via the match-track flag instead.
 *
 * Note this governs what PLAYS, not where the speaker is offered: the control sits in the bottom-right
 * corner on every screen, the silent ones included. It is a setting, not a now-playing indicator — muting
 * or setting the level mid-fight is exactly when a player reaches for it, and the choice is stored. */
const shouldSing = (pathname: string): boolean => /^\/play\/?$/.test(pathname);

export const ThemeMusic: React.FC = () => {
    const { pathname } = useLocation();
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const webmSourceRef = useRef<HTMLSourceElement | null>(null);
    const mp3SourceRef = useRef<HTMLSourceElement | null>(null);
    const nextAudioRef = useRef<HTMLAudioElement | null>(null);
    const nextWebmRef = useRef<HTMLSourceElement | null>(null);
    const nextMp3Ref = useRef<HTMLSourceElement | null>(null);
    // Which element is actually audible. A crossfade hands this from one <audio> to the other.
    const outputRef = useRef<HTMLAudioElement | null>(null);
    const playerRef = useRef<ThemeMusicPlayer | null>(null);
    const fadeRef = useRef<number | null>(null);
    // Reloaded inside a match: stay on Iron and Silk until the ranked screen reports, instead of
    // starting the menu song in the gap before that flag turns on.
    const holdMatchRef = useRef(false);
    // The error overlay turns the match flag off while the URL is still /game/:id. That is a real stop.
    // Arriving at that URL is not: the flag is false for a moment before the screen mounts.
    const silencedMatchRef = useRef(false);
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

    const getTargetVolume = useCallback(() => {
        const path = window.location.pathname;
        if (shouldSing(path) || isPrefightMusicActive()) return musicGain();
        // A reloaded match starts before the ranked screen has mounted and pushed the flag on.
        if (holdMatchRef.current && isLiveGamePath(path) && !silencedMatchRef.current) return musicGain();
        return 0;
    }, []);

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
            const audio = outputRef.current ?? audioRef.current;
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
                const media = outputRef.current ?? audio;
                const t = Math.min(1, (now - startedAt) / FADE_MS);
                media.volume = clamp01(from + (clampedTarget - from) * t);
                if (t < 1) {
                    fadeRef.current = requestAnimationFrame(step);
                } else {
                    fadeRef.current = null;
                    // Detach the sources once silent so a quiet screen does not retain the decoded music.
                    // The player restores the current track, match or menu, when music is wanted again.
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
        const nextAudio = nextAudioRef.current;
        const nextWebm = nextWebmRef.current;
        const nextMp3 = nextMp3Ref.current;
        if (!audio || !webmSource || !mp3Source || !nextAudio || !nextWebm || !nextMp3) {
            return undefined;
        }
        outputRef.current = audio;
        const opening = readThemeMemory();
        // Only a reload of the match itself reopens Iron and Silk. A menu reload must not.
        const resumeMatch = isLiveGamePath(window.location.pathname) && opening?.matchTime !== undefined;
        holdMatchRef.current = resumeMatch;
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
            initialIndex: opening?.index ?? 0,
            initialTime: opening?.time ?? 0,
            initialMatch: resumeMatch ? { track: PREFIGHT_TRACK, time: opening?.matchTime ?? 0 } : undefined,
            onProgress: () => remember(),
            onOutputChange: (element) => {
                outputRef.current = element as HTMLAudioElement;
            },
            crossfade: { ms: CROSSFADE_MS, audio: nextAudio, webmSource: nextWebm, mp3Source: nextMp3 },
        });
        playerRef.current = player;
        let lastWrite = 0;
        function remember(force = false): void {
            // Menu index and time stay in the record while the match is on, and the match clock is stored
            // beside them. Skipping the write here used to make a reload start Iron and Silk from bar 0.
            const now = Date.now();
            if (!force && now - lastWrite < 1000) return;
            const memory = player.playbackMemory();
            if (!Number.isFinite(memory.time) || memory.time < 0) return;
            if (memory.matchTime !== undefined && (!Number.isFinite(memory.matchTime) || memory.matchTime < 0)) {
                return;
            }
            lastWrite = now;
            try {
                const payload =
                    memory.matchTime === undefined
                        ? { index: memory.index, time: memory.time }
                        : { index: memory.index, time: memory.time, matchTime: memory.matchTime };
                sessionStorage.setItem(PLAYBACK_KEY, JSON.stringify(payload));
            } catch {
                // Private mode still plays; a reload just starts the theme again.
            }
        }
        const onHide = (): void => remember(true);
        window.addEventListener("pagehide", onHide);
        return () => {
            window.removeEventListener("pagehide", onHide);
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
            holdMatchRef.current = false;
            silencedMatchRef.current = false;
            void player.playSingle(PREFIGHT_TRACK);
            return;
        }
        // Still inside a match URL and the screen has not started the fight music yet: do not pull the
        // menu song in over a resumed Iron and Silk, and do not load the menu just to throw it away.
        if (isLiveGamePath(window.location.pathname) && (holdMatchRef.current || !player.hasStarted())) {
            return;
        }
        if (isLiveGamePath(window.location.pathname)) silencedMatchRef.current = true;
        holdMatchRef.current = false;
        void player.resumePlaylist();
    }, [prefight]);

    // Left the match for a menu while the flag was already off (a dead game, then back to the arena).
    // The effect above does not re-run, because the flag never changed.
    useEffect(() => {
        if (prefight || !shouldSing(pathname)) return;
        const player = playerRef.current;
        if (!player || player.isPlaylist()) return;
        holdMatchRef.current = false;
        silencedMatchRef.current = false;
        void player.resumePlaylist();
    }, [pathname, prefight]);

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
        // A reloaded match is audible before the ranked screen mounts, so the unlock has to cover that
        // URL too. Otherwise the click that would have started Iron and Silk is ignored.
        const canHear = singing || (isLiveGamePath(pathname) && !silencedMatchRef.current);
        if (!needsUnlock || !canHear || effectiveVolume === 0) {
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
    }, [effectiveVolume, needsUnlock, pathname, singing, start]);

    // Leaving the match silences it; coming back to a menu picks the playlist up again. The fight itself
    // does not: the match flag stays on, so this fade never runs at the first turn.
    useEffect(() => {
        const audio = outputRef.current ?? audioRef.current;
        const player = playerRef.current;
        if (!audio || !player) {
            return;
        }
        // /game/:id is audible as soon as we land there, so the walk from the menu does not dip to silence
        // in the moment before the match flag turns on. The overlay opts out via silencedMatchRef.
        const onMatchUrl = isLiveGamePath(pathname) && !silencedMatchRef.current;
        const audibleNow = singing || onMatchUrl;
        const arrivedOrLeft = wasSingingRef.current !== audibleNow;
        wasSingingRef.current = audibleNow;
        const target = audibleNow ? effectiveVolume : 0;
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
            // Ask immediately. Browsers that already allow this origin begin at the saved bar; the rest
            // stay retryable from the next click.
            setNeedsUnlock(true);
            void player.start(target, true);
        }
    }, [singing, effectiveVolume, pathname, fadeTo, stopFade]);

    const applyControlChange = useCallback(() => {
        // Read the store in the same gesture: React has not necessarily re-rendered after the checkbox
        // or slider writes it, and starting media here preserves the browser's user-gesture permission.
        const target = getTargetVolume();
        const audio = outputRef.current ?? audioRef.current;
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
            {/* Never inside the portal: re-parenting an element would remount it and drop the track the moment a
                sidebar appeared or went away. The second element stays silent until a song is about to end,
                or until the match track takes over. */}
            <audio ref={audioRef} preload="none">
                <source ref={webmSourceRef} src={PLAYLIST[0].webm} type="audio/webm; codecs=opus" />
                <source ref={mp3SourceRef} src={PLAYLIST[0].mp3} type="audio/mpeg" />
            </audio>
            <audio ref={nextAudioRef} preload="none">
                <source ref={nextWebmRef} type="audio/webm; codecs=opus" />
                <source ref={nextMp3Ref} type="audio/mpeg" />
            </audio>
            {dockSlot ? createPortal(control, dockSlot) : control}
        </>
    );
};
