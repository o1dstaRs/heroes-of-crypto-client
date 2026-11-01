export interface ThemeTrack {
    webm: string;
    mp3: string;
}

interface ThemeAudio {
    volume: number;
    currentTime?: number;
    duration?: number;
    readonly paused: boolean;
    play(): Promise<void>;
    pause(): void;
    load(): void;
    addEventListener(type: string, listener: EventListener): void;
    removeEventListener(type: string, listener: EventListener): void;
}

interface ThemeSource {
    src: string;
    removeAttribute?(qualifiedName: string): void;
}

interface ThemeChannel {
    audio: ThemeAudio;
    webmSource: ThemeSource;
    mp3Source: ThemeSource;
}

export interface ThemePlaybackMemory {
    /** Menu playlist index. Kept while match music plays so leaving the match continues that song. */
    index: number;
    /** Seconds into the menu song. */
    time: number;
    /** Present only while the match track is what was playing. Zero is the first bar, not "no match". */
    matchTime?: number;
    /** Which match song owns matchTime. Older saved sessions omit this and start on the first song. */
    matchIndex?: number;
}

interface ThemeMusicPlayerOptions {
    audio: ThemeAudio;
    webmSource: ThemeSource;
    mp3Source: ThemeSource;
    playlist: readonly ThemeTrack[];
    getTargetVolume: () => number;
    fadeTo: (targetVolume: number) => void;
    onPlaybackStarted: () => void;
    onPlaybackBlocked: () => void;
    /** Song to reopen after a reload. Out of range starts at the theme. */
    initialIndex?: number;
    /** Seconds into that menu song. Applied when the playlist is playing, never onto the match track. */
    initialTime?: number;
    /**
     * Reload landed inside a ranked match. Open already on this track at this time so the later
     * playSingle of the same file does not load() it back to the first bar.
     */
    initialMatch?: { track: ThemeTrack; time: number; playlist?: readonly ThemeTrack[] };
    /** Fires on the element that is actually playing, including after a crossfade swaps elements. */
    onProgress?: () => void;
    /** The volume control has to follow the element a crossfade just handed playback to. */
    onOutputChange?: (audio: ThemeAudio) => void;
    /**
     * Overlap into the next song, or into and out of the match track, on a second element.
     * Omitted, every hand-off stays immediate — the older call sites still depend on that cut.
     */
    crossfade?: { ms: number } & ThemeChannel;
}

export interface ThemeMusicPlayer {
    start(targetVolume?: number, forceRetry?: boolean): Promise<boolean>;
    setTargetVolume(targetVolume: number): void;
    releaseMedia(): void;
    advance(): Promise<boolean>;
    playSingle(track: ThemeTrack, autoplay?: boolean): Promise<boolean>;
    playMatchPlaylist(tracks: readonly ThemeTrack[], autoplay?: boolean): Promise<boolean>;
    resumePlaylist(autoplay?: boolean): Promise<boolean>;
    hasStarted(): boolean;
    currentIndex(): number;
    /** True when the menu playlist, not the match track, owns the audible element. */
    isPlaylist(): boolean;
    playbackMemory(): ThemePlaybackMemory;
    destroy(): void;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const sameTrack = (a: ThemeTrack, b: ThemeTrack): boolean => a.webm === b.webm && a.mp3 === b.mp3;

const clock = (element: ThemeAudio): number => {
    const time = element.currentTime ?? 0;
    return Number.isFinite(time) && time >= 0 ? time : 0;
};

/**
 * A background tab throttles requestAnimationFrame until it is frozen. The timeout still completes the
 * fade so two songs are not left mixed together after the player has sat on a match for a while.
 */
const scheduleFrame = (callback: (now: number) => void): void => {
    if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(callback);
        return;
    }
    setTimeout(() => callback(performance.now()), 16);
};

/**
 * Owns the long-lived native media lifecycle for menu and pre-fight music.
 *
 * Source changes invalidate older play attempts. That matters because load() rejects the promise belonging
 * to the previous source with AbortError; without the generation check, that stale rejection can mark a
 * newer successful track as stopped and prevent the following playlist hand-off.
 */
