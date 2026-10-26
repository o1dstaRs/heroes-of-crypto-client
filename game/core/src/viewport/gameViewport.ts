export interface GameViewport {
    width: number;
    height: number;
    physicalWidth: number;
    physicalHeight: number;
    touch: boolean;
    rotated: boolean;
}

let touchGameActive = false;
let touchInsets = { top: 0, bottom: 0 };
export const isTouchGameActive = (): boolean => touchGameActive;
export const getTouchGameInsets = (): { top: number; bottom: number } => touchInsets;
export const setTouchGameInsets = (insets: { top: number; bottom: number }): void => {
    touchInsets = insets;
};
export const setTouchGameActive = (active: boolean): void => {
    touchGameActive = active;
};

export const isGameplayPath = (path: string): boolean =>
    path === "/" ||
    /^\/(game|sandbox)\//.test(path) ||
    /^\/preview\/(picks|augments|placement|matchup)(\/|$)/.test(path);

export const resolveGameViewport = (
    width: number,
    height: number,
    coarsePointer: boolean,
    gameplay: boolean,
): GameViewport => {
    const touch = gameplay && coarsePointer && Math.min(width, height) <= 1100;
    const rotated = touch && height > width;
    return {
        width: rotated ? height : width,
        height: rotated ? width : height,
        physicalWidth: width,
        physicalHeight: height,
        touch,
        rotated,
    };
};

export const readGameViewport = (): GameViewport => {
    if (typeof window === "undefined") return resolveGameViewport(1366, 768, false, false);
    const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    // Mobile innerWidth can include the unrotated surface's overflow. The layout viewport stays stable.
    const width = coarse
        ? Math.min(window.innerWidth, document.documentElement.clientWidth || window.innerWidth)
        : window.innerWidth;
    const height = coarse
        ? Math.min(window.innerHeight, document.documentElement.clientHeight || window.innerHeight)
        : window.innerHeight;
    return resolveGameViewport(width, height, coarse, isGameplayPath(window.location?.pathname ?? ""));
};

/** Input coordinates must undo the landscape rotation as well as any board zoom. */
export const pointInGameElement = (
    clientX: number,
    clientY: number,
    rect: Pick<DOMRect, "left" | "top" | "width" | "height">,
    width: number,
    height: number,
    rotated: boolean,
): { x: number; y: number } =>
    rotated
        ? { x: ((clientY - rect.top) / rect.height) * width, y: (1 - (clientX - rect.left) / rect.width) * height }
        : { x: ((clientX - rect.left) / rect.width) * width, y: ((clientY - rect.top) / rect.height) * height };
