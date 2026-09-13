import { describe, expect, test } from "bun:test";

import { createUiSoundPlayer, pickUiSoundSource } from "./uiSounds";

interface IFakeElement {
    src: string;
    volume: number;
    currentTime: number;
    preload: string;
    plays: number;
    canPlayType(type: string): string;
    play(): Promise<void>;
}

const fakeElement = (opus: boolean, reject = false): IFakeElement => ({
    src: "",
    volume: 1,
    currentTime: 5,
    preload: "",
    plays: 0,
    canPlayType: (type: string) => (opus && type.includes("opus") ? "probably" : ""),
    play() {
        this.plays += 1;
        return reject ? Promise.reject(new Error("NotAllowedError")) : Promise.resolve();
    },
});

describe("uiSounds", () => {
    test("prefers the Opus source and falls back to MP3 when the browser cannot play it", () => {
        const sources = { webm: "/audio/x.webm", mp3: "/audio/x.mp3" };
        expect(pickUiSoundSource(() => "probably", sources)).toBe("/audio/x.webm");
        expect(pickUiSoundSource(() => "", sources)).toBe("/audio/x.mp3");
    });

    test("plays at the effects level with the per-sound trim, from the start, reusing one element per sound", () => {
        const created: IFakeElement[] = [];
        const play = createUiSoundPlayer({
            createElement: () => {
                const element = fakeElement(true);
                created.push(element);
                return element;
            },
            gain: () => 0.5,
        });
        expect(play("ui_popup")).toBe(true);
        expect(play("ui_popup")).toBe(true);
        expect(play("friend_invite")).toBe(true);
        expect(created).toHaveLength(2);
        expect(created[0]?.src).toBe("/audio/ui_popup.webm");
        expect(created[0]?.plays).toBe(2);
        expect(created[0]?.volume).toBeCloseTo(0.35);
        expect(created[0]?.currentTime).toBe(0);
        expect(created[0]?.preload).toBe("auto");
        expect(created[1]?.src).toBe("/audio/friend_invite.webm");
        expect(created[1]?.volume).toBeCloseTo(0.5);
    });

    test("stays silent when effects are muted and never throws on a refused play()", () => {
        let created = 0;
        const muted = createUiSoundPlayer({
            createElement: () => {
                created += 1;
                return fakeElement(false);
            },
            gain: () => 0,
        });
        expect(muted("notification")).toBe(false);
        expect(created).toBe(0);

        const refused = createUiSoundPlayer({ createElement: () => fakeElement(false, true), gain: () => 1 });
        expect(refused("notification")).toBe(true);
    });
});
