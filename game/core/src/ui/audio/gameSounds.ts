import { playEffectSound, preloadEffectSounds, type ICombatSoundSource } from "./combatSounds";
import manifest from "./gameSoundManifest.json";

export type GameSoundName = keyof typeof manifest;

export const resolveGameSound = (name: GameSoundName): ICombatSoundSource => {
    const sound = manifest[name];
    const base = `/audio/events/${name}`;
    return {
        key: `${base}:${sound.revision}`,
        webm: `${base}.webm?v=${sound.revision}`,
        mp3: `${base}.mp3?v=${sound.revision}`,
        durationMs: sound.durationMs,
    };
};

export const preloadGameSounds = (): void => {
    preloadEffectSounds((Object.keys(manifest) as GameSoundName[]).map(resolveGameSound));
};

/** One heal/resurrection per simultaneous group, preserving later independent events. */
export const playGameSound = (name: GameSoundName, alive?: () => boolean, identity: string = name): void => {
    playEffectSound(resolveGameSound(name), `game:${identity}`, alive);
};
