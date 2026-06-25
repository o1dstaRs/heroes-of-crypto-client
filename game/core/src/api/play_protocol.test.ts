import { describe, expect, test } from "bun:test";

import { decodePlaySnapshot } from "./play_protocol";

const encodeVarint = (value: number | bigint): number[] => {
    const bytes: number[] = [];
    let nextValue = BigInt(value);
    while (nextValue > 0x7fn) {
        bytes.push(Number((nextValue & 0x7fn) | 0x80n));
        nextValue >>= 7n;
    }
    bytes.push(Number(nextValue));
    return bytes;
};

const tag = (field: number, wireType: number): number[] => encodeVarint((field << 3) | wireType);

const stringField = (field: number, value: string): number[] => {
    const encoded = new TextEncoder().encode(value);
    return [...tag(field, 2), ...encodeVarint(encoded.length), ...encoded];
};

const messageField = (field: number, value: number[]): number[] => [
    ...tag(field, 2),
    ...encodeVarint(value.length),
    ...value,
];

const floatField = (field: number, value: number): number[] => {
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setFloat32(0, value, true);
    return [...tag(field, 5), ...bytes];
};

describe("play protobuf decoder", () => {
    test("decodes unit speed from protobuf float fields", () => {
        const unit = [...stringField(1, "unit-1"), ...floatField(13, 2.5)];
        const snapshot = new Uint8Array([...stringField(1, "game-1"), ...messageField(12, unit)]);

        const decoded = decodePlaySnapshot(snapshot);

        expect(decoded.gameId).toBe("game-1");
        expect(decoded.units[0]?.id).toBe("unit-1");
        expect(decoded.units[0]?.speed).toBe(2.5);
    });
});
