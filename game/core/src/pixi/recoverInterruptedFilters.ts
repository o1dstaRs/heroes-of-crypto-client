import { Texture, TexturePool } from "pixi.js";

interface IFilterSlot {
    skip: boolean;
    inputTexture: Texture | null;
    backTexture: Texture | null;
    outputRenderSurface?: unknown;
}

interface IInterruptedFilterSystem {
    _filterStackIndex: number;
    _filterStack: IFilterSlot[];
    _activeFilterData: IFilterSlot | null;
}

interface IFilterRenderer {
    filter?: IInterruptedFilterSystem;
    renderTarget?: { renderSurface: unknown };
}

const hasInterruptedFilters = (renderer: unknown): boolean =>
    ((renderer as IFilterRenderer | undefined)?.filter?._filterStackIndex ?? 0) !== 0;

/**
 * Every visible frame starts and ends with an empty filter stack. The entry check also covers failed
 * off-screen renders between ticker frames; the finally check covers throws AND silent unbalanced
 * pushes. Leave a balanced successful frame alone, including its cached filter slots and live textures.
 */
export const renderWithFilterRecovery = (renderer: unknown, render: () => void): void => {
    let completed = false;
    try {
        if (hasInterruptedFilters(renderer)) recoverInterruptedFilters(renderer);
        render();
        completed = true;
    } finally {
        if (!completed || hasInterruptedFilters(renderer)) recoverInterruptedFilters(renderer);
    }
};

/**
 * A failed draw can bypass FilterSystem.pop(). Pixi resets its render target and global uniforms on
 * the next render, but not its filter stack: subsequent frames then subtract an abandoned enclosing
 * filter's bounds, shifting the camera's contents away from the screen-space battlefield painting.
 *
 * Call only between renders, after a failure or when a completed render left an unbalanced stack.
 * These internals match our pinned Pixi 8.22; the real FilterSystem regression test deliberately checks
 * that contract when the dependency changes. Never call during a valid nested filter pass.
 */
export const recoverInterruptedFilters = (renderer: unknown): void => {
    const { filter, renderTarget } = (renderer as IFilterRenderer | undefined) ?? {};
    if (!filter) return;

    // push() can itself fail before replacing a slot's old inputTexture. Only reclaim inputs that
    // were actually bound, or served as the output of a nested filter in this interrupted frame.
    const boundTargets = new Set([renderTarget?.renderSurface, filter._activeFilterData?.outputRenderSurface]);
    for (let index = 0; index < filter._filterStackIndex; index++) {
        boundTargets.add(filter._filterStack[index]?.outputRenderSurface);
    }
    const abandoned = new Set<Texture>();
    for (let index = 0; index < filter._filterStackIndex; index++) {
        const slot = filter._filterStack[index];
        // Skipped slots may still hold last frame's textures, already returned and borrowed elsewhere.
        if (!slot || slot.skip) continue;
        if (slot.inputTexture && boundTargets.has(slot.inputTexture)) abandoned.add(slot.inputTexture);
    }

    filter._filterStackIndex = 0;
    filter._activeFilterData = null;
    for (const slot of filter._filterStack) {
        slot.inputTexture = null;
        slot.backTexture = null;
    }

    // Popped slots and partially allocated back buffers can refer to textures now leased by Text or
    // another effect; returning those would hand a live texture to two consumers.
    for (const texture of abandoned) {
        if (!texture.destroyed) TexturePool.returnTexture(texture);
    }
};
