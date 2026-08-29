/*
 * -----------------------------------------------------------------------------
 * This file is part of the game core of the Heroes of Crypto.
 *
 * Heroes of Crypto and Heroes of Crypto AI are registered trademarks.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 * -----------------------------------------------------------------------------
 */

/**
 * The two audio levels a player sets, each with its own mute: the MUSIC (the menu playlist and the
 * pre-fight track) and the EFFECTS (everything else that makes a noise — today the wager chips).
 *
 * They used to be one setting: the sound effects read the music's volume and mute, so turning the theme
 * down turned the clacks down with it and there was no way to keep one without the other. This module is
 * the single place both now live, so the corner medallion, the settings panel and any future noise all
 * agree on one value rather than each reading storage on its own.
 *
 * A tiny external store rather than context: the medallion lives ABOVE the router in ThemeMusic while the
 * settings panel is mounted deep inside the arena, and the sound effects are fired from plain functions
 * with no React around them at all. `subscribeAudioLevels` + `getAudioLevels` feed useSyncExternalStore.
 *
 * The MUSIC keys are the pre-existing ones and must stay as they are: the site (a different origin, with
 * its own copy of the player in site/src/components/ThemeMusic.astro) hands the setting over in the query
 * string, and the redirect pages under /play match these names.
 */
const MUSIC_VOLUME_KEY = "hoc:themeVolume";
const MUSIC_MUTED_KEY = "hoc:themeMuted";
const EFFECTS_VOLUME_KEY = "hoc:effectsVolume";
const EFFECTS_MUTED_KEY = "hoc:effectsMuted";

export const DEFAULT_MUSIC_VOLUME = 0.5; // "medium"
export const DEFAULT_EFFECTS_VOLUME = 0.5;

export interface IAudioLevels {
    musicVolume: number;
    musicMuted: boolean;
    effectsVolume: number;
    effectsMuted: boolean;
}

export const DEFAULT_AUDIO_LEVELS: IAudioLevels = Object.freeze({
    musicVolume: DEFAULT_MUSIC_VOLUME,
    musicMuted: false,
    effectsVolume: DEFAULT_EFFECTS_VOLUME,
    effectsMuted: false,
});

/** The raw values the browser holds: four stored strings and the query string, all possibly absent. */
export interface IStoredAudioLevels {
    musicVolume: string | null;
    musicMuted: string | null;
    effectsVolume: string | null;
    effectsMuted: string | null;
    /** window.location.search — how the site hands the music setting across the origin boundary. */
    search: string;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const storedVolume = (raw: string | null, fallback: number): number =>
    raw !== null && raw.trim() !== "" && Number.isFinite(Number(raw)) ? clamp01(Number(raw)) : fallback;

/**
 * The levels to open with. Pure, so the interesting cases — a value handed over in the URL, a player who
 * had the game muted before the effects had a level of their own — are testable without a browser.
 *
 * Order for the music: the URL wins over storage, because arriving with `?vol` means the player just set
 * it next door on the site. Storage wins over the default.
 */
export const resolveAudioLevels = (stored: IStoredAudioLevels): IAudioLevels => {
    let musicVolume = storedVolume(stored.musicVolume, DEFAULT_MUSIC_VOLUME);
    let musicMuted = stored.musicMuted === "1";

    try {
        const params = new URLSearchParams(stored.search);
        const fromUrl = params.get("vol");
        if (fromUrl !== null && fromUrl.trim() !== "" && Number.isFinite(Number(fromUrl))) {
            musicVolume = clamp01(Number(fromUrl));
            musicMuted = params.get("muted") === "1";
        }
    } catch {
        // Malformed query string — keep whatever was stored.
    }

    // Before the split the effects rode the music setting, so a player who had muted the game heard
    // nothing at all. With no effects level ever stored, inherit the music's: the split must not be the
    // reason a muted game suddenly starts clacking. Once they touch either slider the two go separate ways.
    const inherited = stored.effectsVolume === null && stored.effectsMuted === null;

    return {
        musicVolume,
        musicMuted,
        effectsVolume: inherited ? musicVolume : storedVolume(stored.effectsVolume, DEFAULT_EFFECTS_VOLUME),
        effectsMuted: inherited ? musicMuted : stored.effectsMuted === "1",
    };
};

let levels: IAudioLevels | null = null;
const listeners = new Set<() => void>();

const readStored = (key: string): string | null => {
    try {
        return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
        // Private mode / storage disabled: the defaults still give the player sound.
        return null;
    }
};

const persist = (next: IAudioLevels): void => {
    try {
        const storage = globalThis.localStorage;
        if (!storage) {
            return;
        }
        storage.setItem(MUSIC_VOLUME_KEY, String(next.musicVolume));
        storage.setItem(MUSIC_MUTED_KEY, next.musicMuted ? "1" : "0");
        storage.setItem(EFFECTS_VOLUME_KEY, String(next.effectsVolume));
        storage.setItem(EFFECTS_MUTED_KEY, next.effectsMuted ? "1" : "0");
    } catch {
        // The choice just will not outlive the session.
    }
};

/**
 * Read once, lazily — there is no storage to read during a server render, and the first read happens well
 * after boot, so `?vol` is on the location by then. The resolved levels are written straight back: that is
 * what captures a value handed over in the URL, which is otherwise gone on the next reload.
 */
const current = (): IAudioLevels => {
    if (!levels) {
        levels = resolveAudioLevels({
            musicVolume: readStored(MUSIC_VOLUME_KEY),
            musicMuted: readStored(MUSIC_MUTED_KEY),
            effectsVolume: readStored(EFFECTS_VOLUME_KEY),
            effectsMuted: readStored(EFFECTS_MUTED_KEY),
            search: globalThis.location?.search ?? "",
        });
        persist(levels);
    }
    return levels;
};

/** Stable across reads until something actually changes — useSyncExternalStore requires that. */
export const getAudioLevels = (): IAudioLevels => current();

/** Server-side / first-pass snapshot: nothing has been read yet, so everyone starts at the defaults. */
export const getAudioLevelsServerSnapshot = (): IAudioLevels => DEFAULT_AUDIO_LEVELS;

export const subscribeAudioLevels = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

const update = (change: Partial<IAudioLevels>): void => {
    const previous = current();
    const next = { ...previous, ...change };
    if (
        next.musicVolume === previous.musicVolume &&
        next.musicMuted === previous.musicMuted &&
        next.effectsVolume === previous.effectsVolume &&
        next.effectsMuted === previous.effectsMuted
    ) {
        return;
    }
    levels = next;
    persist(next);
    for (const listener of listeners) {
        listener();
    }
};

export const setMusicVolume = (volume: number): void => update({ musicVolume: clamp01(volume) });
export const setMusicMuted = (muted: boolean): void => update({ musicMuted: muted });
export const setEffectsVolume = (volume: number): void => update({ effectsVolume: clamp01(volume) });
export const setEffectsMuted = (muted: boolean): void => update({ effectsMuted: muted });

/** What the music should be playing at, ignoring where the player happens to be standing. */
export const musicGain = (): number => {
    const now = current();
    return now.musicMuted ? 0 : now.musicVolume;
};

/** What a sound effect should be played at. Deliberately blind to the music: that is the whole point. */
export const effectsGain = (): number => {
    const now = current();
    return now.effectsMuted ? 0 : now.effectsVolume;
};
