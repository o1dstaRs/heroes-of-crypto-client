import { describe, expect, test } from "bun:test";

import { DOCK_PANEL_COLUMN_WIDTH, dockPanelWidth, shouldDismissOnOutsidePointer } from "./dockPanelBehaviour";

describe("social dock panel opens in place, not over everything", () => {
    test("follows the board's side column during a fight", () => {
        expect(dockPanelWidth(true, 420, "94vw")).toBe(DOCK_PANEL_COLUMN_WIDTH);
    });

    test("takes the asked-for width elsewhere, capped so a narrow window still fits it", () => {
        expect(dockPanelWidth(false, 420, "94vw")).toBe("min(420px, 94vw)");
        expect(dockPanelWidth(false, 480)).toBe("min(480px, 94vw)");
    });

    describe("clicking away closes it — the backdrop's old job, without the backdrop", () => {
        const base = { open: true, inGame: false, insidePanel: false, onDockButton: false };

        test("a click on the page behind closes it", () => {
            expect(shouldDismissOnOutsidePointer(base)).toBe(true);
        });

        test("a click inside the panel does not", () => {
            expect(shouldDismissOnOutsidePointer({ ...base, insidePanel: true })).toBe(false);
        });

        // The button toggles the panel itself. Dismissing here as well would close it on pointer-down
        // and let the button reopen it on click — the panel would appear stuck open.
        test("a click on the dock button that owns it does not", () => {
            expect(shouldDismissOnOutsidePointer({ ...base, onDockButton: true })).toBe(false);
        });

        // A click on the board is a move. Dismissing a friend list must never cost a turn.
        test("nothing is dismissed by a stray click during a fight", () => {
            expect(shouldDismissOnOutsidePointer({ ...base, inGame: true })).toBe(false);
            expect(shouldDismissOnOutsidePointer({ ...base, inGame: true, insidePanel: true })).toBe(false);
        });

        test("a closed panel is never asked to close again", () => {
            expect(shouldDismissOnOutsidePointer({ ...base, open: false })).toBe(false);
        });
    });
});
