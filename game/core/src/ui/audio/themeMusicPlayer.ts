export interface ThemeTrack {
    webm: string;
    mp3: string;
}

interface ThemeAudio {
    volume: number;
    readonly paused: boolean;
    play(): Promise<void>;
    pause(): void;
    load(): void;
    addEventListener(type: "ended", listener: EventListener): void;
    removeEventListener(type: "ended", listener: EventListener): void;
}

interface ThemeSource {
    src: string;
    removeAttribute?(qualifiedName: string): void;
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
}

export interface ThemeMusicPlayer {
    start(targetVolume?: number, forceRetry?: boolean): Promise<boolean>;
    setTargetVolume(targetVolume: number): void;
    releaseMedia(): void;
    advance(): Promise<boolean>;
    playSingle(track: ThemeTrack, autoplay?: boolean): Promise<boolean>;
    resumePlaylist(autoplay?: boolean): Promise<boolean>;
    hasStarted(): boolean;
    destroy(): void;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

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
}: ThemeMusicPlayerOptions): ThemeMusicPlayer => {
    if (!playlist.length) {
        throw new Error("Theme music playlist must contain at least one track");
    }

    let trackIndex = 0;
    let currentTrack: ThemeTrack = playlist[0];
    let playlistMode = true;
    let playbackHasStarted = false;
    let desiredTargetVolume = clamp01(getTargetVolume());
    let attemptGeneration = 0;
    let currentAttempt: Promise<boolean> | null = null;
    let mediaReleased = false;
    let destroyed = false;

    const clearSource = (source: ThemeSource): void => {
        if (source.removeAttribute) {
            source.removeAttribute("src");
        } else {
            source.src = "";
        }
    };

    const restoreCurrentTrack = (): void => {
        webmSource.src = currentTrack.webm;
        mp3Source.src = currentTrack.mp3;
        mediaReleased = false;

        // Reloading sources aborts any older play promise, including one that may settle on the next tick.
        ++attemptGeneration;
        currentAttempt = null;
        audio.load();
    };

    const setTargetVolume = (targetVolume: number): void => {
        desiredTargetVolume = clamp01(targetVolume);
    };

    const applyStartedVolume = (fadeIn: boolean): void => {
        if (fadeIn) {
            fadeTo(desiredTargetVolume);
        } else {
            // Track-to-track hand-offs should be immediate and must not depend on requestAnimationFrame,
            // which mobile browsers can throttle after a page has been open for several minutes.
            audio.volume = desiredTargetVolume;
        }
    };

    const startPlayback = (targetVolume = getTargetVolume(), forceRetry = false, fadeIn = true): Promise<boolean> => {
        setTargetVolume(targetVolume);

        if (desiredTargetVolume === 0 || destroyed) {
            audio.volume = 0;
            return Promise.resolve(false);
        }

        if (mediaReleased) {
            restoreCurrentTrack();
        }

        if (currentAttempt && !forceRetry) {
            return currentAttempt;
        }

        // Some browsers flip paused=false while play() is still pending. A genuine user gesture must be
        // able to supersede that attempt instead of being mistaken for proof that playback already began.
        if (!currentAttempt && !audio.paused) {
            playbackHasStarted = true;
            onPlaybackStarted();
            applyStartedVolume(fadeIn);
            return Promise.resolve(true);
        }

        const generation = ++attemptGeneration;
        audio.volume = fadeIn ? 0 : desiredTargetVolume;

        let nativeAttempt: Promise<void>;
        try {
            nativeAttempt = audio.play();
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
                    return !audio.paused;
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

    const loadTrack = (
        track: ThemeTrack,
        nextPlaylistMode: boolean,
        autoplay = playbackHasStarted || currentAttempt !== null,
    ): Promise<boolean> => {
        const shouldAutoplay = autoplay;
        currentTrack = track;
        playlistMode = nextPlaylistMode;
        restoreCurrentTrack();

        if (!shouldAutoplay) {
            audio.volume = 0;
            return Promise.resolve(false);
        }
        return startPlayback(getTargetVolume(), true, false);
    };

    const advance = (): Promise<boolean> => {
        trackIndex = (trackIndex + 1) % playlist.length;
        return loadTrack(playlist[trackIndex], true, true);
    };

    const playSingle = (track: ThemeTrack, autoplay?: boolean): Promise<boolean> => loadTrack(track, false, autoplay);

    const resumePlaylist = (autoplay?: boolean): Promise<boolean> => loadTrack(playlist[trackIndex], true, autoplay);

    const releaseMedia = (): void => {
        if (destroyed || mediaReleased) {
            return;
        }

        // pause() alone leaves the encoded response and often its decoded media buffers resident. Detaching
        // both sources and reloading the element gives the browser permission to reclaim them during fights.
        ++attemptGeneration;
        currentAttempt = null;
        audio.volume = 0;
        audio.pause();
        clearSource(webmSource);
        clearSource(mp3Source);
        mediaReleased = true;
        audio.load();
    };

    const onEnded: EventListener = () => {
        if (playlistMode) {
            void advance();
        } else {
            // The pre-fight selection is a one-track mode, so its natural end loops that same source.
            void loadTrack(currentTrack, false, true);
        }
    };
    audio.addEventListener("ended", onEnded);

    return {
        start: (targetVolume, forceRetry) => startPlayback(targetVolume, forceRetry, true),
        setTargetVolume,
        releaseMedia,
        advance,
        playSingle,
        resumePlaylist,
        hasStarted: () => playbackHasStarted,
        destroy: () => {
            releaseMedia();
            destroyed = true;
            ++attemptGeneration;
            currentAttempt = null;
            audio.removeEventListener("ended", onEnded);
        },
    };
};
