import { beforeEach, describe, expect, test } from "bun:test";

/**
 * The store reads storage lazily, on first use — so the fake has to be in place before any import of the
 * module under test touches it. Assigning it here, at module scope, happens before the first test runs.
 */
const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
        store.set(key, value);
    },
    removeItem: (key: string) => {
        store.delete(key);
    },
};

const {
    DEFAULT_EFFECTS_VOLUME,
    DEFAULT_MUSIC_VOLUME,
    effectsGain,
    getAudioLevels,
    musicGain,
    resolveAudioLevels,
    setEffectsMuted,
    setEffectsVolume,
    setMusicMuted,
    setMusicVolume,
    subscribeAudioLevels,
} = await import("./audioLevels");

const resolve = (over: Partial<Parameters<typeof resolveAudioLevels>[0]> = {}) =>
    resolveAudioLevels({
        musicVolume: null,
        musicMuted: null,
        effectsVolume: null,
        effectsMuted: null,
        search: "",
        ...over,
    });

describe("resolving the stored audio levels", () => {
    test("a fresh browser opens at the medium default, unmuted", () => {
        expect(resolve()).toEqual({
            musicVolume: DEFAULT_MUSIC_VOLUME,
            musicMuted: false,
            effectsVolume: DEFAULT_EFFECTS_VOLUME,
            effectsMuted: false,
        });
    });

    test("reads each level back independently", () => {
        expect(resolve({ musicVolume: "0.2", musicMuted: "1", effectsVolume: "0.9", effectsMuted: "0" })).toEqual({
            musicVolume: 0.2,
            musicMuted: true,
            effectsVolume: 0.9,
            effectsMuted: false,
        });
    });

    test("clamps and ignores unusable stored values rather than playing at a nonsense level", () => {
        const levels = resolve({ musicVolume: "7", effectsVolume: "not a number", effectsMuted: "0" });
        expect(levels.musicVolume).toBe(1);
        expect(levels.effectsVolume).toBe(DEFAULT_EFFECTS_VOLUME);
        expect(resolve({ musicVolume: "-3", effectsMuted: "0" }).musicVolume).toBe(0);
    });

    // How the setting follows a player from heroesofcrypto.io into the client, which is a different origin
    // and cannot see the site's localStorage.
    test("a music level handed over in the URL wins over the stored one", () => {
        expect(resolve({ musicVolume: "0.8", musicMuted: "0", search: "?vol=0.4&muted=1" })).toMatchObject({
            musicVolume: 0.4,
            musicMuted: true,
        });
        // ...but it is only the music's. The effects are this origin's own setting.
        expect(resolve({ effectsVolume: "0.9", effectsMuted: "0", search: "?vol=0.4&muted=1" }).effectsVolume).toBe(
            0.9,
        );
    });

    test("keeps the stored music level when the URL carries no usable one", () => {
        expect(resolve({ musicVolume: "0.8", search: "?view=compact" }).musicVolume).toBe(0.8);
        expect(resolve({ musicVolume: "0.8", search: "?vol=loud" }).musicVolume).toBe(0.8);
    });

    // The split must not be the reason a player who had muted the game suddenly starts hearing chips.
    test("effects inherit the music setting until they have one of their own", () => {
        expect(resolve({ musicVolume: "0.3", musicMuted: "1" })).toMatchObject({
            effectsVolume: 0.3,
            effectsMuted: true,
        });
        // The moment either effects key exists, the two are separate settings.
        expect(resolve({ musicVolume: "0.3", musicMuted: "1", effectsMuted: "0" })).toMatchObject({
            effectsVolume: DEFAULT_EFFECTS_VOLUME,
            effectsMuted: false,
        });
    });
});

describe("the live audio-levels store", () => {
    beforeEach(() => {
        setMusicVolume(DEFAULT_MUSIC_VOLUME);
        setMusicMuted(false);
        setEffectsVolume(DEFAULT_EFFECTS_VOLUME);
        setEffectsMuted(false);
    });

    test("silencing the music leaves the sound effects alone, and the other way round", () => {
        setMusicMuted(true);
        expect(musicGain()).toBe(0);
        expect(effectsGain()).toBe(DEFAULT_EFFECTS_VOLUME);

        setMusicMuted(false);
        setEffectsVolume(0);
        expect(effectsGain()).toBe(0);
        expect(musicGain()).toBe(DEFAULT_MUSIC_VOLUME);

        setEffectsVolume(0.7);
        setEffectsMuted(true);
        expect(effectsGain()).toBe(0);
        // Unmuting restores the level rather than dropping the player back to the default.
        setEffectsMuted(false);
        expect(effectsGain()).toBe(0.7);
    });

    test("clamps whatever a caller hands it", () => {
        setMusicVolume(4);
        setEffectsVolume(-1);
        expect(getAudioLevels().musicVolume).toBe(1);
        expect(getAudioLevels().effectsVolume).toBe(0);
    });

    test("persists every level so the choice outlives the session", () => {
        setMusicVolume(0.25);
        setMusicMuted(true);
        setEffectsVolume(0.75);
        setEffectsMuted(false);
        expect(store.get("hoc:themeVolume")).toBe("0.25");
        expect(store.get("hoc:themeMuted")).toBe("1");
        expect(store.get("hoc:effectsVolume")).toBe("0.75");
        expect(store.get("hoc:effectsMuted")).toBe("0");
    });

    test("notifies subscribers on a real change only — the snapshot is stable otherwise", () => {
        let notifications = 0;
        const unsubscribe = subscribeAudioLevels(() => {
            notifications += 1;
        });
        const before = getAudioLevels();

        setMusicVolume(DEFAULT_MUSIC_VOLUME);
        expect(notifications).toBe(0);
        expect(getAudioLevels()).toBe(before);

        setMusicVolume(0.1);
        expect(notifications).toBe(1);
        expect(getAudioLevels()).not.toBe(before);

        unsubscribe();
        setMusicVolume(0.2);
        expect(notifications).toBe(1);
    });
});
