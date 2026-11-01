import { describe, expect, mock, test } from "bun:test";

import { PixiGameManager } from "./PixiGameManager";
import type { PixiScene } from "./PixiScene";
import type { TouchBoardInput } from "./TouchBoardInput";
import { GAME_VIEWPORT_CHANGED, resolveGameViewport } from "../viewport/gameViewport";

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
    test("each preview owns its anchor and a toolbar confirmation does not reuse a board location", () => {
        const manager = new PixiGameManager();
        manager.m_scene = { getTouchInteractionKey: () => "turn-1" } as unknown as PixiScene;
        const anchor = { x: 500, y: 300 };
        manager.RequestTouchConfirmation("Attack", () => {}, anchor);
        anchor.x = 0;
        const first = manager.GetTouchActionPreview()!;
        expect(first.anchor).toEqual({ x: 500, y: 300 });
        first.anchor!.y = 0;
        expect(manager.GetTouchActionPreview()!.anchor).toEqual({ x: 500, y: 300 });
        manager.RequestTouchConfirmation("Attack", () => {}, { x: 700, y: 200 });
        expect(manager.GetTouchActionPreview()!.anchor).toEqual({ x: 700, y: 200 });
        manager.RequestTouchConfirmation("End turn?", () => {});
        expect(manager.GetTouchActionPreview()).toEqual({ label: "End turn?" });
        manager.CancelTouchAction();
        expect(manager.GetTouchActionPreview()).toBeNull();
    });
});

function touchFixture(rotated: boolean, zoom: number, label: string | null) {
    const prior = ["window", "document"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
    const physical = rotated ? { width: 390, height: 844 } : { width: 1180, height: 820 };
    const viewport = resolveGameViewport(physical.width, physical.height, true, true);
    const bodyRect = { left: 0, top: 0, ...physical };
    const window = Object.assign(new EventTarget(), {
        innerWidth: physical.width,
        innerHeight: physical.height,
        location: { pathname: "/" },
        matchMedia: () => ({ matches: true }),
    });
    const document = Object.assign(new EventTarget(), {
        documentElement: { clientWidth: physical.width, clientHeight: physical.height },
        body: { getBoundingClientRect: () => bodyRect },
    });
    Object.defineProperty(globalThis, "window", { configurable: true, value: window });
    Object.defineProperty(globalThis, "document", { configurable: true, value: document });
    const canvas = Object.assign(new EventTarget(), {
        width: viewport.width,
        height: viewport.height,
        style: {},
        getBoundingClientRect: () => ({
            left: (physical.width * (1 - zoom)) / 2,
            top: (physical.height * (1 - zoom)) / 2,
            width: physical.width * zoom,
            height: physical.height * zoom,
        }),
    });
    const wrapper = Object.assign(new EventTarget(), {
        clientWidth: viewport.width,
        clientHeight: viewport.height,
        getBoundingClientRect: () => bodyRect,
    });
    const scene = {
        getTouchInteractionKey: () => "turn-1",
        getTouchConfirmationLabel: () => label,
        isTouchInspectionOnly: () => false,
        clearLocalAimTarget: () => {},
        MouseMove: mock(() => {}),
        MouseDown: mock((_point: { x: number; y: number }) => {}),
        MouseUp: mock(() => {}),
    };
    const manager = new PixiGameManager();
    Object.assign(manager, {
        m_scene: scene,
        screenToWorld: (x: number, y: number) => ({ x, y }),
        UpdateHoverInfo: () => {},
    });
    Reflect.get(manager, "installTouchBoardInput").call(manager, canvas, canvas, wrapper);
    const input = Reflect.get(manager, "touchBoardInput") as TouchBoardInput;
    const anchor = { x: viewport.width * 0.7, y: viewport.height * 0.4 };
    const client = rotated ? { x: physical.width - anchor.y, y: anchor.x } : anchor;
    return {
        manager,
        scene,
        input,
        anchor,
        viewport,
        window,
        tap: () => {
            input.down(1, client, 0);
            input.up(1, 50);
        },
        restore: () => {
            for (const [key, descriptor] of prior) {
                if (descriptor) Object.defineProperty(globalThis, key, descriptor);
                else Reflect.deleteProperty(globalThis, key);
            }
        },
    };
}

test("a touch placement tap executes immediately once without creating a confirmation", () => {
    const f = touchFixture(false, 1, null);
    try {
        f.tap();
        expect(f.scene.MouseDown).toHaveBeenCalledTimes(1);
        expect(f.scene.MouseUp).toHaveBeenCalledTimes(1);
        expect(f.manager.GetTouchActionPreview()).toBeNull();
    } finally {
        f.restore();
    }
});

test.each([false, true])(
    "zoomed combat anchors to the page while executing the exact canvas target (rotated: %s)",
    (rotated) => {
        const f = touchFixture(rotated, 2, "Confirm action");
        try {
            f.tap();
            expect(f.scene.MouseDown).not.toHaveBeenCalled();
            expect(f.manager.GetTouchActionPreview()!.anchor!.x).toBeCloseTo(f.anchor.x);
            expect(f.manager.GetTouchActionPreview()!.anchor!.y).toBeCloseTo(f.anchor.y);
            f.manager.ConfirmTouchAction();
            const point = f.scene.MouseDown.mock.calls[0][0] as { x: number; y: number };
            expect(point.x).toBeCloseTo(f.viewport.width / 2 + (f.anchor.x - f.viewport.width / 2) / 2);
            expect(point.y).toBeCloseTo(f.viewport.height / 2 + (f.anchor.y - f.viewport.height / 2) / 2);
            expect(f.scene.MouseDown).toHaveBeenCalledTimes(1);
        } finally {
            f.restore();
        }
    },
);

test.each(["zoom", "resize", "orientation"])(
    "%s discards a board preview instead of confirming an obsolete location",
    (change) => {
        const f = touchFixture(false, 1, "Cast spell");
        try {
            f.tap();
            if (change === "zoom") f.input.zoomBy(2);
            else f.window.dispatchEvent(new Event(change === "resize" ? "resize" : GAME_VIEWPORT_CHANGED));
            expect(f.manager.GetTouchActionPreview()).toBeNull();
            f.manager.ConfirmTouchAction();
            expect(f.scene.MouseDown).not.toHaveBeenCalled();
        } finally {
            f.restore();
        }
    },
);
