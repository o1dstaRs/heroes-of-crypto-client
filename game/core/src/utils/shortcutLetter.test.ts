import { describe, expect, test } from "bun:test";

import { shortcutLetter } from "./shortcutLetter";

const JCUKEN_PAIRS: ReadonlyArray<readonly [string, string]> = [
    ["й", "q"],
    ["ц", "w"],
    ["у", "e"],
    ["к", "r"],
    ["е", "t"],
    ["н", "y"],
    ["г", "u"],
    ["ш", "i"],
    ["щ", "o"],
    ["з", "p"],
    ["ф", "a"],
    ["ы", "s"],
    ["в", "d"],
    ["а", "f"],
    ["п", "g"],
    ["р", "h"],
    ["о", "j"],
    ["л", "k"],
    ["д", "l"],
    ["я", "z"],
    ["ч", "x"],
    ["с", "c"],
    ["м", "v"],
    ["и", "b"],
    ["т", "n"],
    ["ь", "m"],
];

describe("shortcutLetter", () => {
    test("uses the physical KeyA–KeyZ code, so Russian Ы is S", () => {
        expect(shortcutLetter({ key: "ы", code: "KeyS" })).toBe("s");
        expect(shortcutLetter({ key: "Ы", code: "KeyS" })).toBe("s");
        expect(shortcutLetter({ key: "к", code: "KeyR" })).toBe("r");
        expect(shortcutLetter({ key: "ф", code: "KeyA" })).toBe("a");
        expect(shortcutLetter({ key: "в", code: "KeyD" })).toBe("d");
        expect(shortcutLetter({ key: "с", code: "KeyC" })).toBe("c");
        expect(shortcutLetter({ key: "s", code: "KeyS" })).toBe("s");
        expect(shortcutLetter({ key: "S", code: "KeyS" })).toBe("s");
    });

    test("maps ЙЦУКЕН characters when the event has no physical code", () => {
        for (const [cyrillic, latin] of JCUKEN_PAIRS) {
            expect(shortcutLetter({ key: cyrillic })).toBe(latin);
            expect(shortcutLetter({ key: cyrillic.toLocaleUpperCase("ru") })).toBe(latin);
        }
    });

    test("keeps Latin letters and ignores keys that are not letters", () => {
        expect(shortcutLetter({ key: "s" })).toBe("s");
        expect(shortcutLetter({ key: "S" })).toBe("s");
        expect(shortcutLetter({ key: "Escape" })).toBe("");
        expect(shortcutLetter({ key: "Shift" })).toBe("");
        expect(shortcutLetter({ key: "ArrowLeft" })).toBe("");
        expect(shortcutLetter({ key: "Enter" })).toBe("");
        expect(shortcutLetter({ key: "1", code: "Digit1" })).toBe("");
        expect(shortcutLetter({ key: "х" })).toBe("");
        expect(shortcutLetter({ key: "ъ" })).toBe("");
        expect(shortcutLetter({ key: "ж" })).toBe("");
        expect(shortcutLetter({ key: "э" })).toBe("");
        expect(shortcutLetter({ key: "б" })).toBe("");
        expect(shortcutLetter({ key: "ю" })).toBe("");
        expect(shortcutLetter({ key: "." })).toBe("");
        expect(shortcutLetter({ key: "ё" })).toBe("");
    });

    test("does not treat Cyrillic lookalikes as the Latin letter they resemble", () => {
        expect(shortcutLetter({ key: "е" })).toBe("t");
        expect(shortcutLetter({ key: "у" })).toBe("e");
        expect(shortcutLetter({ key: "а" })).toBe("f");
        expect(shortcutLetter({ key: "о" })).toBe("j");
        expect(shortcutLetter({ key: "р" })).toBe("h");
        expect(shortcutLetter({ key: "с" })).toBe("c");
    });
});
