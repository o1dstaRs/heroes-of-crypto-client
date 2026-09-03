/** A 4K backing buffer is already sharper than the game art and bounds every full-screen render target. */
export const MAX_RENDER_PIXELS = 3840 * 2160;

/**
 * Keep ordinary Retina viewports at 2x while preventing very large/high-DPI displays from allocating
 * multi-4K color, depth, antialias, and filter buffers. Pixi accepts fractional resolutions and keeps the
 * canvas at its CSS size, so the cap reduces GPU pixels without changing layout or gameplay coordinates.
 */
export const renderResolutionForViewport = (width: number, height: number, devicePixelRatio: number): number => {
    const safeWidth = Math.max(1, Number.isFinite(width) ? width : 1);
    const safeHeight = Math.max(1, Number.isFinite(height) ? height : 1);
    const safeDevicePixelRatio =
        Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? Math.min(devicePixelRatio, 2) : 1;
    const pixelBudgetResolution = Math.sqrt(MAX_RENDER_PIXELS / (safeWidth * safeHeight));
    return Math.max(1, Math.min(safeDevicePixelRatio, pixelBudgetResolution));
};

/**
 * Multisample antialiasing allocates another large color buffer. At Retina density the backing pixels
 * already smooth Pixi geometry when the browser composites the canvas, so MSAA costs memory for little
 * visible gain. Keep it for 1x / heavily capped layouts, where individual physical pixels are visible.
 */
export const shouldUseRenderAntialias = (resolution: number): boolean =>
    !Number.isFinite(resolution) || resolution < 1.5;
