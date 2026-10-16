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
    DEFAULT_MASTER_VOLUME,
    DEFAULT_MUSIC_VOLUME,
    effectsGain,
    getAudioLevels,
    musicGain,
    resolveAudioLevels,
    setEffectsMuted,
    setEffectsVolume,
    setMasterMuted,
    setMasterVolume,
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
    test("a fresh browser opens at the quiet music default, unmuted, effects inheriting it", () => {
        // With no effects level ever stored the effects ride the music setting (the split must not
        // un-mute a muted game), so a fresh browser opens BOTH at the music default.
        expect(resolve()).toEqual({
            masterVolume: DEFAULT_MASTER_VOLUME,
            masterMuted: false,
            musicVolume: DEFAULT_MUSIC_VOLUME,
            musicMuted: false,
            effectsVolume: DEFAULT_MUSIC_VOLUME,
            effectsMuted: false,
        });
    });

    test("reads each level back independently", () => {
        expect(resolve({ musicVolume: "0.2", musicMuted: "1", effectsVolume: "0.9", effectsMuted: "0" })).toEqual({
            masterVolume: DEFAULT_MASTER_VOLUME,
            masterMuted: false,
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

    test("restores shared sound settings without replacing channel levels or URL music handoff", () => {
        const levels = resolve({
            masterVolume: "0.35",
            masterMuted: "1",
            musicVolume: "0.2",
            effectsVolume: "0.8",
            effectsMuted: "0",
            search: "?vol=0.4&muted=0",
        });
        expect(levels).toMatchObject({ masterVolume: 0.35, masterMuted: true, musicVolume: 0.4, effectsVolume: 0.8 });
        expect(musicGain(levels)).toBe(0);
        expect(effectsGain(levels)).toBe(0);
        expect(resolve({ masterVolume: "bad" }).masterVolume).toBe(DEFAULT_MASTER_VOLUME);
        expect(resolve({ masterVolume: "-1" }).masterVolume).toBe(0);
        expect(resolve({ masterVolume: "2" }).masterVolume).toBe(1);
    });
});

describe("the live audio-levels store", () => {
    beforeEach(() => {
        setMasterVolume(DEFAULT_MASTER_VOLUME);
        setMasterMuted(false);
        setMusicVolume(DEFAULT_MUSIC_VOLUME);
        setMusicMuted(false);
        setEffectsVolume(DEFAULT_EFFECTS_VOLUME);
        setEffectsMuted(false);
    });

    test("the sound bar scales both music and effects while preserving their balance", () => {
        setMusicVolume(0.3);
        setEffectsVolume(0.8);
        setMasterVolume(0.5);
        expect(musicGain()).toBeCloseTo(0.15);
        expect(effectsGain()).toBeCloseTo(0.4);
        expect(getAudioLevels()).toMatchObject({ musicVolume: 0.3, effectsVolume: 0.8 });
        setMasterVolume(0);
        expect(musicGain()).toBe(0);
        expect(effectsGain()).toBe(0);
    });

    test("master mute restores effects and keeps music disabled after unmuting", () => {
        setMasterVolume(0.6);
        setMusicMuted(true);
        expect(effectsGain()).toBeCloseTo(DEFAULT_EFFECTS_VOLUME * 0.6);
        setMasterMuted(true);
        expect(musicGain()).toBe(0);
        expect(effectsGain()).toBe(0);
        setMasterMuted(false);
        expect(musicGain()).toBe(0);
        expect(effectsGain()).toBeCloseTo(DEFAULT_EFFECTS_VOLUME * 0.6);
        expect(getAudioLevels().musicMuted).toBe(true);
        setMusicMuted(false);
        expect(musicGain()).toBeCloseTo(DEFAULT_MUSIC_VOLUME * 0.6);
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
        setMasterVolume(-1);
        expect(getAudioLevels().masterVolume).toBe(0);
        setMasterVolume(4);
        expect(getAudioLevels().masterVolume).toBe(1);
        setMusicVolume(4);
        setEffectsVolume(-1);
        expect(getAudioLevels().musicVolume).toBe(1);
        expect(getAudioLevels().effectsVolume).toBe(0);
    });

    test("persists every level so the choice outlives the session", () => {
        setMasterVolume(0.4);
        setMasterMuted(true);
        setMusicVolume(0.25);
        setMusicMuted(true);
        setEffectsVolume(0.75);
        setEffectsMuted(false);
        expect(store.get("hoc:themeVolume")).toBe("0.25");
        expect(store.get("hoc:themeMuted")).toBe("1");
        expect(store.get("hoc:effectsVolume")).toBe("0.75");
        expect(store.get("hoc:effectsMuted")).toBe("0");
        expect(store.get("hoc:soundVolume")).toBe("0.4");
        expect(store.get("hoc:soundMuted")).toBe("1");
    });

    test("notifies subscribers on a real change only — the snapshot is stable otherwise", () => {
        let notifications = 0;
        const unsubscribe = subscribeAudioLevels(() => {
            notifications += 1;
        });
        const before = getAudioLevels();

        setMusicVolume(DEFAULT_MUSIC_VOLUME);
        setMasterVolume(DEFAULT_MASTER_VOLUME);
        setMasterMuted(false);
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
