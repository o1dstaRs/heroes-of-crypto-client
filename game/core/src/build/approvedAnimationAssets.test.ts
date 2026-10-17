import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { installApprovedAnimationAssets } from "./approvedAnimationAssets";

const temporaryRoots: string[] = [];
afterEach(() => {
    for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const fixture = () => {
    const root = mkdtempSync(path.join(tmpdir(), "hoc-approved-test-assets-"));
    temporaryRoots.push(root);
    const destination = path.join(root, "installed");
    const roots = { animation: path.join(root, "animation"), image: path.join(root, "image") };
    const assets = (["animation", "image"] as const).map((kind) => {
        const bytes = Buffer.from(`approved ${kind} bytes`);
        const asset = {
            key: `${kind}_asset`,
            kind,
            path: "nested/asset.webp",
            sha256: createHash("sha256").update(bytes).digest("hex"),
        };
        const source = path.join(roots[kind], asset.path);
        mkdirSync(path.dirname(source), { recursive: true });
        writeFileSync(source, bytes);
        return asset;
    });
    const installed = (index: number) => path.join(destination, `${assets[index].key}.webp`);
    return { assets, roots, destination, installed };
};

describe("approved animation assets for tests", () => {
    test("installs a clean checkout from both configured canonical roots", () => {
        const f = fixture();
        installApprovedAnimationAssets(f.assets, f.destination, f.roots, true);
        for (const [index, asset] of f.assets.entries()) {
            expect(readFileSync(f.installed(index))).toEqual(readFileSync(path.join(f.roots[asset.kind], asset.path)));
        }
    });

    test("reuses hash-verified installed bytes without accessing offline sources or rewriting them", () => {
        const f = fixture();
        installApprovedAnimationAssets(f.assets, f.destination, f.roots);
        for (const [index, asset] of f.assets.entries()) {
            rmSync(path.join(f.roots[asset.kind], asset.path));
            utimesSync(f.installed(index), 100, 100);
        }
        installApprovedAnimationAssets(f.assets, f.destination, f.roots, true);
        for (const [index, asset] of f.assets.entries()) {
            expect(
                createHash("sha256")
                    .update(readFileSync(f.installed(index)))
                    .digest("hex"),
            ).toBe(asset.sha256);
            expect(statSync(f.installed(index)).mtimeMs).toBe(100_000);
        }
    });

    test.each(["missing", "stale"])("repairs a %s installed asset while retaining approved neighbors", (state) => {
        const f = fixture();
        installApprovedAnimationAssets(f.assets, f.destination, f.roots);
        utimesSync(f.installed(1), 100, 100);
        if (state === "missing") rmSync(f.installed(0));
        else writeFileSync(f.installed(0), "unapproved bytes");
        installApprovedAnimationAssets(f.assets, f.destination, f.roots, true);
        expect(readFileSync(f.installed(0))).toEqual(readFileSync(path.join(f.roots.animation, f.assets[0].path)));
        expect(statSync(f.installed(1)).mtimeMs).toBe(100_000);
    });

    test("a manifest revision invalidates the previous installed bytes", () => {
        const f = fixture();
        installApprovedAnimationAssets(f.assets, f.destination, f.roots);
        const next = Buffer.from("new approved animation");
        f.assets[0].sha256 = createHash("sha256").update(next).digest("hex");
        writeFileSync(path.join(f.roots.animation, f.assets[0].path), next);
        installApprovedAnimationAssets(f.assets, f.destination, f.roots, true);
        expect(readFileSync(f.installed(0))).toEqual(next);
    });

    test("invalid local bytes never substitute for a missing approved source", () => {
        const f = fixture();
        installApprovedAnimationAssets(f.assets, f.destination, f.roots);
        writeFileSync(f.installed(0), "unapproved bytes");
        rmSync(path.join(f.roots.animation, f.assets[0].path));
        expect(() => installApprovedAnimationAssets(f.assets, f.destination, f.roots, true)).toThrow(
            "Missing approved animation asset",
        );
    });

    test("validates the complete package before copying an earlier valid source", () => {
        const f = fixture();
        writeFileSync(path.join(f.roots.image, f.assets[1].path), "unapproved bytes");
        expect(() => installApprovedAnimationAssets(f.assets, f.destination, f.roots, true)).toThrow(
            "Wrong revision of approved animation asset",
        );
        expect(existsSync(f.installed(0))).toBe(false);
    });

    test.each(["missing", "stale"])(
        "builds reject %s canonical art even when installed copies are approved",
        (state) => {
            const f = fixture();
            installApprovedAnimationAssets(f.assets, f.destination, f.roots);
            const canonical = path.join(f.roots.animation, f.assets[0].path);
            if (state === "missing") rmSync(canonical);
            else writeFileSync(canonical, "unapproved bytes");
            expect(() => installApprovedAnimationAssets(f.assets, f.destination, f.roots)).toThrow(
                state === "missing" ? "Missing approved animation asset" : "Wrong revision of approved animation asset",
            );
        },
    );
});
