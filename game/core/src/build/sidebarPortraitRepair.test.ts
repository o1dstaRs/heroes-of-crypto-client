import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import {
    applySidebarPortraitRepair,
    decodeSidebarPortraitRepair,
    type SidebarPortraitRepair,
} from "./sidebarPortraitRepair";

function fixture(modify?: (data: Buffer) => Buffer) {
    const data = Buffer.alloc(44);
    data.write("HPR1");
    [3, 2, 3, 1, 0].forEach((value, i) => data.writeUInt32LE(value, 4 + i * 4));
    data.set([13, 25, 50, 255], 24);
    data.writeUInt32LE(1, 28);
    data.writeUInt32LE(1, 32);
    data.set([80, 60, 40, 255], 36);
    const payload = modify?.(data) ?? data;
    const compressed = deflateSync(payload);
    const descriptor: SidebarPortraitRepair = {
        format: "normalized-rgba-replace-v1",
        path: "patch.zlib",
        bytes: compressed.length,
        sha256: createHash("sha256").update(compressed).digest("hex"),
        decodedBytes: payload.length,
        frameCount: 3,
    };
    return { compressed, descriptor, patch: () => decodeSidebarPortraitRepair(compressed, descriptor, 3, 2) };
}

test("repairs preserve frame and row order on a multi-frame page", () => {
    const page = Buffer.alloc(3 * 2 * 2 * 4);
    applySidebarPortraitRepair(page, fixture().patch(), 3, 2, 0, 2);
    expect([...page.subarray(0, 4)]).toEqual([13, 25, 50, 255]);
    expect([...page.subarray(16, 20)]).toEqual([80, 60, 40, 255]);
    expect([...page.subarray(24)]).toEqual(Array(24).fill(0));
});

test("a later page applies only its own frames", () => {
    const page = Buffer.alloc(24, 99);
    applySidebarPortraitRepair(page, fixture().patch(), 3, 2, 1, 1);
    expect([...page.subarray(4, 8)]).toEqual([80, 60, 40, 255]);
    expect([...page.subarray(0, 4)]).toEqual([99, 99, 99, 99]);
});

test("transparent source RGB is normalized and neighbouring slice bytes survive", () => {
    const container = Buffer.alloc(26, 88),
        page = container.subarray(1, 25);
    page.fill(0);
    page.set([250, 12, 90, 0], 8);
    applySidebarPortraitRepair(page, fixture().patch(), 3, 2, 1, 1);
    expect([...page.subarray(8, 12)]).toEqual([0, 0, 0, 0]);
    expect(container[0]).toBe(88);
    expect(container[25]).toBe(88);
});

test("corrupt identity, geometry and bounded decompression fail closed", () => {
    const f = fixture();
    expect(() => decodeSidebarPortraitRepair(f.compressed.subarray(1), f.descriptor, 3, 2)).toThrow();
    expect(() => decodeSidebarPortraitRepair(f.compressed, { ...f.descriptor, sha256: "bad" }, 3, 2)).toThrow();
    expect(() => decodeSidebarPortraitRepair(f.compressed, { ...f.descriptor, frameCount: 4 }, 3, 2)).toThrow();
    expect(() => decodeSidebarPortraitRepair(f.compressed, { ...f.descriptor, decodedBytes: 20 }, 3, 2)).toThrow();
});

test("truncated, trailing, duplicate and out-of-range pixel records are rejected", () => {
    expect(() => fixture((d) => d.subarray(0, 40)).patch()).toThrow();
    expect(() => fixture((d) => Buffer.concat([d, Buffer.alloc(1)])).patch()).toThrow();
    expect(() =>
        fixture((d) => {
            d.writeUInt32LE(6, 20);
            return d;
        }).patch(),
    ).toThrow();
    expect(() =>
        fixture((d) => {
            const x = Buffer.concat([d.subarray(0, 28), d.subarray(20, 28), d.subarray(28)]);
            x.writeUInt32LE(2, 16);
            return x;
        }).patch(),
    ).toThrow();
});

test("page bounds and invalid geometry never sample another pose", () => {
    const patch = fixture().patch();
    for (const firstFrame of [-1, 0.5, 3])
        expect(() => applySidebarPortraitRepair(Buffer.alloc(24), patch, 3, 2, firstFrame, 1)).toThrow();
    expect(() => applySidebarPortraitRepair(Buffer.alloc(24), patch, 0, 2, 0, 1)).toThrow();
    expect(() => applySidebarPortraitRepair(Buffer.alloc(20), patch, 3, 2, 0, 1)).toThrow();
});
