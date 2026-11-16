import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import { expect, test } from "bun:test";
import { Doctrine } from "@heroesofcrypto/common";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server.node";

import { getPreGameDoctrine, setPreGameDoctrine } from "../../utils/preGameDoctrine";
import { NextAiDoctrinePicker } from "./NextAiDoctrinePicker";

const render = (disabled = false) =>
    renderToStaticMarkup(
        <CacheProvider value={createCache({ key: "next-doctrine" })}>
            <NextAiDoctrinePicker disabled={disabled} />
        </CacheProvider>,
    );

test("the rematch chooser restores the doctrine the next draft will submit, in the lobby's A/B/C order", () => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    const saved = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: {
            getItem: (key: string) => saved.get(key) ?? null,
            setItem: (key: string, value: string) => saved.set(key, value),
        },
    });
    try {
        for (const [doctrine, letter, name] of [
            [Doctrine.Doctrine.SEE_ALL, "A", "Spymaster"],
            [Doctrine.Doctrine.THREE_REVEALS, "B", "Scout"],
            [Doctrine.Doctrine.SEE_NONE, "C", "Battle Trance"],
        ] as const) {
            setPreGameDoctrine(doctrine);
            expect(getPreGameDoctrine()).toBe(doctrine);
            const html = render();
            const radios = [...html.matchAll(/<button\b[^>]*role="radio"[^>]*>/g)].map(([button]) => button);
            expect(radios).toHaveLength(3);
            expect(radios.filter((button) => button.includes('aria-checked="true"'))).toHaveLength(1);
            const selected = radios.find((button) => button.includes('aria-checked="true"'))!;
            expect(selected).toContain(`aria-label="${letter} · ${name}"`);
            expect(selected).toContain('tabindex="0"');
            expect(html.indexOf('aria-label="A · Spymaster"')).toBeLessThan(html.indexOf('aria-label="B · Scout"'));
            expect(html.indexOf('aria-label="B · Scout"')).toBeLessThan(html.indexOf('aria-label="C · Battle Trance"'));
            expect(html).toContain('role="radiogroup" aria-label="Doctrine for next AI game"');
        }
        const disabled = [...render(true).matchAll(/<button\b[^>]*role="radio"[^>]*>/g)];
        expect(disabled).toHaveLength(3);
        expect(disabled.every(([button]) => button.includes('disabled=""'))).toBe(true);
    } finally {
        if (previous) Object.defineProperty(globalThis, "localStorage", previous);
        else Reflect.deleteProperty(globalThis, "localStorage");
    }
});
