/**
 * Poker-chip sounds for the wager flow, synthesized with WebAudio — no binary assets to ship or
 * cache-bust. A "clack" is a short burst of band-passed noise over a rapidly-decaying thump, which
 * is close enough to two clay chips meeting that the ear fills in the felt.
 *
 * Volume rides the EFFECTS level from the player's settings, which is its own setting and no longer the
 * music's: turning the theme down (or off) leaves the chips exactly where the player put them.
 */

import { effectsGain } from "../../settings/audioLevels";

let context: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;

const audioContext = (): AudioContext | null => {
    if (typeof window === "undefined") {
        return null;
    }
    if (!context) {
        try {
            context = new AudioContext();
        } catch {
            return null;
        }
    }
    if (context.state === "suspended") {
        void context.resume().catch(() => undefined);
    }
    return context;
};

const getNoiseBuffer = (ctx: AudioContext): AudioBuffer => {
    if (noiseBuffer) {
        return noiseBuffer;
    }

    const noiseLength = Math.floor(ctx.sampleRate * 0.05);
    noiseBuffer = ctx.createBuffer(1, noiseLength, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseLength; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (noiseLength / 6));
    }
    return noiseBuffer;
};

/** One chip clack at `at` seconds from now. `pitch` shifts the body resonance (raises step up). */
const clack = (ctx: AudioContext, at: number, pitch: number, gainScale: number): void => {
    const t = ctx.currentTime + at;

    // The "crack": a few ms of noise through a tight band-pass.
    const noise = ctx.createBufferSource();
    noise.buffer = getNoiseBuffer(ctx);
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 2600 * pitch;
    band.Q.value = 1.6;

    // The "body": a fast-decaying thump underneath.
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(340 * pitch, t);
    osc.frequency.exponentialRampToValueAtTime(140 * pitch, t + 0.07);

    const gain = ctx.createGain();
    const peak = Math.max(0.0001, effectsGain() * gainScale);
    gain.gain.setValueAtTime(peak, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);

    noise.connect(band).connect(gain);
    osc.connect(gain);
    gain.connect(ctx.destination);
    noise.start(t);
    osc.start(t);
    osc.stop(t + 0.12);
    osc.addEventListener(
        "ended",
        () => {
            noise.disconnect();
            band.disconnect();
            osc.disconnect();
            gain.disconnect();
        },
        { once: true },
    );
};

/** CALL: one solid chip hitting the felt. */
export const playCallSound = (): void => {
    const ctx = audioContext();
    if (!ctx) {
        return;
    }
    clack(ctx, 0, 1, 0.55);
};

/** RAISE: three quick chips, stepping up — the classic "sliding a stack in". */
export const playRaiseSound = (): void => {
    const ctx = audioContext();
    if (!ctx) {
        return;
    }
    clack(ctx, 0, 0.9, 0.4);
    clack(ctx, 0.07, 1.05, 0.48);
    clack(ctx, 0.15, 1.22, 0.55);
};

/** LOCK: the pot coming together — a little cascade settling down. */
export const playLockSound = (): void => {
    const ctx = audioContext();
    if (!ctx) {
        return;
    }
    clack(ctx, 0, 1.15, 0.4);
    clack(ctx, 0.09, 1.0, 0.45);
    clack(ctx, 0.19, 0.85, 0.5);
};
