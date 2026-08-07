import { useSyncExternalStore } from "react";

import { RU_TRANSLATIONS } from "./ru";

/**
 * Lightweight game-client i18n (owner 2026-08-06): the player picks a language in their profile and
 * the pick phase + in-game chrome render in it. English text doubles as the dictionary KEY — `t()`
 * falls back to the key itself, so untranslated (or brand-new) strings degrade to English instead of
 * breaking, and adopting a string is just wrapping the literal.
 *
 * The choice persists in localStorage for now; profile-document sync can layer on later without
 * changing any call site (setLanguage is the single write path).
 */
export interface SupportedLanguage {
    code: string;
    /** Native-script label, shown as-is in the picker. */
    label: string;
}

export const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = [
    { code: "en", label: "English" },
    { code: "ru", label: "Русский" },
];

export const DEFAULT_LANGUAGE = "en";

const STORAGE_KEY = "hoc:language";

const DICTIONARIES: Record<string, Record<string, string>> = {
    ru: RU_TRANSLATIONS,
};

const isSupported = (code: string | null | undefined): code is string =>
    !!code && SUPPORTED_LANGUAGES.some((language) => language.code === code);

let currentLanguage: string = (() => {
    try {
        const stored = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
        return isSupported(stored) ? stored : DEFAULT_LANGUAGE;
    } catch {
        return DEFAULT_LANGUAGE;
    }
})();

const listeners = new Set<() => void>();

export const getLanguage = (): string => currentLanguage;

export const setLanguage = (code: string): void => {
    if (!isSupported(code) || code === currentLanguage) {
        return;
    }
    currentLanguage = code;
    try {
        localStorage.setItem(STORAGE_KEY, code);
    } catch {
        // Storage may be unavailable (private mode); the in-memory choice still applies this session.
    }
    for (const listener of listeners) {
        listener();
    }
};

const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

/** Translate an English chrome string; unknown keys (or English itself) render verbatim. */
export const t = (english: string): string => {
    const dictionary = DICTIONARIES[currentLanguage];
    return dictionary?.[english] ?? english;
};

/** React binding: re-renders the caller when the language changes and returns the live `t`. */
export const useTranslation = (): { t: (english: string) => string; language: string } => {
    const language = useSyncExternalStore(subscribe, getLanguage, () => DEFAULT_LANGUAGE);
    return { t, language };
};
