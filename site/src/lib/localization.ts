import type { Language } from "./site-data";

export const factionDisplayNames: Record<Language, Record<string, string>> = {
    en: {
        Chaos: "Chaos",
        Life: "Life",
        Might: "Might",
        Nature: "Nature",
        Death: "Death",
    },
    ru: {
        Chaos: "Хаос",
        Life: "Жизнь",
        Might: "Сила",
        Nature: "Природа",
        Death: "Смерть",
    },
};

export function localizedFactionName(language: Language, faction: string) {
    return factionDisplayNames[language][faction] ?? faction;
}
