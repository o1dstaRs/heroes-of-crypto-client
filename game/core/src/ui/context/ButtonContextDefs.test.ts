import { describe, expect, test } from "bun:test";

import { VisibleButtonState, type IVisibleButton } from "../../scenes/VisibleState";
import { spectatorButtons } from "./ButtonContextDefs";

const button = (name: string, isDisabled: boolean): IVisibleButton => ({
    name,
    text: name,
    state: VisibleButtonState.FIRST,
    isVisible: true,
    isDisabled,
    numberOfOptions: 1,
    selectedOption: 1,
});

describe("spectatorButtons", () => {
    test("disables every fight-management button without hiding any", () => {
        const watched = spectatorButtons([button("Hourglass", false), button("AI", false), button("LuckShield", true)]);

        expect(watched.map(({ name, isVisible, isDisabled }) => [name, isVisible, isDisabled])).toEqual([
            ["Hourglass", true, true],
            ["AI", true, true],
            ["LuckShield", true, true],
        ]);
    });

    test("leaves the scene's own button state untouched", () => {
        const published = [button("Next", false)];

        spectatorButtons(published);

        expect(published[0].isDisabled).toBe(false);
    });
});
