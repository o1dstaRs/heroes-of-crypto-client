import { describe, expect, it } from "bun:test";
import { AttackVals } from "@heroesofcrypto/common";

import { images } from "../../generated/image_imports";
import type { IHoverInfo } from "../../scenes/VisibleState";
import { cursorCss, resolveCursorMode, type CursorMode } from "./useGameCursor";

describe("attack aiming cursor", () => {
    it("keeps the standard game cursor visible while aiming", () => {
        const hoverInfo = { isHoveringAttackTarget: true, attackType: AttackVals.RANGE } as IHoverInfo;
        expect(resolveCursorMode(hoverInfo)).toBe("default");
        expect(cursorCss("default")).toContain(images.cursor_default);
        expect(cursorCss("default")).not.toContain(images.cursor_ranged);
        expect(cursorCss("default")).not.toBe("none");
    });

    it("also keeps it visible when the scene reports a stale melee attack type", () => {
        const hoverInfo = { isHoveringAttackTarget: true, attackType: AttackVals.MELEE } as IHoverInfo;
        expect(resolveCursorMode(hoverInfo)).toBe("default");
        expect(cursorCss(resolveCursorMode(hoverInfo))).not.toBe("none");
    });

    it("never maps any themed cursor mode to a hidden system cursor", () => {
        const modes: CursorMode[] = ["default", "interactive", "melee", "ranged", "magic"];
        for (const mode of modes) expect(cursorCss(mode)).not.toBe("none");
    });
});
