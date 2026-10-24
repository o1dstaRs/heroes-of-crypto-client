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
    pause?(): void;
    load(): void;
    addEventListener(type: string, listener: EventListener): void;
    removeEventListener(type: string, listener: EventListener): void;
}

interface ThemeSource {
    src: string;
}

export interface ThemePlaybackSnapshot {
    index: number;
    time: number;
}

interface ThemeChannel {
    audio: ThemeAudio;
    webmSource: ThemeSource;
    mp3Source: ThemeSource;
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
    /** Restores the song that was playing before a reload. Out-of-range values start at the theme. */
    initialIndex?: number;
    /** Seconds into that song. Zero starts at the beginning. */
    initialTime?: number;
    onProgress?: (snapshot: ThemePlaybackSnapshot) => void;
    /** The element the volume control should follow after a crossfade hands playback over. */
    onOutputChange?: (audio: ThemeAudio) => void;
    /**
     * Overlap into the next song on a second element. Omitted, the hand-off stays immediate — a reload
     * of one element cannot mix two songs, and the older call sites still depend on that cut.
     */
    crossfade?: { ms: number } & ThemeChannel;
}

export interface ThemeMusicPlayer {
    start(targetVolume?: number, forceRetry?: boolean): Promise<boolean>;
    setTargetVolume(targetVolume: number): void;
    advance(): Promise<boolean>;
    snapshot(): ThemePlaybackSnapshot;
    destroy(): void;
}

