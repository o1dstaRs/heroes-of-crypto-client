import { describe, expect, test } from "bun:test";

import {
    EXIT_FIGHT_BUTTON_MAX_WIDTH_PX,
    EXIT_FIGHT_FULLSCREEN_SIDE_GAP_PX,
    exitFightButtonSx,
    fullscreenExitFightButtonSx,
} from "./exitFightButtonSx";
import { FULLSCREEN_PRESENTATION_ATTRIBUTE } from "./fullscreen";

describe("exit-fight button", () => {
    test("expands in fullscreen while preserving equal side gaps", () => {
        expect(EXIT_FIGHT_BUTTON_MAX_WIDTH_PX).toBe(209);
        expect(EXIT_FIGHT_FULLSCREEN_SIDE_GAP_PX).toBe(22);
        expect(exitFightButtonSx(false).width).toBe("min(100%, 209px)");
        expect(exitFightButtonSx(true).width).toBe("min(209px, calc(100% - 44px))");
        expect(exitFightButtonSx(true).inlineSize).toBe("min(209px, calc(100% - 44px))");
        expect(exitFightButtonSx(true).minWidth).toBe(0);
        expect(exitFightButtonSx(true).maxWidth).toBe("209px");
        expect(exitFightButtonSx(false)[`html[${FULLSCREEN_PRESENTATION_ATTRIBUTE}="true"] &`]).toBe(
            fullscreenExitFightButtonSx,
        );
        expect(exitFightButtonSx(false)["html:fullscreen &"]).toBe(fullscreenExitFightButtonSx);
        expect(exitFightButtonSx(false)["html:-webkit-full-screen &"]).toBe(fullscreenExitFightButtonSx);
        expect(exitFightButtonSx(true).whiteSpace).toBe("nowrap");
        expect(exitFightButtonSx(true).height).toBe("35.2px");
    });
});
