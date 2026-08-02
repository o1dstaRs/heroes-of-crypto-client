import { describe, expect, test } from "bun:test";

import { createThemeMusicPlayer } from "./themeMusicPlayer";

class FakeAudio extends EventTarget {
    public volume = 1;
    public paused = true;
    public loadCalls = 0;
    public playCalls = 0;
    public readonly volumesAtPlay: number[] = [];
    public readonly playResults: Array<boolean | Promise<void>> = [];
    public play(): Promise<void> {
        this.playCalls += 1;
        this.volumesAtPlay.push(this.volume);
        const result = this.playResults.shift() ?? true;
        if (result instanceof Promise) {
            this.paused = false;
            return result;
        }
        if (!result) {
            this.paused = true;
            return Promise.reject(new Error("playback blocked"));
        }
        this.paused = false;
        return Promise.resolve();
    }
    public load(): void {
        this.loadCalls += 1;
        this.paused = true;
    }
}

const playlist = [
    { webm: "/first.webm", mp3: "/first.mp3" },
    { webm: "/second.webm", mp3: "/second.mp3" },
] as const;

const settle = async (): Promise<void> => {
    await Promise.resolve();
    await Promise.resolve();
};

describe("client theme music player", () => {
    test("starts every hand-off and wraps immediately from the last song to the first", async () => {
        const audio = new FakeAudio();
        const webmSource: { src: string } = { src: playlist[0].webm };
        const mp3Source: { src: string } = { src: playlist[0].mp3 };
        const fades: number[] = [];
        const player = createThemeMusicPlayer({
            audio,
            webmSource,
            mp3Source,
            playlist,
            getTargetVolume: () => 0.5,
            fadeTo: (target) => fades.push(target),
            onPlaybackBlocked: () => undefined,
            onPlaybackStarted: () => undefined,
        });

        expect(await player.start()).toBe(true);
        audio.dispatchEvent(new Event("ended"));
        await settle();
        expect(webmSource.src).toBe("/second.webm");
        expect(mp3Source.src).toBe("/second.mp3");

        audio.dispatchEvent(new Event("ended"));
        await settle();
        expect(webmSource.src).toBe("/first.webm");
        expect(mp3Source.src).toBe("/first.mp3");
        expect(audio.loadCalls).toBe(2);
        expect(audio.playCalls).toBe(3);
        expect(audio.paused).toBe(false);
        expect(audio.volumesAtPlay).toEqual([0, 0.5, 0.5]);
        expect(fades).toEqual([0.5]);
    });

    test("ignores an old AbortError after a newer source has started", async () => {
        const audio = new FakeAudio();
        let rejectOldAttempt: (reason?: unknown) => void = () => undefined;
        const oldAttempt = new Promise<void>((_resolve, reject) => {
            rejectOldAttempt = reject;
        });
        audio.playResults.push(oldAttempt, true, true);
        const webmSource: { src: string } = { src: playlist[0].webm };
        const blocked: number[] = [];
        const player = createThemeMusicPlayer({
            audio,
            webmSource,
            mp3Source: { src: playlist[0].mp3 },
            playlist,
            getTargetVolume: () => 0.5,
            fadeTo: () => undefined,
            onPlaybackBlocked: () => blocked.push(audio.playCalls),
            onPlaybackStarted: () => undefined,
        });

        const firstStart = player.start();
        expect(await player.advance()).toBe(true);
        rejectOldAttempt(new DOMException("The play() request was interrupted", "AbortError"));
        expect(await firstStart).toBe(false);

        audio.dispatchEvent(new Event("ended"));
        await settle();
        expect(blocked).toEqual([]);
        expect(webmSource.src).toBe("/first.webm");
        expect(audio.playCalls).toBe(3);
        expect(audio.paused).toBe(false);
    });

    test("keeps a rejected start retryable from the next gesture", async () => {
        const audio = new FakeAudio();
        audio.playResults.push(false, true);
        let blocked = 0;
        let started = 0;
        const player = createThemeMusicPlayer({
            audio,
            webmSource: { src: playlist[0].webm },
            mp3Source: { src: playlist[0].mp3 },
            playlist,
            getTargetVolume: () => 0.5,
            fadeTo: () => undefined,
            onPlaybackBlocked: () => {
                blocked += 1;
            },
            onPlaybackStarted: () => {
                started += 1;
            },
        });

        expect(await player.start()).toBe(false);
        expect(await player.start(0.5, true)).toBe(true);
        expect(blocked).toBe(1);
        expect(started).toBe(1);
        expect(audio.playCalls).toBe(2);
    });
});
