import { HoCConfig } from "@heroesofcrypto/common";

import { getLanguage } from "./i18n";
import { abilityDescriptionRuTemplates } from "./ruAbilityDescriptions";

/** Use the game’s live values when its description follows the shared ability template. */
export function localizeAbilityDescription(name: string, english: string): string {
    const translation = abilityDescriptionRuTemplates[name];
    if (getLanguage() !== "ru" || !translation) return english;
    try {
        const template = HoCConfig.getAbilityConfig(name).desc.join(" ").trim().replace(/\s+/g, " ");
        const fields = template.split("{}").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
        const russian = translation.join("\n");
        if (fields.length !== russian.split("{}").length) return english;
        const match = new RegExp(`^${fields.join("([+-]?[0-9]+(?:[.,][0-9]+)?)")}$`).exec(
            english.trim().replace(/\s+/g, " "),
        );
        if (!match) return english;
        let index = 0;
        return russian.replaceAll("{}", () => match[++index]);
    } catch {
        return english;
    }
}
