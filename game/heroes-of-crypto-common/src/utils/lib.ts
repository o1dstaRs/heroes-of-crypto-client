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

import { randomInt } from "crypto";

export function shuffle<T>(array: T[]): T[] {
    let currentIndex = array.length;
    let randomIndex;

    // While there remain elements to shuffle.
    while (currentIndex > 0) {
        // Pick a remaining element.
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;

        // And swap it with the current element.
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }

    return array;
}

export function matrixElement(matrix: number[][], x: number, y: number): number {
    if (!(y in matrix)) {
        return 0;
    }
    if (!(x in matrix[y])) {
        return 0;
    }
    return matrix[y][x];
}

export function removeItemOnce<T>(arr: T[], value: T): boolean {
    const index = arr.indexOf(value);
    let removed = false;
    if (index > -1) {
        arr.splice(index, 1);
        removed = true;
    }
    return removed;
}

export function getRandomInt(min: number, max: number): number {
    if (typeof window !== "undefined" && typeof window.document !== "undefined") {
        const crypto = window.crypto || (window as any).msCrypto; // For IE11 compatibility
        const range = max - min;
        const maxByteValue = 256;

        if (range <= 0) {
            throw new Error("Max must be greater than min");
        }

        const byteArray = new Uint8Array(1);
        let randomValue: number;

        do {
            crypto.getRandomValues(byteArray);
            [randomValue] = byteArray;
        } while (randomValue >= Math.floor(maxByteValue / range) * range);

        return min + (randomValue % range);
    }

    return randomInt(min, max);
}

export function isBrowser(): boolean {
    return typeof window !== "undefined" && typeof window.document !== "undefined";
}

export function getTimeMillis(): number {
    if (typeof window !== "undefined" && typeof window.document !== "undefined") {
        return window.performance.now();
    }

    return Math.floor(Number(process.hrtime.bigint()) / 1000000);
}
