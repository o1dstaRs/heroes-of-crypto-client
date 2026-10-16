import { describe, expect, it } from "bun:test";
import { AttackVals } from "@heroesofcrypto/common";

import { images } from "../../generated/image_imports";
import type { IHoverInfo } from "../../scenes/VisibleState";
import { cursorCss, resolveCursorMode } from "./useGameCursor";

describe("ranged aiming cursor", () => {
    it("keeps the standard game cursor visible while aiming", () => {
        const hoverInfo = {
            isHoveringAttackTarget: true,
            attackType: AttackVals.RANGE,
        } as IHoverInfo;

        expect(resolveCursorMode(hoverInfo)).toBe("default");
        expect(cursorCss("default")).toContain(images.cursor_default);
        expect(cursorCss("default")).not.toContain(images.cursor_ranged);
        expect(cursorCss("default")).not.toBe("none");
    });

    it("also keeps it visible when the scene reports a stale melee attack type", () => {
        const hoverInfo = {
            isHoveringAttackTarget: true,
            attackType: AttackVals.MELEE,
        } as IHoverInfo;

        expect(resolveCursorMode(hoverInfo)).toBe("default");
        expect(cursorCss(resolveCursorMode(hoverInfo))).not.toBe("none");
    });
});
