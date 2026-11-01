import { describe, expect, test } from "bun:test";

import {
    getAudioLevels,
    musicGain,
    setMasterMuted,
    setMasterVolume,
    setMusicMuted,
    setMusicVolume,
} from "../../settings/audioLevels";
import { createThemeMusicPlayer, type ThemeTrack } from "./themeMusicPlayer";

class FakeAudio extends EventTarget {
    public volume = 1;
    public paused = true;
    public loadCalls = 0;
    public pauseCalls = 0;
    public playCalls = 0;
    public currentTime = 0;
    public duration = Number.NaN;
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
    public pause(): void {
        this.pauseCalls += 1;
        this.paused = true;
    }
}

const playlist: readonly ThemeTrack[] = [
    { webm: "/first.webm", mp3: "/first.mp3" },
    { webm: "/second.webm", mp3: "/second.mp3" },
];

const settle = async (): Promise<void> => {
    await Promise.resolve();
    await Promise.resolve();
};

describe("client theme music player", () => {
    test("master volume and the music checkbox survive menu and ranked track handoffs", async () => {
        const previous = getAudioLevels();
        const audio = new FakeAudio();
        const player = createThemeMusicPlayer({
            audio,
            webmSource: { src: playlist[0].webm },
            mp3Source: { src: playlist[0].mp3 },
            playlist,
            getTargetVolume: musicGain,
            fadeTo: (target) => {
                audio.volume = target;
            },
            onPlaybackStarted: () => undefined,
            onPlaybackBlocked: () => undefined,
        });
        try {
            setMasterVolume(0.5);
            setMasterMuted(false);
            setMusicVolume(0.4);
            setMusicMuted(false);
            expect(await player.start()).toBe(true);
            expect(audio.volume).toBeCloseTo(0.2);

            setMusicMuted(true);
            player.setTargetVolume(musicGain());
            player.releaseMedia();
            expect(await player.playSingle({ webm: "/ranked.webm", mp3: "/ranked.mp3" }, true)).toBe(false);
            setMasterMuted(true);
            setMasterMuted(false);
            expect(await player.resumePlaylist(true)).toBe(false);
            expect(audio.paused).toBe(true);
            expect(audio.volume).toBe(0);

            setMasterVolume(0.25);
            setMusicMuted(false);
            expect(await player.start()).toBe(true);
            expect(audio.volume).toBeCloseTo(0.1);
        } finally {
            player.destroy();
            setMasterVolume(previous.masterVolume);
            setMasterMuted(previous.masterMuted);
            setMusicVolume(previous.musicVolume);
            setMusicMuted(previous.musicMuted);
        }
    });

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

    test("releases silent media and restores the current track on resume", async () => {
        const audio = new FakeAudio();
        const webmSource: { src: string } = { src: playlist[0].webm };
        const mp3Source: { src: string } = { src: playlist[0].mp3 };
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
        player.releaseMedia();
        expect(audio.pauseCalls).toBe(1);
        expect(audio.loadCalls).toBe(1);
        expect(webmSource.src).toBe("");
        expect(mp3Source.src).toBe("");

        expect(await player.start()).toBe(true);
        expect(webmSource.src).toBe(playlist[0].webm);
        expect(mp3Source.src).toBe(playlist[0].mp3);
        expect(audio.loadCalls).toBe(2);
        expect(audio.playCalls).toBe(2);
        expect(audio.paused).toBe(false);
    });

    test("keeps a saved menu position off the match track and seeks it when the playlist returns", async () => {
        const audio = new FakeAudio();
        audio.duration = 90;
        const webmSource: { src: string } = { src: playlist[0].webm };
        const mp3Source: { src: string } = { src: playlist[0].mp3 };
        const player = createThemeMusicPlayer({
            audio,
            webmSource,
            mp3Source,
            playlist,
            getTargetVolume: () => 0.5,
            fadeTo: () => undefined,
            onPlaybackBlocked: () => undefined,
            onPlaybackStarted: () => undefined,
            initialIndex: 1,
            initialTime: 12,
        });

        expect(webmSource.src).toBe("/second.webm");
        expect(await player.playSingle({ webm: "/ranked.webm", mp3: "/ranked.mp3" }, true)).toBe(true);
        audio.dispatchEvent(new Event("loadedmetadata"));
        expect(audio.currentTime).toBe(0);
        expect(player.currentIndex()).toBe(1);

        expect(await player.resumePlaylist(true)).toBe(true);
        audio.duration = 90;
        audio.dispatchEvent(new Event("loadedmetadata"));
        expect(audio.currentTime).toBe(12);
        expect(webmSource.src).toBe("/second.webm");
        player.destroy();
    });

    test("overlaps the next menu song and does not skip it when the old one ends", async () => {
        const audio = new FakeAudio();
        const incoming = new FakeAudio();
        audio.duration = 100;
        audio.currentTime = 98;
        const webmSource = { src: playlist[0].webm };
        const mp3Source = { src: playlist[0].mp3 };
        const nextWebm = { src: "" };
        const nextMp3 = { src: "" };
        const animation: { frame?: FrameRequestCallback } = {};
        const previousFrame = globalThis.requestAnimationFrame;
        globalThis.requestAnimationFrame = (callback: FrameRequestCallback): number => {
            animation.frame = callback;
            return 1;
        };
        const player = createThemeMusicPlayer({
            audio,
            webmSource,
            mp3Source,
            playlist,
            getTargetVolume: () => 0.5,
            fadeTo: () => undefined,
            onPlaybackBlocked: () => undefined,
            onPlaybackStarted: () => undefined,
            crossfade: { ms: 2200, audio: incoming, webmSource: nextWebm, mp3Source: nextMp3 },
        });

        try {
            expect(await player.start()).toBe(true);
            audio.duration = 100;
            audio.currentTime = 98;
            audio.dispatchEvent(new Event("timeupdate"));
            expect(nextWebm.src).toBe("/second.webm");
            expect(incoming.playCalls).toBe(1);
            expect(player.currentIndex()).toBe(0);

            audio.dispatchEvent(new Event("ended"));
            expect(player.currentIndex()).toBe(0);
            expect(webmSource.src).toBe("/first.webm");

            await Promise.resolve();
            await Promise.resolve();
            animation.frame?.(performance.now() + 10_000);
            expect(player.currentIndex()).toBe(1);
            expect(player.isPlaylist()).toBe(true);
            expect(audio.pauseCalls).toBe(1);
            expect(incoming.volume).toBeCloseTo(0.5);
            expect(incoming.paused).toBe(false);
        } finally {
            globalThis.requestAnimationFrame = previousFrame;
            player.destroy();
        }
    });

    test("fades into the match track and keeps the menu position underneath it", async () => {
        const audio = new FakeAudio();
        const incoming = new FakeAudio();
        const webmSource = { src: playlist[0].webm };
        const mp3Source = { src: playlist[0].mp3 };
        const nextWebm = { src: "" };
        const nextMp3 = { src: "" };
        const animation: { frame?: FrameRequestCallback } = {};
        const previousFrame = globalThis.requestAnimationFrame;
        globalThis.requestAnimationFrame = (callback: FrameRequestCallback): number => {
            animation.frame = callback;
            return 1;
        };
        const ranked = { webm: "/ranked.webm", mp3: "/ranked.mp3" };
        const player = createThemeMusicPlayer({
            audio,
            webmSource,
            mp3Source,
            playlist,
            getTargetVolume: () => 0.5,
            fadeTo: () => undefined,
            onPlaybackBlocked: () => undefined,
            onPlaybackStarted: () => undefined,
            initialIndex: 1,
            initialTime: 12,
            crossfade: { ms: 2200, audio: incoming, webmSource: nextWebm, mp3Source: nextMp3 },
        });

        try {
            expect(await player.start()).toBe(true);
            audio.currentTime = 22;
            expect(await player.playSingle(ranked, true)).toBe(true);
            expect(nextWebm.src).toBe("/ranked.webm");
            expect(incoming.playCalls).toBe(1);
            expect(player.isPlaylist()).toBe(true);

            audio.dispatchEvent(new Event("ended"));
            expect(webmSource.src).toBe("/second.webm");

            await Promise.resolve();
            await Promise.resolve();
            animation.frame?.(performance.now() + 10_000);
            expect(player.isPlaylist()).toBe(false);
            expect(player.playbackMemory()).toEqual({ index: 1, time: 22, matchTime: 0 });
            expect(incoming.volume).toBeCloseTo(0.5);
        } finally {
            globalThis.requestAnimationFrame = previousFrame;
            player.destroy();
        }
    });

    test("reopens the match track at the saved bar and does not load it again", async () => {
        const audio = new FakeAudio();
        audio.duration = 200;
        const webmSource = { src: playlist[0].webm };
        const mp3Source = { src: playlist[0].mp3 };
        const ranked = { webm: "/ranked.webm", mp3: "/ranked.mp3" };
        const player = createThemeMusicPlayer({
            audio,
            webmSource,
            mp3Source,
            playlist,
            getTargetVolume: () => 0.5,
            fadeTo: () => undefined,
            onPlaybackBlocked: () => undefined,
            onPlaybackStarted: () => undefined,
            initialIndex: 1,
            initialTime: 12,
            initialMatch: { track: ranked, time: 48 },
        });

        audio.dispatchEvent(new Event("loadedmetadata"));
        expect(audio.currentTime).toBe(48);
        expect(webmSource.src).toBe("/ranked.webm");
        expect(player.playbackMemory()).toEqual({ index: 1, time: 12, matchTime: 48 });

        const loads = audio.loadCalls;
        expect(await player.playSingle(ranked, true)).toBe(true);
        expect(audio.loadCalls).toBe(loads);
        expect(audio.currentTime).toBe(48);

        expect(await player.resumePlaylist(true)).toBe(true);
        audio.duration = 90;
        audio.dispatchEvent(new Event("loadedmetadata"));
        expect(audio.currentTime).toBe(12);
        expect(webmSource.src).toBe("/second.webm");
        expect(player.playbackMemory()).toEqual({ index: 1, time: 12 });
        player.destroy();
    });

    test("overlaps the match track with itself instead of cutting the loop", async () => {
        const audio = new FakeAudio();
        const incoming = new FakeAudio();
        audio.duration = 100;
        const webmSource = { src: "" };
        const mp3Source = { src: "" };
        const nextWebm = { src: "" };
        const nextMp3 = { src: "" };
        const ranked = { webm: "/ranked.webm", mp3: "/ranked.mp3" };
        const player = createThemeMusicPlayer({
            audio,
            webmSource,
            mp3Source,
            playlist,
            getTargetVolume: () => 0.5,
            fadeTo: () => undefined,
            onPlaybackBlocked: () => undefined,
            onPlaybackStarted: () => undefined,
            initialMatch: { track: ranked, time: 10 },
            crossfade: { ms: 2200, audio: incoming, webmSource: nextWebm, mp3Source: nextMp3 },
        });

        audio.dispatchEvent(new Event("loadedmetadata"));
        expect(await player.start()).toBe(true);
        const loads = audio.loadCalls;
        audio.duration = 100;
        audio.currentTime = 98;
        audio.dispatchEvent(new Event("timeupdate"));
        expect(nextWebm.src).toBe("/ranked.webm");
        expect(incoming.playCalls).toBe(1);

        audio.dispatchEvent(new Event("ended"));
        expect(audio.loadCalls).toBe(loads);
        expect(player.isPlaylist()).toBe(false);
        player.destroy();
    });
});

