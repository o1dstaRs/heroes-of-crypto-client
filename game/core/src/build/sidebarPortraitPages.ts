export const SIDEBAR_PAGE_RECIPE = { lossless: true, effort: 3 } as const;

export interface SidebarPageDescriptor {
    key: string;
    firstFrame: number;
    frameCount: number;
    cols: number;
    rows: number;
    bytes: number;
    sha256: string;
    releasePath: string;
}

export function sidebarPageLayout(frameCount: number, cols: number, maxFrames = 5) {
    if (![frameCount, cols, maxFrames].every((value) => Number.isInteger(value) && value > 0)) {
        throw new Error("Portrait frame counts and columns must be positive integers");
    }
    const pageCols = cols % 3 === 0 && cols < maxFrames * 2 ? Math.min(3, maxFrames) : Math.min(cols, maxFrames);
    const pages: Array<{ firstFrame: number; frameCount: number; sourceCol: number; sourceRow: number }> = [];
    for (let row = 0; row * cols < frameCount; row++) {
        for (let col = 0; col < cols && row * cols + col < frameCount; col += pageCols) {
            pages.push({
                firstFrame: row * cols + col,
                frameCount: Math.min(pageCols, cols - col, frameCount - row * cols - col),
                sourceCol: col,
                sourceRow: row,
            });
        }
    }
    return pages;
}

/** Exact alpha and a conservative visible-pixel quality floor; transparent RGB does not affect the art. */
export function sidebarPageQuality(source: Buffer, encoded: Buffer): { alphaExact: boolean; psnr: number } {
    if (source.length !== encoded.length || source.length % 4 !== 0) throw new Error("Mismatched RGBA canvases");
    let alphaExact = true;
    let squaredError = 0;
    let weight = 0;
    for (let i = 0; i < source.length; i += 4) {
        if (source[i + 3] !== encoded[i + 3]) alphaExact = false;
        const alpha = source[i + 3] / 255;
        if (!alpha) continue;
        for (let channel = 0; channel < 3; channel++) {
            squaredError += (source[i + channel] - encoded[i + channel]) ** 2 * alpha;
            weight += alpha;
        }
    }
    return { alphaExact, psnr: squaredError === 0 ? Infinity : 10 * Math.log10((255 ** 2 * weight) / squaredError) };
}
