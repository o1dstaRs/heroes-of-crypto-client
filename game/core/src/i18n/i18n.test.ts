import { describe, expect, it, afterEach } from "bun:test";

import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES, getLanguage, setLanguage, t } from "./i18n";
import { RU_TRANSLATIONS } from "./ru";

afterEach(() => {
    setLanguage(DEFAULT_LANGUAGE);
});

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
