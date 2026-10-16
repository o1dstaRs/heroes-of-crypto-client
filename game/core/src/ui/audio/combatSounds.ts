import { effectsGain, subscribeAudioLevels } from "../../settings/audioLevels";
import manifest from "./combatSoundManifest.json";

export type CombatSoundRole = "attack" | "hurt";
export interface ICombatSoundSource {
    key: string;
    webm: string;
    mp3: string;
    durationMs: number;
}

interface ICombatSoundEntry {
    slug: string;
    attack: { durationMs: number; revision: string };
    hurt: { durationMs: number; revision: string };
}

const catalog: Readonly<Record<string, ICombatSoundEntry>> = manifest;

// A bow/cannon release would be misleading when a ranged creature fights in melee.
const MELEE_ATTACK_SOURCE: Readonly<Record<string, string>> = {
    Arbalester: "Squire",
    Dryad: "Fairy",
    Elf: "Squire",
    Monk: "Battle Mage",
    "Tsar Cannon": "Blacksmith",
    Centaur: "Pikeman",
    Beholder: "Hydra",
    Gargantuan: "Trent",
    Cyclops: "Troll",
    Medusa: "Hydra",
};

export const resolveCombatSound = (
    unitName: string,
    role: CombatSoundRole,
    melee = false,
): ICombatSoundSource | undefined => {
    const name = unitName.trim();
    const sourceName = role === "attack" && melee ? (MELEE_ATTACK_SOURCE[name] ?? name) : name;
    if (!Object.hasOwn(catalog, sourceName)) return undefined;
    const entry = catalog[sourceName];
    const sound = entry[role];
    const base = `/audio/combat/${entry.slug}_${role}`;
    return {
        key: `${base}:${sound.revision}`,
        webm: `${base}.webm?v=${sound.revision}`,
        mp3: `${base}.mp3?v=${sound.revision}`,
        durationMs: sound.durationMs,
    };
};

export interface ICombatSoundPlayerDeps {
    /** Loads and decodes once; a failed Opus decode must fall back to MP3. */
    load(source: ICombatSoundSource): Promise<unknown>;
    start(buffer: unknown): boolean | void;
    gain(): number;
    now(): number;
    available(): boolean;
}

/** No late sounds after slow downloads, muted settings, or a cancelled scene. */
export const createCombatSoundPlayer = (deps: ICombatSoundPlayerDeps) => {
    const buffers = new Map<string, Promise<unknown>>();
    const requests = new Map<string, number>();
    let epoch = 0;
    const load = (source: ICombatSoundSource): Promise<unknown> => {
        let pending = buffers.get(source.key);
        if (!pending) {
            pending = deps.load(source);
            buffers.set(source.key, pending);
            // A network/decode failure can recover on a subsequent fight.
            void pending.catch(() => buffers.delete(source.key));
        }
        return pending;
    };
    const preloadSources = (sources: Iterable<ICombatSoundSource>): void => {
        if (deps.gain() <= 0 || !deps.available()) return;
        for (const source of sources) void load(source).catch(() => undefined);
    };
    const playSource = async (
        source: ICombatSoundSource,
        identity: string,
        role: string,
        alive = () => true,
    ): Promise<boolean> => {
        if (deps.gain() <= 0 || !deps.available() || !alive()) return false;
        const at = deps.now();
        const startedEpoch = epoch;
        const request = `${identity}:${role}`;
        const previous = requests.get(request);
        // Visual recoil and floating damage can report the same contact in one frame.
        // Legitimate double strikes remain distinct (their contact times are > 60 ms apart).
        if (previous !== undefined && at - previous < 60) return false;
        requests.set(request, at);
        if (requests.size > 256) {
            for (const [key, value] of requests) if (at - value > 2000) requests.delete(key);
        }
        try {
            const buffer = await load(source);
            if (epoch !== startedEpoch || deps.now() - at > 150 || deps.gain() <= 0 || !deps.available() || !alive())
                return false;
            return deps.start(buffer) !== false;
        } catch {
            return false;
        }
    };
    return {
        preloadSources,
        playSource,
        stop(): void {
            epoch += 1;
            requests.clear();
        },
        preload(names: Iterable<string>): void {
            if (deps.gain() <= 0 || !deps.available()) return;
            for (const name of new Set(names)) {
                for (const role of ["attack", "hurt"] as const) {
                    for (const melee of role === "attack" ? [false, true] : [false]) {
                        const source = resolveCombatSound(name, role, melee);
                        if (source) void load(source).catch(() => undefined);
                    }
                }
            }
        },
        async play(
            name: string,
            role: CombatSoundRole,
            identity: string,
            melee = false,
            alive = () => true,
        ): Promise<boolean> {
            if (deps.gain() <= 0 || !deps.available() || !alive()) return false;
            const source = resolveCombatSound(name, role, melee);
            if (!source) return false;
            return playSource(source, identity, role, alive);
        },
    };
};

let context: AudioContext | undefined;
let bus: GainNode | undefined;
const voices = new Set<AudioBufferSourceNode>();

const unlock = (): boolean => {
    if (typeof window === "undefined" || typeof AudioContext === "undefined") return false;
    try {
        if (!context) {
            context = new AudioContext();
            bus = context.createGain();
            bus.gain.value = effectsGain();
            const compressor = context.createDynamicsCompressor();
            compressor.threshold.value = -8;
            compressor.knee.value = 6;
            compressor.ratio.value = 8;
            compressor.attack.value = 0.002;
            compressor.release.value = 0.08;
            bus.connect(compressor).connect(context.destination);
            subscribeAudioLevels(() => {
                if (context && bus) bus.gain.setTargetAtTime(effectsGain(), context.currentTime, 0.01);
                if (effectsGain() <= 0) stopCombatSounds();
            });
        }
        if (context.state === "suspended") void context.resume().catch(() => undefined);
        return context.state !== "closed";
    } catch {
        return false;
    }
};

const player = createCombatSoundPlayer({
    gain: effectsGain,
    now: () => performance.now(),
    available: unlock,
    async load(source) {
        if (!context) throw new Error("Audio context unavailable");
        for (const url of [source.webm, source.mp3]) {
            try {
                const response = await fetch(url);
                if (!response.ok) continue;
                return await context.decodeAudioData(await response.arrayBuffer());
            } catch {
                // Unsupported codec and a failed network request both get the MP3 fallback.
            }
        }
        throw new Error("Combat sound unavailable");
    },
    start(buffer) {
        if (!context || !bus || context.state !== "running" || voices.size >= 6) return false;
        const voice = context.createBufferSource();
        voice.buffer = buffer as AudioBuffer;
        voice.connect(bus);
        voices.add(voice);
        voice.onended = () => {
            voices.delete(voice);
            voice.disconnect();
        };
        voice.start();
        return true;
    },
});

/** Preload only the units in this battle, keeping the rest of the library off the network. */
export const preloadCombatSounds = (names: Iterable<string>): void => player.preload(names);

/** Provided game effects share the same decoded cache, effects bus, and scene cancellation. */
export const preloadEffectSounds = (sources: Iterable<ICombatSoundSource>): void => player.preloadSources(sources);

export const playEffectSound = (source: ICombatSoundSource, identity: string, alive?: () => boolean): void => {
    void player.playSource(source, identity, source.key, alive);
};

export const stopCombatSounds = (): void => {
    player.stop();
    for (const voice of voices) voice.stop();
};

export const playCombatSound = (
    name: string,
    role: CombatSoundRole,
    identity: string,
    melee = false,
    alive?: () => boolean,
): void => {
    void player.play(name, role, identity, melee, alive);
};
