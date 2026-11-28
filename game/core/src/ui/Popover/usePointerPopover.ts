import { useLayoutEffect, useRef } from "react";

import { usePixiManager } from "../../pixi/PixiGameManager";
import { pointInGameElement } from "../../viewport/gameViewport";
import { useGameLayout } from "../mobile/GameViewport";
import { popoverPositionAtPointer, type PopoverPointerPosition } from "./popoverPosition";

export function usePointerPopover(visible: boolean, boardOnly = false) {
    const manager = usePixiManager();
    const { touch, rotated } = useGameLayout();
    const ref = useRef<HTMLDivElement>(null);
    const mouse = useRef<PopoverPointerPosition | undefined>(undefined);

    useLayoutEffect(() => {
        const element = ref.current;
        const parent = element?.parentElement;
        if (!element || !parent) return;
        let pointer = boardOnly || touch ? manager.getBattlefieldPointer() : mouse.current;
        let frame = 0;
        const paint = () => {
            frame = 0;
            if (!visible || !pointer) {
                element.style.visibility = "hidden";
                return;
            }
            const viewport = { width: parent.clientWidth, height: parent.clientHeight };
            const anchor = pointInGameElement(
                pointer.x,
                pointer.y,
                parent.getBoundingClientRect(),
                viewport.width,
                viewport.height,
                rotated,
            );
            const position = popoverPositionAtPointer(
                anchor,
                { width: element.offsetWidth, height: element.offsetHeight },
                viewport,
            );
            element.style.transform = `translate3d(${position.x}px, ${position.y}px, 0)`;
            element.style.visibility = "visible";
        };
        const schedulePaint = () => {
            if (visible && !frame) frame = window.requestAnimationFrame(paint);
        };
        const move = (event: MouseEvent) => {
            pointer = mouse.current = { x: event.clientX, y: event.clientY };
            schedulePaint();
        };
        if (!boardOnly) window.addEventListener("mousemove", move);
        const connection =
            boardOnly || touch
                ? manager.onBattlefieldPointerChanged.connect((point) => {
                      pointer = point;
                      schedulePaint();
                  })
                : undefined;
        const observer = visible ? new ResizeObserver(schedulePaint) : undefined;
        observer?.observe(element);
        observer?.observe(parent);
        paint();
        return () => {
            window.removeEventListener("mousemove", move);
            connection?.disconnect();
            observer?.disconnect();
            if (frame) window.cancelAnimationFrame(frame);
        };
    }, [boardOnly, manager, rotated, touch, visible]);

    return ref;
}
