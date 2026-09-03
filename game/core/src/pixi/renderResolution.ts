/** A 1440p backing buffer remains sharper than the board art and bounds every full-screen render target. */
export const MAX_RENDER_PIXELS = 2560 * 1440;
/** At native 1080p and above, physical pixel density already keeps geometry edges clean without MSAA. */
export const MAX_MSAA_RENDER_PIXELS = 1920 * 1080;

/**
 * Keep small Retina viewports at 2x while preventing large/high-DPI displays from allocating multi-4K
 * color, depth and filter buffers. Pixi accepts fractional resolutions and keeps the canvas at its CSS
 * size, so the cap reduces GPU pixels without changing layout or gameplay coordinates.
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
 * Multisample antialiasing allocates another large color buffer. Retina density and large native canvases
 * already give Pixi enough physical pixels for clean edges, so reserve MSAA for small 1x layouts where an
 * individual pixel is visible and the extra buffer stays inexpensive.
 */
export const shouldUseRenderAntialias = (resolution: number, width = 1, height = 1): boolean => {
    if (!Number.isFinite(resolution)) return true;
    const safeWidth = Math.max(1, Number.isFinite(width) ? width : 1);
    const safeHeight = Math.max(1, Number.isFinite(height) ? height : 1);
    return resolution < 1.5 && safeWidth * resolution * safeHeight * resolution < MAX_MSAA_RENDER_PIXELS;
};
