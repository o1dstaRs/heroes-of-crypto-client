import { describe, expect, mock, test } from "bun:test";

import { PixiGameManager } from "./PixiGameManager";
import type { PixiScene } from "./PixiScene";

describe("touch action confirmations", () => {
    test("a preview cannot execute until explicitly confirmed and only executes once", () => {
        const manager = new PixiGameManager();
        manager.m_scene = { getTouchInteractionKey: () => "turn-1" } as unknown as PixiScene;
        const run = mock(() => {});
        manager.RequestTouchConfirmation("Confirm action", run);
        expect(run).not.toHaveBeenCalled();
        expect(manager.GetTouchActionLabel()).toBe("Confirm action");
        manager.ConfirmTouchAction();
        manager.ConfirmTouchAction();
        expect(run).toHaveBeenCalledTimes(1);
        expect(manager.GetTouchActionLabel()).toBeNull();
    });
    test("a changed turn, selection or scene invalidates the pending action", () => {
        const manager = new PixiGameManager();
        let key = "turn-1";
        manager.m_scene = { getTouchInteractionKey: () => key } as unknown as PixiScene;
        const run = mock(() => {});
        manager.RequestTouchConfirmation("End turn?", run);
        key = "turn-2";
        manager.ConfirmTouchAction();
        manager.RequestTouchConfirmation("Split selected stack?", run);
        manager.m_scene = { getTouchInteractionKey: () => key } as unknown as PixiScene;
        manager.ConfirmTouchAction();
        expect(run).not.toHaveBeenCalled();
    });
    test("cancelling or replacing a preview never executes the abandoned action", () => {
        const manager = new PixiGameManager();
        manager.m_scene = { getTouchInteractionKey: () => "turn-1" } as unknown as PixiScene;
        const abandoned = mock(() => {});
        const selected = mock(() => {});
        manager.RequestTouchConfirmation("Move", abandoned);
        manager.CancelTouchAction();
        manager.ConfirmTouchAction();
        manager.RequestTouchConfirmation("Move", abandoned);
        manager.RequestTouchConfirmation("Attack", selected);
        manager.ConfirmTouchAction();
        expect(abandoned).not.toHaveBeenCalled();
        expect(selected).toHaveBeenCalledTimes(1);
    });
});
