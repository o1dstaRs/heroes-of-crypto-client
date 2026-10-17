import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { verifyAnimationRelease, verifyProductionImageSources } from "./verify_animation_release";

const roots: string[] = [];

test("production imports cannot silently depend on artwork absent from the restore package", () => {
    const files = {
        "animations/output/creature/atlas/creature_idle_atlas.webp": { bytes: 1, sha256: "source" },
        "images/heal_256.webp": { bytes: 1, sha256: "source" },
    };
    expect(() => verifyProductionImageSources(["creature_idle_atlas.webp", "heal_256.webp"], files)).not.toThrow();
    expect(() => verifyProductionImageSources(["creature_idle_atlas.webp", "fireball_256.webp"], files)).toThrow(
        "fireball_256.webp",
    );
});
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

test("checks the final byte of an atlas spanning multiple read chunks", async () => {
    await mkdir("tmp", { recursive: true });
    const root = await mkdtemp(path.resolve("tmp/animation-release-chunks-"));
    roots.push(root);
    const images = path.join(root, "images");
    const animations = path.join(root, "animations");
    await mkdir(images);
    await mkdir(path.join(animations, "output"), { recursive: true });
    const bytes = Buffer.alloc(2 * 1024 * 1024 + 17, 0x7c);
    const file = path.join(images, "creature_idle_atlas.webp");
    const manifest = {
        "images/creature_idle_atlas.webp": {
            bytes: bytes.length,
            sha256: createHash("sha256").update(bytes).digest("hex"),
        },
    };
    const env = { HOC_IMAGES_LOC: images, HOC_ANIMATIONS_LOC: animations };
    await writeFile(file, bytes);
    await verifyAnimationRelease(env, manifest);
    bytes[bytes.length - 1] ^= 0xff;
    await writeFile(file, bytes);
    await expect(verifyAnimationRelease(env, manifest)).rejects.toThrow("SHA-256 mismatch");
});
