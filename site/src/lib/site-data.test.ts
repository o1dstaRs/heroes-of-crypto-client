import { describe, expect, test } from "bun:test";

import { factionDisplayNames, localizedFactionName } from "./localization";
import { content, languageSwitchPath, localPath, pageSlugs, supportedLanguages, type PageSlug } from "./site-data";
import { factionOrder } from "./units-data";

const objectKeyPaths = (value: unknown, prefix = ""): string[] => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return [];
    }

    return Object.entries(value).flatMap(([key, child]) => {
        const path = prefix ? `${prefix}.${key}` : key;
        return [path, ...objectKeyPaths(child, path)];
    });
};

describe("localized site routes", () => {
    test("generates canonical English and Russian paths for every content page", () => {
        expect(new Set(pageSlugs).size).toBe(pageSlugs.length);

        for (const slug of pageSlugs) {
            const english = localPath("en", slug);
            const russian = localPath("ru", slug);
            const expectedSuffix = slug === "game" ? "/" : `/${slug}/`;

            expect(english).toBe(expectedSuffix);
            expect(russian).toBe(slug === "game" ? "/ru/" : `/ru/${slug}/`);
            expect(languageSwitchPath(english, "ru")).toBe(russian);
            expect(languageSwitchPath(russian, "en")).toBe(english);
        }
    });

    test("switches nested application and blog paths without duplicating locale prefixes", () => {
        const paths = ["/play/ranked/", "/blog/post-name/", "/auth/login/", "/profile/"];

        for (const path of paths) {
            const russian = languageSwitchPath(path, "ru");
            expect(russian).toBe(`/ru${path}`);
            expect(languageSwitchPath(russian, "ru")).toBe(russian);
            expect(languageSwitchPath(russian, "en")).toBe(path);
        }
    });
});

describe("localized content contract", () => {
    test("keeps the complete English and Russian content trees structurally aligned", () => {
        expect(supportedLanguages).toEqual(["en", "ru"]);
        expect(objectKeyPaths(content.en).sort()).toEqual(objectKeyPaths(content.ru).sort());
    });

    test("provides a translation for every faction displayed by the unit catalog", () => {
        for (const language of supportedLanguages) {
            for (const faction of factionOrder) {
                expect(factionDisplayNames[language][faction]).toBeTruthy();
                expect(localizedFactionName(language, faction)).toBe(factionDisplayNames[language][faction]);
            }
        }
        expect(localizedFactionName("ru", "Unknown faction")).toBe("Unknown faction");
    });

    test("has page copy for every generated slug in both languages", () => {
        for (const language of supportedLanguages) {
            for (const slug of pageSlugs) {
                const pageKey: PageSlug = slug;
                expect(content[language].pages[pageKey].title).toBeTruthy();
                expect(content[language].pages[pageKey].description).toBeTruthy();
            }
        }
    });
});
