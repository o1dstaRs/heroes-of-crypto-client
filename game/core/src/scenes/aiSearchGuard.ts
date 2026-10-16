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

let depth = 0;

/** True while a rollout is applying actions to the live board and will restore it. */
export function isAiSearchSimulating(): boolean {
    return depth > 0;
}

/** Skip Pixi side effects for the synchronous body, including a nested rollout. */
export function runAiSearchSimulation<T>(run: () => T): T {
    depth += 1;
    try {
        return run();
    } finally {
        depth -= 1;
    }
}
