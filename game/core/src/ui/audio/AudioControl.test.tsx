import { expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server.node";
import { MemoryRouter } from "react-router";

import {
    effectsGain,
    getAudioLevels,
    musicGain,
    setEffectsMuted,
    setEffectsVolume,
    setMasterMuted,
    setMasterVolume,
    setMusicMuted,
} from "../../settings/audioLevels";
import { AudioControl } from "./AudioControl";
import { createCombatSoundPlayer } from "./combatSounds";
import { resolveGameSound } from "./gameSounds";
import { ThemeMusic } from "./ThemeMusic";
import { createUiSoundPlayer } from "./uiSounds";

const readControls = async (html: string) => {
    const result = { volume: "", music: false, musicLabel: "", soundButtons: 0 };
    await new HTMLRewriter()
        .on('input[type="range"][aria-label="Sound volume"]', {
            element(element) {
                result.volume = element.getAttribute("value") ?? "";
            },
        })
        .on('input[type="checkbox"]', {
            element(element) {
                result.music = element.hasAttribute("checked");
            },
        })
        .on("label", {
            text(chunk) {
                result.musicLabel += chunk.text;
            },
        })
        .on('button[aria-label="Mute sound"]', {
            element() {
                result.soundButtons += 1;
            },
        })
        .transform(new Response(html))
        .text();
    return result;
};

test.each(["/", "/play", "/game/ranked-match", "/game/ranked-match?replay=1", "/lobbies", "/portal"])(
    "offers shared sound volume and the music checkbox on %s",
    async (route) => {
        const html = renderToStaticMarkup(
            <MemoryRouter initialEntries={[route]}>
                <ThemeMusic />
            </MemoryRouter>,
        );
        expect(await readControls(html)).toEqual({ volume: "100", music: true, musicLabel: "Music", soundButtons: 1 });
    },
);

test("keeps the same controls when docked into the ranked or arena footer", async () => {
    const html = renderToStaticMarkup(<AudioControl docked onSettingsChange={() => undefined} />);
    expect(await readControls(html)).toEqual({ volume: "100", music: true, musicLabel: "Music", soundButtons: 1 });
});

test("shared sound reaches creature, spell and interface effects with music disabled", async () => {
    const previous = getAudioLevels();
    const audible: number[] = [];
    const effects = createCombatSoundPlayer({
        gain: effectsGain,
        available: () => true,
        now: () => 0,
        load: async () => ({}),
        start: () => {
            audible.push(effectsGain());
        },
    });
    const notification = {
        src: "",
        volume: 1,
        currentTime: 0,
        preload: "",
        canPlayType: () => "probably",
        play: () => Promise.resolve(),
        pause: () => undefined,
    };
    const ui = createUiSoundPlayer({ gain: effectsGain, createElement: () => notification });
    try {
        setMasterVolume(0.5);
        setMasterMuted(false);
        setEffectsVolume(0.8);
        setEffectsMuted(false);
        setMusicMuted(true);
        expect(musicGain()).toBe(0);
        expect(await effects.play("Wolf", "attack", "attacker")).toBe(true);
        const heal = resolveGameSound("heal");
        expect(await effects.playSource(heal, "heal", heal.key)).toBe(true);
        expect(audible).toEqual([0.4, 0.4]);
        expect(ui("friend_invite")).toBe(true);
        expect(notification.volume).toBeCloseTo(0.4);

        setMasterVolume(0.25);
        expect(await effects.play("Wolf", "hurt", "victim")).toBe(true);
        ui.refreshVolume();
        expect(audible.at(-1)).toBeCloseTo(0.2);
        expect(notification.volume).toBeCloseTo(0.2);
        setMasterMuted(true);
        expect(await effects.play("Wolf", "attack", "muted")).toBe(false);
        expect(ui("notification")).toBe(false);
        setMasterMuted(false);
        const resurrection = resolveGameSound("resurrection");
        expect(await effects.playSource(resurrection, "resurrect", resurrection.key)).toBe(true);
        expect(audible.at(-1)).toBeCloseTo(0.2);
        expect(musicGain()).toBe(0);
    } finally {
        setMasterVolume(previous.masterVolume);
        setMasterMuted(previous.masterMuted);
        setEffectsVolume(previous.effectsVolume);
        setEffectsMuted(previous.effectsMuted);
        setMusicMuted(previous.musicMuted);
    }
});
