import React, { createContext, useContext, useEffect, useLayoutEffect, useState } from "react";
import { useLocation } from "react-router";
import { boardFitSideGutter } from "../../pixi/boardFit";
import { touchGameSkin } from "./touchGameSkin";

import {
    readGameViewport,
    hasTouchSideDock,
    setTouchGameActive,
    setTouchGameInsets,
    GAME_VIEWPORT_CHANGED,
    TOUCH_TOPBAR_HEIGHT,
    TOUCH_ACTIONBAR_HEIGHT,
    TOUCH_SIDE_DOCK_WIDTH,
    type GameViewport as Viewport,
} from "../../viewport/gameViewport";

interface GameLayout extends Viewport {
    panel: "unit" | "army" | null;
    setPanel: (panel: "unit" | "army" | null) => void;
}

const GameLayoutContext = createContext<GameLayout>({ ...readGameViewport(), panel: null, setPanel: () => {} });
export const useGameLayout = (): GameLayout => useContext(GameLayoutContext);

export const GameViewport: React.FC<{ children: (size: Viewport) => React.ReactNode }> = ({ children }) => {
    const { pathname } = useLocation();
    const [viewport, setViewport] = useState(readGameViewport);
    const [panel, setPanel] = useState<GameLayout["panel"]>(null);

    useLayoutEffect(() => {
        const update = () => setViewport(readGameViewport());
        const media = window.matchMedia("(pointer: coarse)");
        update();
        window.addEventListener("resize", update);
        window.visualViewport?.addEventListener("resize", update);
        document.addEventListener("fullscreenchange", update);
        media.addEventListener("change", update);
        return () => {
            window.removeEventListener("resize", update);
            window.visualViewport?.removeEventListener("resize", update);
            document.removeEventListener("fullscreenchange", update);
            media.removeEventListener("change", update);
        };
    }, [pathname]);

    useLayoutEffect(() => {
        setTouchGameActive(viewport.touch);
        if (!viewport.touch) {
            window.dispatchEvent(new Event(GAME_VIEWPORT_CHANGED));
            return () => setTouchGameActive(false);
        }
        const body = document.body;
        document.documentElement.dataset.hocTouchGame = "true";
        body.dataset.hocTouchGame = "true";
        body.dataset.hocTouchSideDock = String(hasTouchSideDock(viewport.width, viewport.height));
        body.dataset.hocGameRotated = String(viewport.rotated);
        body.style.setProperty("--hoc-game-width", `${viewport.width}px`);
        body.style.setProperty("--hoc-game-height", `${viewport.height}px`);
        body.style.setProperty("--hoc-physical-width", `${viewport.physicalWidth}px`);
        body.style.setProperty("--hoc-touch-topbar-height", `${TOUCH_TOPBAR_HEIGHT}px`);
        body.style.setProperty("--hoc-touch-actionbar-height", `${TOUCH_ACTIONBAR_HEIGHT}px`);
        body.style.setProperty("--hoc-touch-side-dock-width", `${TOUCH_SIDE_DOCK_WIDTH}px`);
        for (const [property, value] of Object.entries(touchGameSkin)) body.style.setProperty(property, value);
        const style = getComputedStyle(body);
        const insets = {
            top: parseFloat(style.getPropertyValue("--hoc-safe-top")) || 0,
            bottom: parseFloat(style.getPropertyValue("--hoc-safe-bottom")) || 0,
            left: parseFloat(style.getPropertyValue("--hoc-safe-left")) || 0,
            right: parseFloat(style.getPropertyValue("--hoc-safe-right")) || 0,
        };
        setTouchGameInsets(insets);
        // Prefer thumb-reachable actions beside the fitted floor. On tighter views the buttons sit over the wall.
        const actionWidth = Math.floor(boardFitSideGutter(viewport.width, viewport.height) - insets.right - 4);
        const safeHeight = viewport.height - insets.top - insets.bottom;
        const actionColumns =
            actionWidth >= 90 && safeHeight >= 290 ? 2 : actionWidth >= 44 && safeHeight >= 420 ? 1 : 0;
        body.dataset.hocTouchActionColumns = String(actionColumns);
        if (actionColumns) {
            body.style.setProperty("--hoc-touch-action-columns", String(actionColumns));
            body.style.setProperty(
                "--hoc-touch-action-width",
                `${Math.min(actionWidth, actionColumns === 1 ? 64 : 116)}px`,
            );
        }
        // A pointer/orientation change can keep the same canvas dimensions. Notify Pixi after the
        // touch state and safe areas are current; a ResizeObserver alone misses that transition.
        window.dispatchEvent(new Event(GAME_VIEWPORT_CHANGED));
        return () => {
            setTouchGameActive(false);
            setTouchGameInsets({ top: 0, bottom: 0 });
            delete document.documentElement.dataset.hocTouchGame;
            delete body.dataset.hocTouchGame;
            delete body.dataset.hocTouchSideDock;
            delete body.dataset.hocTouchActionColumns;
            delete body.dataset.hocGameRotated;
            for (const property of [
                "--hoc-game-width",
                "--hoc-game-height",
                "--hoc-physical-width",
                "--hoc-touch-topbar-height",
                "--hoc-touch-actionbar-height",
                "--hoc-touch-side-dock-width",
                "--hoc-touch-action-columns",
                "--hoc-touch-action-width",
            ]) {
                body.style.removeProperty(property);
            }
            for (const property of Object.keys(touchGameSkin)) body.style.removeProperty(property);
        };
    }, [viewport]);

    useEffect(() => setPanel(null), [pathname, viewport.rotated]);

    return (
        <GameLayoutContext.Provider value={{ ...viewport, panel, setPanel }}>
            {children(viewport)}
        </GameLayoutContext.Provider>
    );
};