export interface ThemeMusicSettings {
    volume: number;
    muted: boolean;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * Clicking the speaker while it is silent always means "make it audible". This also covers the subtle
 * volume-zero case where `muted` may still be false: toggling that raw boolean would otherwise require two
 * clicks before any sound could be heard.
 */
export const toggleThemeMusicSettings = (settings: ThemeMusicSettings, defaultVolume: number): ThemeMusicSettings => {
    const silent = settings.muted || settings.volume === 0;
    if (silent) {
        return {
            volume: settings.volume === 0 ? clamp01(defaultVolume) : settings.volume,
            muted: false,
        };
    }
    return { ...settings, muted: true };
};

/**
 * Owns the native media playback lifecycle while the Astro component owns UI and persistence. In
 * particular, a rejected autoplay attempt stays retryable and an `ended` event reloads and starts the next
 * source instead of silently leaving the player paused.
 */
const trackIndexInRange = (index: number | undefined, length: number): number =>
    Number.isInteger(index) && index !== undefined && index >= 0 && index < length ? index : 0;

const scheduleFrame = (callback: (now: number) => void): void => {
    if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(callback);
        return;
    }
    setTimeout(() => callback(performance.now()), 16);
};

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
    onProgress,
    onOutputChange,
    crossfade,
}: ThemeMusicPlayerOptions): ThemeMusicPlayer => {
    if (!playlist.length) {
        throw new Error("Theme music playlist must contain at least one track");
    }

    let trackIndex = trackIndexInRange(initialIndex, playlist.length);
    let pendingTime = initialTime !== undefined && Number.isFinite(initialTime) && initialTime > 0 ? initialTime : 0;
    let seekArmed = false;
    let fading = false;
    let desiredTargetVolume = clamp01(getTargetVolume());
    let attemptGeneration = 0;
    let currentAttempt: Promise<boolean> | null = null;
    // Reassigned when a crossfade finishes, so later playback and the volume slider follow the element
    // that is actually audible.
    let active: ThemeChannel = { audio, webmSource, mp3Source };
    let idle: ThemeChannel | null = crossfade
        ? { audio: crossfade.audio, webmSource: crossfade.webmSource, mp3Source: crossfade.mp3Source }
        : null;

    const assign = (channel: ThemeChannel, index: number): void => {
        channel.webmSource.src = playlist[index].webm;
        channel.mp3Source.src = playlist[index].mp3;
    };

    const snapshot = (): ThemePlaybackSnapshot => ({
        index: trackIndex,
        time: Number.isFinite(active.audio.currentTime) ? (active.audio.currentTime ?? 0) : 0,
    });

    const report = (): void => {
        onProgress?.(snapshot());
    };

    const armSeek = (element: ThemeAudio): void => {
        if (seekArmed || !(pendingTime > 0)) return;
        seekArmed = true;
        const apply = (): void => {
            if (element !== active.audio) return;
            const duration = element.duration ?? Number.NaN;
            const target = pendingTime;
            element.currentTime =
                Number.isFinite(duration) && duration > 1 ? Math.min(target, duration - 0.25) : target;
            pendingTime = 0;
            seekArmed = false;
            element.removeEventListener("loadedmetadata", apply);
            report();
        };
        element.addEventListener("loadedmetadata", apply);
    };

    if (trackIndex !== 0 || pendingTime > 0) {
        assign(active, trackIndex);
        armSeek(active.audio);
        active.audio.load();
    }

    const setTargetVolume = (targetVolume: number): void => {
        desiredTargetVolume = clamp01(targetVolume);
        if (desiredTargetVolume !== 0 || !idle) return;
        fading = false;
        idle.audio.pause?.();
        idle.audio.volume = 0;
    };

    const startPlayback = (targetVolume = getTargetVolume(), forceRetry = false, fadeIn = true): Promise<boolean> => {
        setTargetVolume(targetVolume);
        const media = active.audio;

        if (desiredTargetVolume === 0) {
            fadeTo(0);
            return Promise.resolve(false);
        }

        if (currentAttempt && !forceRetry) {
            return currentAttempt;
        }

        // Some browsers flip `paused` to false as soon as play() is requested, even while that promise is
        // still pending and no audio is audible. A user gesture must be allowed to retry that pending
        // attempt; treating `paused === false` as success here would consume the unlock gesture.
        if (!currentAttempt && !media.paused) {
            onPlaybackStarted();
            armSeek(media);
            if (fadeIn) {
                fadeTo(desiredTargetVolume);
            } else {
                media.volume = desiredTargetVolume;
            }
            return Promise.resolve(true);
        }

        const generation = ++attemptGeneration;
        media.volume = fadeIn ? 0 : desiredTargetVolume;
        armSeek(media);

        let nativeAttempt: Promise<void>;
        try {
            nativeAttempt = media.play();
        } catch {
            if (generation === attemptGeneration) {
                currentAttempt = null;
                onPlaybackBlocked();
            }
            return Promise.resolve(false);
        }

        const attempt = nativeAttempt.then(
            () => {
                if (generation !== attemptGeneration) {
                    return !media.paused;
                }
                currentAttempt = null;
                onPlaybackStarted();
                if (fadeIn) {
                    fadeTo(desiredTargetVolume);
                } else {
                    // Playlist hand-offs are immediate. This also avoids leaving a new track silent when
                    // mobile browsers throttle requestAnimationFrame after the page has sat open awhile.
                    media.volume = desiredTargetVolume;
                }
                return true;
            },
            () => {
                if (generation === attemptGeneration) {
                    currentAttempt = null;
                    onPlaybackBlocked();
                }
                return false;
            },
        );
        currentAttempt = attempt;
        return attempt;
    };

    const advance = (): Promise<boolean> => {
        trackIndex = (trackIndex + 1) % playlist.length;
        assign(active, trackIndex);

        ++attemptGeneration;
        currentAttempt = null;
        active.audio.load();
        return startPlayback(getTargetVolume(), true, false);
    };

    const beginCrossfade = (): void => {
        if (!crossfade || !idle || fading || desiredTargetVolume === 0) return;
        const remaining = (active.audio.duration ?? Number.NaN) - (active.audio.currentTime ?? 0);
        if (!Number.isFinite(remaining) || remaining <= 0 || remaining > crossfade.ms / 1000) return;

        fading = true;
        const nextIndex = (trackIndex + 1) % playlist.length;
        const outgoing = active;
        const incoming = idle;
        assign(incoming, nextIndex);
        incoming.audio.volume = 0;
        incoming.audio.load();

        let started: Promise<void>;
        try {
            started = incoming.audio.play();
        } catch {
            fading = false;
            return;
        }

        void started.then(
            () => {
                const from = outgoing.audio.volume;
                const begun = performance.now();
                const step = (now: number): void => {
                    if (!fading) return;
                    if (desiredTargetVolume === 0) {
                        fading = false;
                        incoming.audio.pause?.();
                        incoming.audio.volume = 0;
                        outgoing.audio.volume = 0;
                        return;
                    }
                    const t = Math.min(1, (now - begun) / crossfade.ms);
                    outgoing.audio.volume = from * (1 - t);
                    incoming.audio.volume = desiredTargetVolume * t;
                    if (t < 1) {
                        scheduleFrame(step);
                        return;
                    }
                    outgoing.audio.pause?.();
                    outgoing.audio.volume = 0;
                    unbind(outgoing.audio);
                    idle = outgoing;
                    active = incoming;
                    trackIndex = nextIndex;
                    fading = false;
                    bind(active.audio);
                    onOutputChange?.(active.audio);
                    report();
                };
                scheduleFrame(step);
            },
            () => {
                fading = false;
            },
        );
    };

    const onTime: EventListener = () => {
        report();
        beginCrossfade();
    };
    const onEnded: EventListener = () => {
        // The overlap already started the next song. Letting `ended` advance as well would skip it.
        if (fading) return;
        void advance();
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
        advance,
        snapshot,
        destroy: () => {
            fading = false;
            unbind(active.audio);
            if (idle) unbind(idle.audio);
        },
    };
};
