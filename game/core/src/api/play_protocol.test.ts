import { describe, expect, test } from "bun:test";

import { decodePlayEvent, decodePlaySnapshot, PlayEventKind } from "./play_protocol";

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

const intField = (field: number, value: number): number[] => [...tag(field, 0), ...encodeVarint(value)];

// Mirrors how protobufjs encodes a negative int32: sign-extended to a 10-byte 64-bit varint.
const signedIntField = (field: number, value: number): number[] => [
    ...tag(field, 0),
    ...encodeVarint(BigInt.asUintN(64, BigInt(value))),
];

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

    test("decodes the live range shots and effective luck (proto fields 20 and 21)", () => {
        const unit = [...stringField(1, "unit-1"), ...intField(20, 6), ...intField(21, 3)];
        const snapshot = new Uint8Array([...stringField(1, "game-1"), ...messageField(12, unit)]);

        const decoded = decodePlaySnapshot(snapshot);

        expect(decoded.units[0]?.rangeShots).toBe(6);
        expect(decoded.units[0]?.luck).toBe(3);
    });

    test("decodes negative morale and luck (sign-extended int32 from protobufjs)", () => {
        const unit = [...stringField(1, "unit-1"), ...signedIntField(14, -2), ...signedIntField(21, -5)];
        const snapshot = new Uint8Array([...stringField(1, "game-1"), ...messageField(12, unit)]);

        const decoded = decodePlaySnapshot(snapshot);

        expect(decoded.units[0]?.morale).toBe(-2);
        expect(decoded.units[0]?.luck).toBe(-5);
    });

    test("decodes a unit's repeated debuff and buff names (proto fields 18 and 19)", () => {
        const unit = [
            ...stringField(1, "unit-1"),
            ...stringField(18, "Sadness"), // repeated string debuffs = 18
            ...stringField(18, "Quagmire"),
            ...stringField(19, "Courage"), // repeated string buffs = 19
        ];
        const snapshot = new Uint8Array([...stringField(1, "game-1"), ...messageField(12, unit)]);

        const decoded = decodePlaySnapshot(snapshot);

        expect(decoded.units[0]?.debuffs).toEqual(["Sadness", "Quagmire"]);
        expect(decoded.units[0]?.buffs).toEqual(["Courage"]);
    });

    test("decodes the fight-start army totals (proto fields 24-27)", () => {
        const snapshot = new Uint8Array([
            ...stringField(1, "game-1"),
            ...intField(24, 7), // lower_start_units
            ...intField(25, 6), // upper_start_units
            ...intField(26, 420), // lower_start_health
            ...intField(27, 360), // upper_start_health
        ]);

        const decoded = decodePlaySnapshot(snapshot);

        expect(decoded.lowerStartUnits).toBe(7);
        expect(decoded.upperStartUnits).toBe(6);
        expect(decoded.lowerStartHealth).toBe(420);
        expect(decoded.upperStartHealth).toBe(360);
    });

    test("defaults the fight-start army totals to 0 when absent (older server)", () => {
        const decoded = decodePlaySnapshot(new Uint8Array([...stringField(1, "game-1")]));

        expect(decoded.lowerStartUnits).toBe(0);
        expect(decoded.upperStartUnits).toBe(0);
        expect(decoded.lowerStartHealth).toBe(0);
        expect(decoded.upperStartHealth).toBe(0);
    });

    test("a unit with no debuff/buff fields decodes them as undefined", () => {
        const unit = [...stringField(1, "unit-1")];
        const snapshot = new Uint8Array([...stringField(1, "game-1"), ...messageField(12, unit)]);

        const decoded = decodePlaySnapshot(snapshot);

        expect(decoded.units[0]?.debuffs).toBeUndefined();
        expect(decoded.units[0]?.buffs).toBeUndefined();
    });

    test("decodes authoritative damage stats from snapshots", () => {
        const damageStat = [...stringField(1, "Arbalester"), ...intField(2, 30), ...intField(3, 2), ...intField(4, 1)];
        const snapshot = new Uint8Array([
            ...stringField(1, "game-1"),
            ...messageField(21, damageStat),
            ...intField(22, 1000),
            ...intField(23, 46000),
        ]);

        const decoded = decodePlaySnapshot(snapshot);

        expect(decoded.damageStats).toEqual([{ unitName: "Arbalester", damage: 30, team: 2, lap: 1 }]);
        expect(decoded.currentTurnStartMs).toBe(1000);
        expect(decoded.currentTurnEndMs).toBe(46000);
    });

    test("decodes an opponent move-intent event", () => {
        const targetCell = [...intField(1, 5), ...intField(2, 7)];
        const intent = [...stringField(1, "unit-42"), ...messageField(2, targetCell), ...intField(3, 1)];
        const event = new Uint8Array([
            ...intField(1, 0), // sequence
            ...intField(2, PlayEventKind.MOVE_INTENT), // kind
            ...messageField(10, intent),
        ]);

        const decoded = decodePlayEvent(event);

        expect(decoded.kind).toBe(PlayEventKind.MOVE_INTENT);
        expect(decoded.intent).toEqual({ unitId: "unit-42", targetCell: { x: 5, y: 7 }, active: true });
    });

    test("decodes a cleared move-intent event (no target cell)", () => {
        const intent = [...stringField(1, "unit-42")]; // active defaults to false, no target cell
        const event = new Uint8Array([...intField(2, PlayEventKind.MOVE_INTENT), ...messageField(10, intent)]);

        const decoded = decodePlayEvent(event);

        expect(decoded.intent).toEqual({ unitId: "unit-42", active: false });
        expect(decoded.intent?.targetCell).toBeUndefined();
    });
});
