import { expect, mock, test } from "bun:test";

import { attachMediaVolume } from "./mediaVolume";

const lockedMedia = () =>
    Object.defineProperty({}, "volume", { configurable: true, get: () => 1, set: () => {} }) as { volume: number };

test("leaves native media volume and its playback path unchanged when writes work", () => {
    const media = { volume: 0.2 },
        route = mock(() => undefined);
    const release = attachMediaVolume(media, route);
    expect(media.volume).toBe(0.2);
    expect(route).not.toHaveBeenCalled();
    media.volume = 0.4;
    release();
    expect(media.volume).toBe(0.4);
});

test("music fades and mute reach the gain route when native volume writes are ignored", () => {
    const media = lockedMedia();
    const route = { connect: mock(() => {}), disconnect: mock(() => {}), setVolume: mock((_value: number) => {}) };
    const release = attachMediaVolume(media, () => route);
    media.volume = 0.2;
    expect(media.volume).toBe(0.2);
    expect(route.setVolume).toHaveBeenLastCalledWith(0.2);
    media.volume = 0;
    expect(route.setVolume).toHaveBeenLastCalledWith(0);
    media.volume = 0.65;
    expect(route.setVolume).toHaveBeenLastCalledWith(0.65);
    release();
    expect(media.volume).toBe(1);
    expect(route.disconnect).toHaveBeenCalledTimes(1);
});

test("a remount reuses its media source rather than making the element permanently silent", () => {
    const media = lockedMedia();
    const route = { connect: mock(() => {}), disconnect: mock(() => {}), setVolume: mock((_value: number) => {}) };
    const create = mock(() => route);
    const first = attachMediaVolume(media, create);
    media.volume = 0.3;
    first();
    first();
    const second = attachMediaVolume(media, create);
    expect(media.volume).toBe(0.3);
    expect(create).toHaveBeenCalledTimes(1);
    expect(route.connect).toHaveBeenCalledTimes(2);
    expect(route.disconnect).toHaveBeenCalledTimes(1);
    second();
    expect(route.disconnect).toHaveBeenCalledTimes(2);
});

test("does not connect an unadaptable element to an inaudible Web Audio route", () => {
    const media = Object.freeze(lockedMedia());
    const create = mock(() => undefined);
    const release = attachMediaVolume(media, create);
    expect(create).not.toHaveBeenCalled();
    release();
});
