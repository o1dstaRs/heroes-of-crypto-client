/*
 * -----------------------------------------------------------------------------
 * This file is part of the game core of the Heroes of Crypto.
 *
 * Heroes of Crypto and Heroes of Crypto AI are registered trademarks.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 * -----------------------------------------------------------------------------
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

/**
 * A replaced scene must take its world-root children with it.
 *
 * The world root belongs to the pixiApp, and LoadGame destroys the scene while building the replacement
 * against that SAME app — so anything parented there outlives its owner. An orphan keeps painting its
 * last frame while the fresh scene clears only its own graphics, which is how a finished sandbox fight
 * left its movement area drawn over the next battle's placement board.
 *
 * Two of these were disposed by hand (dungeonVisuals, combatVisuals) and the other dozen were not — a
 * list kept by hand falls behind. Release is now driven from the single attach choke point, and these
 * pin that arrangement rather than re-enumerating the layers, which would just be the same list again.
 */
const sandboxSource = (): string => readFileSync(join(import.meta.dir, "Sandbox.ts"), "utf8");

describe("world-root attachments are released with the scene", () => {
    test("every attach is recorded at the one choke point", () => {
        const source = sandboxSource();
        const attach = source.slice(
            source.indexOf("private attachToWorldRoot("),
            source.indexOf("private releaseWorldRootAttachments("),
        );
        expect(attach).toContain("this.worldRootAttachments.add(obj)");
    });

    test("Destroy releases them, after the two disposers that own their own children", () => {
        const source = sandboxSource();
        const destroy = source.slice(
            source.indexOf("public override Destroy(): void {"),
            source.indexOf("private handleKeyDown ="),
        );
        expect(destroy).toContain("this.releaseWorldRootAttachments()");
        // Order matters only so the release skips already-destroyed children rather than double-freeing.
        expect(destroy.indexOf("this.dungeonVisuals?.destroy()")).toBeLessThan(
            destroy.indexOf("this.releaseWorldRootAttachments()"),
        );
    });

    test("release detaches AND frees, and tolerates an already-destroyed child", () => {
        const source = sandboxSource();
        const release = source.slice(source.indexOf("private releaseWorldRootAttachments("));
        const body = release.slice(0, release.indexOf("\n    }"));
        expect(body).toContain("removeFromParent()");
        expect(body).toContain("destroy({ children: true })");
        // dungeonVisuals/combatVisuals already freed theirs; destroying twice would throw.
        expect(body).toContain("if (!attachment.destroyed)");
        expect(body).toContain("this.worldRootAttachments.clear()");
    });

    test("no world-root child is left to a hand-maintained disposal list", () => {
        // If someone adds a layer, attachToWorldRoot records it automatically. The guard here is that the
        // helper stays the ONLY way anything reaches the root, so nothing can bypass the bookkeeping.
        const source = sandboxSource();
        const direct = source.match(/getWorldRoot\(\)\.addChild\(/g) ?? [];
        // The single permitted addChild lives inside attachToWorldRoot itself.
        const insideHelper =
            source
                .slice(
                    source.indexOf("private attachToWorldRoot("),
                    source.indexOf("private releaseWorldRootAttachments("),
                )
                .match(/worldRoot\.addChild\(/g) ?? [];
        expect(direct.length).toBe(0);
        expect(insideHelper.length).toBe(1);
    });
});
