import { describe, expect, it } from "bun:test";
import { AttackVals } from "@heroesofcrypto/common";

import { images } from "../../generated/image_imports";
import type { IHoverInfo } from "../../scenes/VisibleState";
import { cursorCss, resolveCursorMode } from "./useGameCursor";

describe("battlefield cursors", () => {
    it("uses the bow for a ranged aim even if the selected attack type is stale", () => {
        const hoverInfo = {
            isHoveringAttackTarget: true,
            attackType: AttackVals.MELEE,
            targetingCursor: "ranged",
        } as IHoverInfo;

        expect(resolveCursorMode(hoverInfo)).toBe("ranged");
        expect(cursorCss(resolveCursorMode(hoverInfo))).toBe(
            `url("${images.cursor_ranged}") 0 0, url("${images.cursor_default}") 0 0, auto`,
        );
    });

    it("uses the wand for a validated spell without requiring attack damage text", () => {
        const hoverInfo = { attackType: AttackVals.NO_ATTACK, targetingCursor: "magic" } as IHoverInfo;

        expect(resolveCursorMode(hoverInfo)).toBe("magic");
        expect(cursorCss(resolveCursorMode(hoverInfo))).toBe(
            `url("${images.cursor_magic}") 0 0, url("${images.cursor_default}") 0 0, auto`,
        );
    });

    it("keeps the themed pointer for melee even when the unit has range selected", () => {
        const hoverInfo = {
            isHoveringAttackTarget: true,
            attackType: AttackVals.RANGE,
        } as IHoverInfo;

        expect(resolveCursorMode(hoverInfo)).toBe("default");
        expect(cursorCss(resolveCursorMode(hoverInfo))).toBe(`url("${images.cursor_default}") 0 0, auto`);
    });

    it("returns to the ordinary pointer when targeting ends", () => {
        expect(resolveCursorMode(undefined)).toBe("default");
        expect(resolveCursorMode({ unitName: "Healer", attackType: AttackVals.MAGIC } as IHoverInfo)).toBe(
            "interactive",
        );
    });
});
