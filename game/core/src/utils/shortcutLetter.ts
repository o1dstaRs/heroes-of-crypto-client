// Physical QWERTY letter for a shortcut. `code` is KeyS for both Latin S and Russian Ы.
// When `code` is absent, ЙЦУКЕН characters map by key position, not by how they look
// (Cyrillic е is the T key, not E).
const QWERTY = "qwertyuiopasdfghjklzxcvbnm";
const JCUKEN = "йцукенгшщзфывапролдячсмить";

const cyrillicToLatin = new Map<string, string>();
for (let index = 0; index < QWERTY.length; index++) {
    const cyrillic = JCUKEN[index];
    const latin = QWERTY[index];
    cyrillicToLatin.set(cyrillic, latin);
    cyrillicToLatin.set(cyrillic.toLocaleUpperCase("ru"), latin);
}

const latinFromChar = (char: string): string => {
    const code = char.charCodeAt(0);
    if (code >= 65 && code <= 90) return String.fromCharCode(code + 32);
    if (code >= 97 && code <= 122) return char;
    return "";
};

export const shortcutLetter = (event: { key?: string; code?: string }): string => {
    const code = event.code ?? "";
    if (code.length === 4 && code.startsWith("Key")) {
        const fromCode = latinFromChar(code[3]);
        if (fromCode) return fromCode;
    }

    const key = event.key ?? "";
    if (key.length !== 1) return "";
    return cyrillicToLatin.get(key) ?? latinFromChar(key);
};