describe("two-song match playlist", () => {
    test("plays Iron and Silk then The Last Stand, wraps, and restores the Arena's own position", async () => {
        const { ARENA_MUSIC_PLAYLIST, MATCH_MUSIC_PLAYLIST } = await import("./themeMusicTracks");
        const audio = new FakeAudio();
        const webmSource = { src: ARENA_MUSIC_PLAYLIST[0].webm };
        const mp3Source = { src: ARENA_MUSIC_PLAYLIST[0].mp3 };
        const player = createThemeMusicPlayer({
            audio,
            webmSource,
            mp3Source,
            playlist: ARENA_MUSIC_PLAYLIST,
            initialIndex: 2,
            initialTime: 43,
            getTargetVolume: () => 0.2,
            fadeTo: () => undefined,
            onPlaybackStarted: () => undefined,
            onPlaybackBlocked: () => undefined,
        });
        try {
            audio.dispatchEvent(new Event("loadedmetadata"));
            await player.playMatchPlaylist(MATCH_MUSIC_PLAYLIST, true);
            expect(webmSource.src).toBe("/audio/iron_and_silk.webm");
            for (const expected of ["the_last_stand", "iron_and_silk", "the_last_stand"]) {
                audio.currentTime = 0;
                audio.dispatchEvent(new Event("ended"));
                await settle();
                expect(webmSource.src).toBe(`/audio/${expected}.webm`);
                expect(mp3Source.src).toBe(`/audio/${expected}.mp3`);
                expect(player.isPlaylist()).toBe(false);
                expect(audio.paused).toBe(false);
            }
            audio.currentTime = 27;
            const loads = audio.loadCalls;
            await player.playMatchPlaylist(MATCH_MUSIC_PLAYLIST, true);
            expect(audio.loadCalls).toBe(loads);
            expect(player.playbackMemory()).toEqual({ index: 2, time: 43, matchIndex: 1, matchTime: 27 });
            await player.resumePlaylist(true);
            audio.dispatchEvent(new Event("loadedmetadata"));
            expect(webmSource.src).toBe("/audio/the_stone_lullaby.webm");
            expect(audio.currentTime).toBe(43);
            expect(player.playbackMemory()).toEqual({ index: 2, time: 43 });
            await player.playMatchPlaylist(MATCH_MUSIC_PLAYLIST, true);
            expect(webmSource.src).toBe("/audio/iron_and_silk.webm");
        } finally {
            player.destroy();
        }
    });

    test("reload resumes the second match song and its bar before and after the board reports", async () => {
        const { parseThemePlaybackMemory } = await import("./themeMusicMemory");
        const { MATCH_MUSIC_PLAYLIST } = await import("./themeMusicTracks");
        const saved = parseThemePlaybackMemory(JSON.stringify({ index: 1, time: 19, matchIndex: 1, matchTime: 61 }))!;
        const audio = new FakeAudio();
        const webmSource = { src: "" };
        const mp3Source = { src: "" };
        const player = createThemeMusicPlayer({
            audio,
            webmSource,
            mp3Source,
            playlist,
            initialIndex: saved.index,
            initialTime: saved.time,
            initialMatch: {
                track: MATCH_MUSIC_PLAYLIST[saved.matchIndex ?? 0],
                time: saved.matchTime!,
                playlist: MATCH_MUSIC_PLAYLIST,
            },
            getTargetVolume: () => 0.2,
            fadeTo: () => undefined,
            onPlaybackStarted: () => undefined,
            onPlaybackBlocked: () => undefined,
        });
        try {
            expect(player.playbackMemory()).toEqual(saved);
            audio.dispatchEvent(new Event("loadedmetadata"));
            expect(webmSource.src).toBe("/audio/the_last_stand.webm");
            expect(audio.currentTime).toBe(61);
            const loads = audio.loadCalls;
            await player.playMatchPlaylist(MATCH_MUSIC_PLAYLIST, true);
            expect(audio.loadCalls).toBe(loads);
            expect(player.playbackMemory()).toEqual(saved);
            audio.dispatchEvent(new Event("ended"));
            await settle();
            expect(webmSource.src).toBe("/audio/iron_and_silk.webm");
            await player.resumePlaylist(true);
            audio.dispatchEvent(new Event("loadedmetadata"));
            expect(audio.currentTime).toBe(19);
        } finally {
            player.destroy();
        }
    });

    test("crossfades both match songs without skipping on ended, and preserves the menu underneath", async () => {
        const { MATCH_MUSIC_PLAYLIST } = await import("./themeMusicTracks");
        const first = new FakeAudio();
        const second = new FakeAudio();
        const webmSource = { src: "" };
        const mp3Source = { src: "" };
        const nextWebm = { src: "" };
        const nextMp3 = { src: "" };
        const animation: { frame?: FrameRequestCallback } = {};
        const previous = globalThis.requestAnimationFrame;
        globalThis.requestAnimationFrame = (frame) => {
            animation.frame = frame;
            return 1;
        };
        const player = createThemeMusicPlayer({
            audio: first,
            webmSource,
            mp3Source,
            playlist,
            initialIndex: 1,
            initialTime: 15,
            initialMatch: { track: MATCH_MUSIC_PLAYLIST[0], time: 0, playlist: MATCH_MUSIC_PLAYLIST },
            crossfade: { ms: 2200, audio: second, webmSource: nextWebm, mp3Source: nextMp3 },
            getTargetVolume: () => 0.2,
            fadeTo: () => undefined,
            onPlaybackStarted: () => undefined,
            onPlaybackBlocked: () => undefined,
        });
        try {
            await player.start();
            for (const [outgoing, incoming, source, expected, index] of [
                [first, second, nextWebm, "/audio/the_last_stand.webm", 1],
                [second, first, webmSource, "/audio/iron_and_silk.webm", 0],
            ] as const) {
                incoming.currentTime = 0;
                outgoing.duration = 100;
                outgoing.currentTime = 98;
                outgoing.dispatchEvent(new Event("timeupdate"));
                expect(source.src).toBe(expected);
                outgoing.dispatchEvent(new Event("ended"));
                await settle();
                animation.frame?.(performance.now() + 10_000);
                expect(player.playbackMemory()).toEqual({ index: 1, time: 15, matchIndex: index, matchTime: 0 });
                expect(incoming.paused).toBe(false);
                expect(incoming.volume).toBeCloseTo(0.2);
                expect(outgoing.paused).toBe(true);
            }
        } finally {
            globalThis.requestAnimationFrame = previous;
            player.destroy();
        }
    });

    test("muting and restoring the second song keeps the current song and position", async () => {
        const { MATCH_MUSIC_PLAYLIST } = await import("./themeMusicTracks");
        const audio = new FakeAudio();
        const webmSource = { src: "" };
        let volume = 0.2;
        const player = createThemeMusicPlayer({
            audio,
            webmSource,
            mp3Source: { src: "" },
            playlist,
            initialMatch: { track: MATCH_MUSIC_PLAYLIST[1], time: 52, playlist: MATCH_MUSIC_PLAYLIST },
            getTargetVolume: () => volume,
            fadeTo: () => undefined,
            onPlaybackStarted: () => undefined,
            onPlaybackBlocked: () => undefined,
        });
        try {
            audio.dispatchEvent(new Event("loadedmetadata"));
            await player.start();
            volume = 0;
            player.setTargetVolume(volume);
            player.releaseMedia();
            expect(audio.paused).toBe(true);
            expect(await player.playMatchPlaylist(MATCH_MUSIC_PLAYLIST, true)).toBe(false);
            volume = 0.2;
            player.setTargetVolume(volume);
            await player.start();
            audio.dispatchEvent(new Event("loadedmetadata"));
            expect(webmSource.src).toBe("/audio/the_last_stand.webm");
            expect(audio.currentTime).toBe(52);
            expect(player.playbackMemory()).toMatchObject({ matchIndex: 1, matchTime: 52 });
        } finally {
            player.destroy();
        }
    });

    test("blocked crossfade falls back to the correct next match song", async () => {
        const { MATCH_MUSIC_PLAYLIST } = await import("./themeMusicTracks");
        const audio = new FakeAudio();
        const incoming = new FakeAudio();
        const webmSource = { src: "" };
        const player = createThemeMusicPlayer({
            audio,
            webmSource,
            mp3Source: { src: "" },
            playlist,
            initialMatch: { track: MATCH_MUSIC_PLAYLIST[0], time: 0, playlist: MATCH_MUSIC_PLAYLIST },
            crossfade: { ms: 2200, audio: incoming, webmSource: { src: "" }, mp3Source: { src: "" } },
            getTargetVolume: () => 0.2,
            fadeTo: () => undefined,
            onPlaybackStarted: () => undefined,
            onPlaybackBlocked: () => undefined,
        });
        try {
            await player.start();
            incoming.playResults.push(false);
            audio.duration = 100;
            audio.currentTime = 98;
            audio.dispatchEvent(new Event("timeupdate"));
            await settle();
            expect(webmSource.src).toBe("/audio/the_last_stand.webm");
            expect(player.playbackMemory()).toMatchObject({ matchIndex: 1 });
            expect(audio.paused).toBe(false);
        } finally {
            player.destroy();
        }
    });
});

