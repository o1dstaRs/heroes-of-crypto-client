import { describe, expect, test } from "bun:test";

import { createThemeMusicPlayer, toggleThemeMusicSettings } from "./theme-music-player";

class FakeAudio extends EventTarget {
    public volume = 1;
    public paused = true;
    public loadCalls = 0;
    public playCalls = 0;
    public playResults: Array<boolean | "pending"> = [];

    public play(): Promise<void> {
        this.playCalls += 1;
        const result = this.playResults.shift() ?? true;
        if (result === "pending") {
            // Mirrors browsers that report paused=false before the play promise has actually succeeded.
            this.paused = false;
            return new Promise(() => undefined);
        }
        if (!result) {
            this.paused = true;
            return Promise.reject(new Error("autoplay blocked"));
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

describe("theme music player", () => {
    test("keeps autoplay retryable after the browser rejects the first attempt", async () => {
        const audio = new FakeAudio();
        audio.playResults.push(false, true);
        const fades: number[] = [];
        let blocked = 0;
        let started = 0;
        const player = createThemeMusicPlayer({
            audio,
            webmSource: { src: playlist[0].webm },
            mp3Source: { src: playlist[0].mp3 },
            playlist,
            getTargetVolume: () => 0.5,
            fadeTo: (target) => fades.push(target),
            onPlaybackBlocked: () => {
                blocked += 1;
            },
            onPlaybackStarted: () => {
                started += 1;
            },
        });

        expect(await player.start()).toBe(false);
        expect(await player.start(0.5, true)).toBe(true);
        expect(audio.playCalls).toBe(2);
        expect(blocked).toBe(1);
        expect(started).toBe(1);
        expect(fades).toEqual([0.5]);
    });

    test("retries from a user gesture while an autoplay attempt is pending", async () => {
        const audio = new FakeAudio();
        audio.playResults.push("pending", true);
        const fades: number[] = [];
        let started = 0;
        const player = createThemeMusicPlayer({
            audio,
            webmSource: { src: playlist[0].webm },
            mp3Source: { src: playlist[0].mp3 },
            playlist,
            getTargetVolume: () => 0.5,
            fadeTo: (target) => fades.push(target),
            onPlaybackBlocked: () => undefined,
            onPlaybackStarted: () => {
                started += 1;
            },
        });

        void player.start();
        expect(audio.paused).toBe(false);
        expect(await player.start(0.5, true)).toBe(true);
        expect(audio.playCalls).toBe(2);
        expect(started).toBe(1);
        expect(fades).toEqual([0.5]);
    });

    test("loads and starts the next song when the current song ends", async () => {
        const audio = new FakeAudio();
        const webmSource = { src: playlist[0].webm };
        const mp3Source = { src: playlist[0].mp3 };
        const player = createThemeMusicPlayer({
            audio,
            webmSource,
            mp3Source,
            playlist,
            getTargetVolume: () => 0.5,
            fadeTo: () => undefined,
            onPlaybackBlocked: () => undefined,
            onPlaybackStarted: () => undefined,
        });

        expect(await player.start()).toBe(true);
        audio.dispatchEvent(new Event("ended"));
        await Promise.resolve();
        await Promise.resolve();

        expect(webmSource.src).toBe("/second.webm");
        expect(mp3Source.src).toBe("/second.mp3");
        expect(audio.loadCalls).toBe(1);
        expect(audio.playCalls).toBe(2);
        expect(audio.paused).toBe(false);
    });

    test("restores an audible default with one speaker click from volume zero", () => {
        expect(toggleThemeMusicSettings({ volume: 0, muted: false }, 0.5)).toEqual({
            volume: 0.5,
            muted: false,
        });
        expect(toggleThemeMusicSettings({ volume: 0.4, muted: true }, 0.5)).toEqual({
            volume: 0.4,
            muted: false,
        });
        expect(toggleThemeMusicSettings({ volume: 0.4, muted: false }, 0.5)).toEqual({
            volume: 0.4,
            muted: true,
        });
    });
});