export const createThemeMusicPlayer = ({
    audio,
    webmSource,
    mp3Source,
    playlist,
    getTargetVolume,
    fadeTo,
    onPlaybackStarted,
    onPlaybackBlocked,
    initialIndex,
    initialTime,
    initialMatch,
    onProgress,
    onOutputChange,
    crossfade,
}: ThemeMusicPlayerOptions): ThemeMusicPlayer => {
    if (!playlist.length) {
        throw new Error("Theme music playlist must contain at least one track");
    }

    const openingIndex =
        Number.isInteger(initialIndex) &&
        initialIndex !== undefined &&
        initialIndex >= 0 &&
        initialIndex < playlist.length
            ? initialIndex
            : 0;
    let trackIndex = openingIndex;
    let currentTrack: ThemeTrack = playlist[openingIndex];
    let matchTracks: readonly ThemeTrack[] = initialMatch?.playlist ?? (initialMatch ? [initialMatch.track] : []);
    let pendingTime = initialTime !== undefined && Number.isFinite(initialTime) && initialTime > 0 ? initialTime : 0;
    // The menu position underneath a match. A reload of the fight must not replace this with the match clock.
    let menuTime = pendingTime;
    let pendingMatchTime =
        initialMatch !== undefined && Number.isFinite(initialMatch.time) && initialMatch.time > 0
            ? initialMatch.time
            : 0;
    let seekArmed = false;
    let playlistMode = true;
    let playbackHasStarted = false;
    let desiredTargetVolume = clamp01(getTargetVolume());
    let attemptGeneration = 0;
    let currentAttempt: Promise<boolean> | null = null;
    let playlistResume: Promise<boolean> | null = null;
    let mediaReleased = false;
    let destroyed = false;
    let fading = false;
    let fadeGeneration = 0;
    let fadeBackup: ReturnType<typeof setTimeout> | null = null;
    let active: ThemeChannel = { audio, webmSource, mp3Source };
    let idle: ThemeChannel | null = crossfade
        ? { audio: crossfade.audio, webmSource: crossfade.webmSource, mp3Source: crossfade.mp3Source }
        : null;

    const clearFadeBackup = (): void => {
        if (fadeBackup !== null) {
            clearTimeout(fadeBackup);
            fadeBackup = null;
        }
    };

    const clearSource = (source: ThemeSource): void => {
        if (source.removeAttribute) {
            source.removeAttribute("src");
        } else {
            source.src = "";
        }
    };

    const assignTime = (element: ThemeAudio, time: number): void => {
        const duration = element.duration ?? Number.NaN;
        element.currentTime = Number.isFinite(duration) && duration > 1 ? Math.min(time, duration - 0.25) : time;
    };

    const armOpeningSeek = (): void => {
        if (seekArmed || !(pendingTime > 0)) return;
        seekArmed = true;
        const element = active.audio;
        const apply = (): void => {
            // A match track uses this same element. Do not drop the menu's saved position onto it.
            if (!playlistMode || element !== active.audio) return;
            assignTime(element, pendingTime);
            pendingTime = 0;
            seekArmed = false;
            element.removeEventListener("loadedmetadata", apply);
        };
        element.addEventListener("loadedmetadata", apply);
    };

    const armMatchSeek = (): void => {
        if (!(pendingMatchTime > 0)) return;
        const element = active.audio;
        const time = pendingMatchTime;
        const apply = (): void => {
            element.removeEventListener("loadedmetadata", apply);
            // Releasing the element also loads it. That must not spend the saved bar on the empty source.
            if (playlistMode || mediaReleased || element !== active.audio) return;
            assignTime(element, time);
            pendingMatchTime = 0;
        };
        element.addEventListener("loadedmetadata", apply);
    };

    const restoreCurrentTrack = (): void => {
        active.webmSource.src = currentTrack.webm;
        active.mp3Source.src = currentTrack.mp3;
        mediaReleased = false;

        // Reloading sources aborts any older play promise, including one that may settle on the next tick.
        ++attemptGeneration;
        currentAttempt = null;
        if (playlistMode) armOpeningSeek();
        else armMatchSeek();
        active.audio.load();
    };

    if (initialMatch) {
        playlistMode = false;
        currentTrack = initialMatch.track;
        active.webmSource.src = currentTrack.webm;
        active.mp3Source.src = currentTrack.mp3;
        armMatchSeek();
        active.audio.load();
    } else if (openingIndex !== 0) {
        webmSource.src = currentTrack.webm;
        mp3Source.src = currentTrack.mp3;
    }

    const playlistClock = (): number => {
        const live = clock(active.audio);
        // Metadata often arrives at 0, before the saved seek. Reporting that would wipe the menu position.
        if (live <= 0 || live + 1 < menuTime) return menuTime;
        return live;
    };

    const notePlaylistTime = (): void => {
        if (!playlistMode || fading) return;
        const live = clock(active.audio);
        if (live <= 0 || live + 1 < menuTime) return;
        menuTime = live;
    };

    const playbackMemory = (): ThemePlaybackMemory => {
        if (!playlistMode) {
            return {
                index: trackIndex,
                time: menuTime,
                matchTime: pendingMatchTime > 0 ? pendingMatchTime : clock(active.audio),
                ...(matchTracks.length > 1
                    ? {
                          matchIndex: Math.max(
                              0,
                              matchTracks.findIndex((track) => sameTrack(track, currentTrack)),
                          ),
                      }
                    : {}),
            };
        }
        return { index: trackIndex, time: playlistClock() };
    };

    const report = (): void => {
        notePlaylistTime();
        onProgress?.();
    };

    const setTargetVolume = (targetVolume: number): void => {
        desiredTargetVolume = clamp01(targetVolume);
        if (desiredTargetVolume !== 0 || !idle) return;
        fading = false;
        clearFadeBackup();
        idle.audio.pause();
        idle.audio.volume = 0;
    };

    const applyStartedVolume = (fadeIn: boolean): void => {
        if (fadeIn) {
            fadeTo(desiredTargetVolume);
        } else {
            // A cut, used when no second element is configured. Immediate on purpose: a fade here would
            // depend on a timer the older tests do not pump, and a single element cannot overlap two songs.
            active.audio.volume = desiredTargetVolume;
        }
    };

    const startPlayback = (targetVolume = getTargetVolume(), forceRetry = false, fadeIn = true): Promise<boolean> => {
        setTargetVolume(targetVolume);
        const media = active.audio;

        if (desiredTargetVolume === 0 || destroyed) {
            media.volume = 0;
            return Promise.resolve(false);
        }

        if (mediaReleased) {
            if (playlistMode && menuTime > 0) pendingTime = menuTime;
            restoreCurrentTrack();
        }

        if (currentAttempt && !forceRetry) {
            return currentAttempt;
        }

        // Some browsers flip paused=false while play() is still pending. A genuine user gesture must be
        // able to supersede that attempt instead of being mistaken for proof that playback already began.
        if (!currentAttempt && !media.paused) {
            playbackHasStarted = true;
            onPlaybackStarted();
            applyStartedVolume(fadeIn);
            return Promise.resolve(true);
        }

        const generation = ++attemptGeneration;
        media.volume = fadeIn ? 0 : desiredTargetVolume;

        let nativeAttempt: Promise<void>;
        try {
            nativeAttempt = media.play();
        } catch {
            if (generation === attemptGeneration && !destroyed) {
                currentAttempt = null;
                onPlaybackBlocked();
            }
            return Promise.resolve(false);
        }

        const attempt = nativeAttempt.then(
            () => {
                if (generation !== attemptGeneration || destroyed) {
                    return !media.paused;
                }
                currentAttempt = null;
                playbackHasStarted = true;
                onPlaybackStarted();
                applyStartedVolume(fadeIn);
                return true;
            },
            () => {
                if (generation === attemptGeneration && !destroyed) {
                    currentAttempt = null;
                    onPlaybackBlocked();
                }
                return false;
            },
        );
        currentAttempt = attempt;
        return attempt;
    };

    const finishSwap = (
        generation: number,
        incoming: ThemeChannel,
        outgoing: ThemeChannel,
        track: ThemeTrack,
        nextPlaylistMode: boolean,
        nextIndex: number,
    ): void => {
        if (generation !== fadeGeneration || destroyed) return;
        outgoing.audio.pause();
        outgoing.audio.volume = 0;
        unbind(outgoing.audio);
        idle = outgoing;
        active = incoming;
        currentTrack = track;
        // A new menu song starts at its own beginning. Returning to the same song keeps menuTime.
        if (nextIndex !== trackIndex) menuTime = 0;
        if (nextPlaylistMode) pendingMatchTime = 0;
        playlistMode = nextPlaylistMode;
        trackIndex = nextIndex;
        if (nextPlaylistMode) pendingTime = 0;
        fading = false;
        clearFadeBackup();
        playbackHasStarted = true;
        bind(active.audio);
        onOutputChange?.(active.audio);
        report();
    };

    const mix = (
        generation: number,
        outgoing: ThemeChannel,
        incoming: ThemeChannel,
        begun: number,
        track: ThemeTrack,
        nextPlaylistMode: boolean,
        nextIndex: number,
    ): void => {
        const step = (now: number): void => {
            if (generation !== fadeGeneration || !fading || destroyed) return;
            if (desiredTargetVolume === 0) {
                fading = false;
                clearFadeBackup();
                incoming.audio.pause();
                incoming.audio.volume = 0;
                outgoing.audio.volume = 0;
                return;
            }
            const span = crossfade?.ms ?? 1;
            const t = Math.min(1, (now - begun) / span);
            outgoing.audio.volume = desiredTargetVolume * (1 - t);
            incoming.audio.volume = desiredTargetVolume * t;
            if (t < 1) {
                scheduleFrame(step);
                return;
            }
            finishSwap(generation, incoming, outgoing, track, nextPlaylistMode, nextIndex);
        };
        clearFadeBackup();
        fadeBackup = setTimeout(() => step(begun + (crossfade?.ms ?? 0) + 1), (crossfade?.ms ?? 0) + 80);
        scheduleFrame(step);
    };

    const beginOverlap = (track: ThemeTrack, nextPlaylistMode: boolean, nextIndex: number, seekTo: number): boolean => {
        if (!crossfade || !idle || desiredTargetVolume === 0 || mediaReleased) return false;
        const generation = ++fadeGeneration;
        clearFadeBackup();
        const outgoing = active;
        const incoming = idle;
        if (playlistMode && !nextPlaylistMode) notePlaylistTime();
        fading = true;
        incoming.webmSource.src = track.webm;
        incoming.mp3Source.src = track.mp3;
        incoming.audio.volume = 0;
        if (seekTo > 0) {
            const apply = (): void => {
                incoming.audio.removeEventListener("loadedmetadata", apply);
                if (generation !== fadeGeneration) return;
                assignTime(incoming.audio, seekTo);
            };
            incoming.audio.addEventListener("loadedmetadata", apply);
        }
        incoming.audio.load();

        let started: Promise<void>;
        try {
            started = incoming.audio.play();
        } catch {
            if (generation === fadeGeneration) fading = false;
            return false;
        }
        void started.then(
            () => {
                if (generation !== fadeGeneration || !fading || destroyed) return;
                mix(generation, outgoing, incoming, performance.now(), track, nextPlaylistMode, nextIndex);
            },
            () => {
                if (generation !== fadeGeneration) return;
                fading = false;
                // The partner element never started. Cut, or the song that was supposed to arrive never does.
                void loadTrack(track, nextPlaylistMode, true);
            },
        );
        return true;
    };

    const loadTrack = (
        track: ThemeTrack,
        nextPlaylistMode: boolean,
        autoplay = playbackHasStarted || currentAttempt !== null,
    ): Promise<boolean> => {
        if (playlistMode && !nextPlaylistMode) notePlaylistTime();
        // Coming back from the match seeks the menu song to where it was, not to its first bar.
        // The next time the match starts, it starts from the beginning; only a reload continues mid-song.
        if (nextPlaylistMode) pendingMatchTime = 0;
        if (nextPlaylistMode && menuTime > 0) pendingTime = menuTime;
        const shouldAutoplay = autoplay;
        currentTrack = track;
        playlistMode = nextPlaylistMode;
        restoreCurrentTrack();

        if (!shouldAutoplay) {
            active.audio.volume = 0;
            return Promise.resolve(false);
        }
        return startPlayback(getTargetVolume(), true, false);
    };

    const switchTo = (track: ThemeTrack, nextPlaylistMode: boolean, autoplay?: boolean): Promise<boolean> => {
        const shouldAutoplay = autoplay ?? (playbackHasStarted || currentAttempt !== null);
        const nextIndex = nextPlaylistMode ? trackIndex : trackIndex;
        const seekTo = nextPlaylistMode ? menuTime : 0;
        const canMix =
            shouldAutoplay &&
            playbackHasStarted &&
            !active.audio.paused &&
            !sameTrack(currentTrack, track) &&
            beginOverlap(track, nextPlaylistMode, nextIndex, seekTo);
        if (canMix) return Promise.resolve(true);
        return loadTrack(track, nextPlaylistMode, autoplay);
    };

    const advance = (): Promise<boolean> => {
        trackIndex = (trackIndex + 1) % playlist.length;
        menuTime = 0;
        pendingTime = 0;
        return loadTrack(playlist[trackIndex], true, true);
    };

    const playMatchPlaylist = (tracks: readonly ThemeTrack[], autoplay?: boolean): Promise<boolean> => {
        if (!tracks.length) throw new Error("Match music playlist must contain at least one track");
        matchTracks = [...tracks];
        const shouldAutoplay = autoplay ?? (playbackHasStarted || currentAttempt !== null);
        if (!playlistMode && matchTracks.some((track) => sameTrack(currentTrack, track))) {
            // Phase handoffs must keep the current match song, including the second song, at its saved bar.
            if (mediaReleased) return loadTrack(currentTrack, false, autoplay);
            if (currentAttempt) return currentAttempt;
            if (!shouldAutoplay) return Promise.resolve(playbackHasStarted && !active.audio.paused);
            if (!active.audio.paused && playbackHasStarted) return Promise.resolve(true);
            return startPlayback(getTargetVolume(), true, true);
        }
        return switchTo(matchTracks[0], false, autoplay);
    };

    const playSingle = (track: ThemeTrack, autoplay?: boolean): Promise<boolean> =>
        playMatchPlaylist([track], autoplay);

    const nextMatchTrack = (): ThemeTrack => {
        const index = matchTracks.findIndex((track) => sameTrack(track, currentTrack));
        return matchTracks[(index + 1) % matchTracks.length] ?? currentTrack;
    };

    const resumePlaylist = (autoplay?: boolean): Promise<boolean> => {
        if (playlistResume) return playlistResume;
        const track = playlist[trackIndex];
        if (
            playlistMode &&
            !mediaReleased &&
            !fading &&
            sameTrack(currentTrack, track) &&
            playbackHasStarted &&
            !active.audio.paused
        ) {
            return Promise.resolve(true);
        }
        const run = switchTo(track, true, autoplay).finally(() => {
            if (playlistResume === run) playlistResume = null;
        });
        playlistResume = run;
        return run;
    };

    const releaseChannel = (channel: ThemeChannel): void => {
        channel.audio.volume = 0;
        channel.audio.pause();
        clearSource(channel.webmSource);
        clearSource(channel.mp3Source);
        channel.audio.load();
    };

    const releaseMedia = (): void => {
        if (destroyed || mediaReleased) {
            return;
        }

        // pause() alone leaves the encoded response and often its decoded media buffers resident. Detaching
        // both sources and reloading the element gives the browser permission to reclaim them during fights.
        if (playlistMode) notePlaylistTime();
        else if (clock(active.audio) > 0) pendingMatchTime = clock(active.audio);
        fading = false;
        clearFadeBackup();
        ++attemptGeneration;
        currentAttempt = null;
        // Set before load(), so the match seek listener does not consume the saved bar on the empty element.
        mediaReleased = true;
        releaseChannel(active);
        if (idle) releaseChannel(idle);
    };

    const beginCrossfade = (): void => {
        if (!crossfade || !idle || fading || desiredTargetVolume === 0 || mediaReleased || active.audio.paused) return;
        const remaining = (active.audio.duration ?? Number.NaN) - clock(active.audio);
        if (!Number.isFinite(remaining) || remaining <= 0 || remaining > crossfade.ms / 1000) return;
        if (playlistMode) {
            const nextIndex = (trackIndex + 1) % playlist.length;
            beginOverlap(playlist[nextIndex], true, nextIndex, 0);
            return;
        }
        beginOverlap(nextMatchTrack(), false, trackIndex, 0);
    };

    const onTime: EventListener = () => {
        report();
        beginCrossfade();
    };
    const onEnded: EventListener = () => {
        // The overlap already started the next song. Letting ended advance as well would skip it.
        if (fading) return;
        if (playlistMode) {
            void advance();
        } else {
            void loadTrack(nextMatchTrack(), false, true);
        }
    };
    const bind = (element: ThemeAudio): void => {
        element.addEventListener("ended", onEnded);
        if (onProgress || crossfade) element.addEventListener("timeupdate", onTime);
    };
    const unbind = (element: ThemeAudio): void => {
        element.removeEventListener("ended", onEnded);
        element.removeEventListener("timeupdate", onTime);
    };
    bind(active.audio);

    return {
        start: (targetVolume, forceRetry) => startPlayback(targetVolume, forceRetry, true),
        setTargetVolume,
        releaseMedia,
        advance,
        playSingle,
        playMatchPlaylist,
        resumePlaylist,
        hasStarted: () => playbackHasStarted,
        currentIndex: () => trackIndex,
        isPlaylist: () => playlistMode,
        playbackMemory,
        destroy: () => {
            fading = false;
            clearFadeBackup();
            releaseMedia();
            destroyed = true;
            ++attemptGeneration;
            currentAttempt = null;
            unbind(active.audio);
            if (idle) unbind(idle.audio);
        },
    };
};