test("The Last Stand keeps distinct Arena and match clocks despite using the same audio file", async () => {
    const { ARENA_MUSIC_PLAYLIST, MATCH_MUSIC_PLAYLIST } = await import("./themeMusicTracks");
    const audio = new FakeAudio();
    const webmSource = { src: "" };
    const player = createThemeMusicPlayer({
        audio,
        webmSource,
        mp3Source: { src: "" },
        playlist: ARENA_MUSIC_PLAYLIST,
        initialIndex: 1,
        initialTime: 21,
        initialMatch: { track: MATCH_MUSIC_PLAYLIST[1], time: 87, playlist: MATCH_MUSIC_PLAYLIST },
        getTargetVolume: () => 0.2,
        fadeTo: () => undefined,
        onPlaybackStarted: () => undefined,
        onPlaybackBlocked: () => undefined,
    });
    try {
        audio.dispatchEvent(new Event("loadedmetadata"));
        expect(audio.currentTime).toBe(87);
        await player.start();
        await player.resumePlaylist(true);
        audio.dispatchEvent(new Event("loadedmetadata"));
        expect(webmSource.src).toBe("/audio/the_last_stand.webm");
        expect(audio.currentTime).toBe(21);
        expect(player.isPlaylist()).toBe(true);
        expect(player.playbackMemory()).toEqual({ index: 1, time: 21 });
    } finally {
        player.destroy();
    }
});
