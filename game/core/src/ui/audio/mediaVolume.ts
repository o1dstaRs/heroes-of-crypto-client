import { getGameAudioContext } from "./combatSounds";

interface VolumeRoute {
    connect(): void;
    disconnect(): void;
    setVolume(volume: number): void;
}

const bridges = new WeakMap<
    object,
    { volume: number; users: number; route: VolumeRoute; descriptor?: PropertyDescriptor }
>();

/**
 * Some mobile media elements ignore volume writes. Give the existing music player's volume/fades
 * a GainNode on the shared audio context in that case; browsers with working volume stay untouched.
 */
export const attachMediaVolume = (
    media: { volume: number },
    createRoute: () => VolumeRoute | undefined,
): (() => void) => {
    let bridge = bridges.get(media);
    if (!bridge) {
        const previous = media.volume;
        const probe = previous === 0.37 ? 0.63 : 0.37;
        media.volume = probe;
        const nativeVolumeWorks = Math.abs(media.volume - probe) < 0.001;
        media.volume = previous;
        if (nativeVolumeWorks) return () => {};
        if (!Object.isExtensible(media) || Object.getOwnPropertyDescriptor(media, "volume")?.configurable === false)
            return () => {};
        const route = createRoute();
        if (!route) return () => {};
        bridge = { volume: previous, users: 0, route, descriptor: Object.getOwnPropertyDescriptor(media, "volume") };
        bridges.set(media, bridge);
    }
    if (bridge.users === 0) {
        const state = bridge;
        Object.defineProperty(media, "volume", {
            configurable: true,
            get: () => state.volume,
            set: (value: number) => {
                if (!Number.isFinite(value)) return;
                state.volume = Math.min(1, Math.max(0, value));
                state.route.setVolume(state.volume);
            },
        });
        bridge.route.setVolume(bridge.volume);
        bridge.route.connect();
    }
    bridge.users += 1;
    let released = false;
    return () => {
        if (released) return;
        released = true;
        bridge.users -= 1;
        if (bridge.users > 0) return;
        bridge.route.disconnect();
        if (bridge.descriptor) Object.defineProperty(media, "volume", bridge.descriptor);
        else Reflect.deleteProperty(media, "volume");
    };
};

export const supportMediaVolume = (media: HTMLMediaElement): (() => void) => {
    try {
        return attachMediaVolume(media, () => {
            const context = getGameAudioContext();
            if (!context) return undefined;
            const source = context.createMediaElementSource(media);
            const gain = context.createGain();
            return {
                connect: () => {
                    source.connect(gain);
                    gain.connect(context.destination);
                },
                disconnect: () => {
                    source.disconnect();
                    gain.disconnect();
                },
                setVolume: (value) => {
                    gain.gain.value = value;
                },
            };
        });
    } catch {
        // An embedded browser without media routing retains its ordinary playback and mute behavior.
        return () => {};
    }
};
