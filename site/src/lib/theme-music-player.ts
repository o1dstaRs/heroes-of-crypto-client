export interface ThemeTrack {
    webm: string;
    mp3: string;
}

interface ThemeAudio {
    volume: number;
    readonly paused: boolean;
    play(): Promise<void>;
    load(): void;
    addEventListener(type: "ended", listener: EventListener): void;
    removeEventListener(type: "ended", listener: EventListener): void;
}

interface ThemeSource {
    src: string;
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
    advance(): Promise<boolean>;
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
    let desiredTargetVolume = clamp01(getTargetVolume());
    let attemptGeneration = 0;
    let currentAttempt: Promise<boolean> | null = null;

    const setTargetVolume = (targetVolume: number): void => {
        desiredTargetVolume = clamp01(targetVolume);
    };

    const startPlayback = (targetVolume = getTargetVolume(), forceRetry = false, fadeIn = true): Promise<boolean> => {
        setTargetVolume(targetVolume);

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
        if (!currentAttempt && !audio.paused) {
            onPlaybackStarted();
            if (fadeIn) {
                fadeTo(desiredTargetVolume);
            } else {
                audio.volume = desiredTargetVolume;
            }
            return Promise.resolve(true);
        }

        const generation = ++attemptGeneration;
        audio.volume = fadeIn ? 0 : desiredTargetVolume;

        let nativeAttempt: Promise<void>;
        try {
            nativeAttempt = audio.play();
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
                    return !audio.paused;
                }
                currentAttempt = null;
                onPlaybackStarted();
                if (fadeIn) {
                    fadeTo(desiredTargetVolume);
                } else {
                    // Playlist hand-offs are immediate. This also avoids leaving a new track silent when
                    // mobile browsers throttle requestAnimationFrame after the page has sat open awhile.
                    audio.volume = desiredTargetVolume;
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
        webmSource.src = playlist[trackIndex].webm;
        mp3Source.src = playlist[trackIndex].mp3;

        ++attemptGeneration;
        currentAttempt = null;
        audio.load();
        return startPlayback(getTargetVolume(), true, false);
    };

    const onEnded: EventListener = () => {
        void advance();
    };
    audio.addEventListener("ended", onEnded);

    return {
        start: (targetVolume, forceRetry) => startPlayback(targetVolume, forceRetry, true),
        setTargetVolume,
        advance,
        destroy: () => audio.removeEventListener("ended", onEnded),
    };
};
