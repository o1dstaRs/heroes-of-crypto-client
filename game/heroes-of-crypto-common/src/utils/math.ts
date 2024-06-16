/*
 * -----------------------------------------------------------------------------
 * This file is part of the browser implementation of the Heroes of Crypto game client.
 *
 * Heroes of Crypto and Heroes of Crypto AI are registered trademarks.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 * -----------------------------------------------------------------------------
 */

/**
 * Enumeration of possible results of line intersection.
 */
enum EIntersectionType {
    TRUE_PARALLEL,
    COINCIDENT_PARTLY_OVERLAP,
    COINCIDENT_TOTAL_OVERLAP,
    COINCIDENT_NO_OVERLAP,
    INTERSECTION_OUTSIDE_SEGMENT,
    INTERSECTION_IN_ONE_SEGMENT,
    INTERSECTION_INSIDE_SEGMENT,
}

export interface XY {
    x: number;
    y: number;
}

export interface IXYDistance {
    xy: XY;
    distance: number;
}

export class Intersect2DResult {
    public intesectionType: EIntersectionType;

    public x?: number | null | undefined;

    public y?: number | null | undefined;

    public constructor(intesectionType: EIntersectionType, x?: number | null, y?: number) {
        this.intesectionType = intesectionType;
        this.x = x;
        this.y = y;
    }
}

export const getDistance = (positionA: XY, positionB: XY): number =>
    Math.sqrt((positionB.x - positionA.x) ** 2 + (positionB.y - positionA.y) ** 2);

export const minus = (p0: XY, p1: XY): XY => ({ x: p0.x - p1.x, y: p0.y - p1.y });

export const perpDot = (p0: XY, p1: XY): number => p0.x * p1.y - p0.y * p1.x;

export const matrixElementOrZero = (matrix: number[][], x: number, y: number): number => {
    if (!(y in matrix)) {
        return 0;
    }
    if (!(x in matrix[y])) {
        return 0;
    }
    return matrix[y][x];
};

export const intersect2D = (a0: XY, a1: XY, b0: XY, b1: XY): Intersect2DResult => {
    const a: XY = minus(a1, a0);
    const b: XY = minus(b1, b0);

    if (perpDot(a, b) === 0) {
        /* a and b are parallel */
        const u: XY = minus(b0, a0);
        if (perpDot(a, u) === 0) {
            /* check whether line segmens overlap or not */

            /* put B0 into line equation of a */
            let sB0: number;
            if (a.x !== 0) {
                sB0 = u.x / a.x;
            } else {
                sB0 = u.y / a.y;
            }

            /* put B1 into line equation of a */
            const u2: XY = minus(b1, a0);
            let sB1: number;
            if (a.x !== 0) {
                sB1 = u2.x / a.x;
            } else {
                sB1 = u2.y / a.y;
            }

            /* B0 or B1 or both is on and inside line segment a */
            if ((sB0 >= 0 && sB0 <= 1) || (sB1 >= 0 && sB1 <= 1)) {
                if (sB0 >= 0 && sB0 <= 1 && sB1 >= 0 && sB1 <= 1) {
                    return new Intersect2DResult(EIntersectionType.COINCIDENT_TOTAL_OVERLAP);
                }
                return new Intersect2DResult(EIntersectionType.COINCIDENT_PARTLY_OVERLAP);
            }
            return new Intersect2DResult(EIntersectionType.COINCIDENT_NO_OVERLAP);
        }

        return new Intersect2DResult(EIntersectionType.TRUE_PARALLEL);
    }
    /* not parallel */
    /* use first line for intersection point calculation */
    const u: XY = minus(b0, a0);

    const s: number = perpDot(b, u) / perpDot(b, a);
    const px: number = a0.x + s * a.x;
    const py: number = a0.y + s * a.y;

    /* use second line to calculate t */
    const u2: XY = minus(a0, b0);
    const t: number = perpDot(a, u2) / perpDot(a, b);

    if (s >= 0 && s <= 1 && t >= 0 && t <= 1) {
        return new Intersect2DResult(EIntersectionType.INTERSECTION_INSIDE_SEGMENT, px, py);
    }

    if ((s >= 0 && s <= 1) || (t >= 0 && t <= 1)) {
        return new Intersect2DResult(EIntersectionType.INTERSECTION_IN_ONE_SEGMENT, px, py);
    }

    return new Intersect2DResult(EIntersectionType.INTERSECTION_OUTSIDE_SEGMENT, px, py);
};

export const asc = (arr: number[]) => arr.sort((a, b) => a - b);

export const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);

export const mean = (arr: number[]) => sum(arr) / arr.length;

// sample standard deviation
export const std = (arr: number[]) => {
    const mu = mean(arr);
    const diffArr = arr.map((a) => (a - mu) ** 2);
    return Math.sqrt(sum(diffArr) / (arr.length - 1));
};

export const quantile = (arr: number[], q: number) => {
    const sorted = asc(arr);
    const pos = (sorted.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    if (sorted[base + 1] !== undefined) {
        return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
    }

    return sorted[base];
};

export const q25 = (arr: number[]) => quantile(arr, 0.25);

export const q50 = (arr: number[]) => quantile(arr, 0.5);

export const q75 = (arr: number[]) => quantile(arr, 0.75);

export const q90 = (arr: number[]) => quantile(arr, 0.9);
