import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { verifyAnimationRelease } from "./verify_animation_release";

const roots: string[] = [];
afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("accepts the pinned bytes and rejects stale or missing art before the build copies it", async () => {
    await mkdir("tmp", { recursive: true });
    const root = await mkdtemp(path.resolve("tmp/animation-release-"));
    roots.push(root);
    const images = path.join(root, "images");
    const animations = path.join(root, "animations");
    await mkdir(images);
    await mkdir(path.join(animations, "output"), { recursive: true });
    const file = path.join(images, "effect.webp");
    await writeFile(file, "approved");
    const manifest = {
        "images/effect.webp": { bytes: 8, sha256: createHash("sha256").update("approved").digest("hex") },
    };
    const env = { HOC_IMAGES_LOC: images, HOC_ANIMATIONS_LOC: animations };
    await verifyAnimationRelease(env, manifest);
    await writeFile(file, "outdated");
    await expect(verifyAnimationRelease(env, manifest)).rejects.toThrow("SHA-256 mismatch");
    await rm(file);
    await expect(verifyAnimationRelease(env, manifest)).rejects.toThrow("missing or outdated assets");
    await expect(verifyAnimationRelease(env, { "images/../escape": manifest["images/effect.webp"] })).rejects.toThrow(
        "invalid manifest path",
    );
});
