import { describe, expect, it, afterEach } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES, getLanguage, setLanguage, t, tf } from "./i18n";
import { RU_TRANSLATIONS } from "./ru";

afterEach(() => {
    setLanguage(DEFAULT_LANGUAGE);
});

/** Every literal key handed to t()/tf() in a directory — dynamic keys (t(variable)) are invisible here. */
const literalKeysUnder = (directory: string): string[] => {
    const keys: string[] = [];
    for (const file of readdirSync(directory).filter((name) => /\.tsx?$/.test(name) && !name.endsWith(".test.ts"))) {
        const source = readFileSync(join(directory, file), "utf8");
        for (const pattern of [/(?<![\w.])t\(\s*"((?:[^"\\]|\\.)*)"/g, /(?<![\w.])tf\(\s*"((?:[^"\\]|\\.)*)"/g]) {
            for (const match of source.matchAll(pattern)) {
                keys.push(match[1]);
            }
        }
    }
    return [...new Set(keys)];
};

describe("game-client i18n", () => {
    it("registers at least English and Russian, English first as the default", () => {
        expect(SUPPORTED_LANGUAGES[0].code).toBe("en");
        expect(SUPPORTED_LANGUAGES.map((l) => l.code)).toContain("ru");
        expect(DEFAULT_LANGUAGE).toBe("en");
    });

    it("renders English keys verbatim and switches to the picked language", () => {
        expect(t("Your turn")).toBe("Your turn");
        setLanguage("ru");
        expect(getLanguage()).toBe("ru");
        expect(t("Your turn")).toBe("Ваш ход");
        expect(t("Pick a creature")).toBe("Выберите существо");
    });

    it("falls back to the English key for untranslated strings and rejects unknown codes", () => {
        setLanguage("ru");
        expect(t("Some brand new chrome string")).toBe("Some brand new chrome string");
        setLanguage("xx");
        expect(getLanguage()).toBe("ru");
    });

    it("has no empty or identity Russian entries", () => {
        for (const [english, russian] of Object.entries(RU_TRANSLATIONS)) {
            expect(russian.trim().length).toBeGreaterThan(0);
            expect(russian).not.toBe(english);
        }
    });
});

describe("tf interpolation", () => {
    it("fills named slots and lets a translation reorder them", () => {
        expect(tf("{count} games", { count: 7 })).toBe("7 games");
        setLanguage("ru");
        // The Russian entry moves {count} to the end — the slot travels with it.
        expect(tf("{count} games", { count: 7 })).toBe("партий: 7");
    });

    it("leaves unsupplied slots verbatim instead of dropping them", () => {
        expect(tf("Level {level}: {description}", { level: 2 })).toBe("Level 2: {description}");
    });
});

describe("player portal localization", () => {
    // The portal hosts the language picker, so an untranslated key there reads as "the switch is broken".
    it("has a Russian entry for every literal key the portal renders", () => {
        const keys = literalKeysUnder(join(import.meta.dir, "..", "ui", "PlayerPortal"));
        expect(keys.length).toBeGreaterThan(50);
        expect(keys.filter((key) => !(key in RU_TRANSLATIONS))).toEqual([]);
    });
});
