import { playEffectSound, preloadEffectSounds, type ICombatSoundSource } from "./combatSounds";
import manifest from "./spellSoundManifest.json";

const catalog: Readonly<Record<string, { slug: string; durationMs: number; revision: string }>> = manifest;

export const resolveSpellSound = (spellName: string): ICombatSoundSource | undefined => {
    if (!Object.hasOwn(catalog, spellName)) return undefined;
    const sound = catalog[spellName];
    const base = `/audio/spells/${sound.slug}`;
    return {
        key: `${base}:${sound.revision}`,
        webm: `${base}.webm?v=${sound.revision}`,
        mp3: `${base}.mp3?v=${sound.revision}`,
        durationMs: sound.durationMs,
    };
};

export const preloadSpellSounds = (): void => {
    preloadEffectSounds(Object.keys(catalog).map((name) => resolveSpellSound(name)!));
};

export const playSpellSound = (spellName: string, casterId: string, alive?: () => boolean): void => {
    const sound = resolveSpellSound(spellName);
    if (sound) playEffectSound(sound, `spell:${casterId}:${spellName}`, alive);
};
