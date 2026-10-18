import { describe, expect, spyOn, test } from "bun:test";
import { TeamVals } from "@heroesofcrypto/common";

import { axiosGameInstance } from "./axios";
import { PlayAimKind, type PlayAim } from "./play_protocol";
import { sendRankedPlayAim } from "./ranked_play_client";

function fields(bytes: Uint8Array): Map<number, number | Uint8Array> {
    let at = 0;
    const varint = () => {
        let value = 0n,
            shift = 0n;
        while (at < bytes.length) {
            const byte = bytes[at++];
            value |= BigInt(byte & 127) << shift;
            if (!(byte & 128)) return Number(value);
            shift += 7n;
        }
        throw new Error("truncated protobuf");
    };
    const result = new Map<number, number | Uint8Array>();
    while (at < bytes.length) {
        const tag = varint();
        if ((tag & 7) === 0) result.set(tag >> 3, varint());
        else if ((tag & 7) === 2) {
            const length = varint();
            result.set(tag >> 3, bytes.slice(at, at + length));
            at += length;
        } else throw new Error("unexpected protobuf wire type");
    }
    return result;
}

describe("ranked aim HTTP compatibility", () => {
    for (const kind of Object.values(PlayAimKind))
        test(`mode ${kind} keeps rich targets out of the legacy movement cell`, async () => {
            const previous = globalThis.localStorage;
            const values = new Map<string, string>();
            (globalThis as { localStorage?: Storage }).localStorage = {
                getItem: (key: string) => values.get(key) ?? null,
                setItem: (key: string, value: string) => {
                    values.set(key, value);
                },
            } as Storage;
            const post = spyOn(axiosGameInstance, "post").mockResolvedValue({ data: new Uint8Array() });
            try {
                const aim: PlayAim = {
                    kind,
                    unitId: "actor",
                    cell: kind === PlayAimKind.CLEAR ? undefined : { x: 0, y: 0 },
                    spellName: kind === PlayAimKind.SPELL ? "Fire Wall" : undefined,
                    targetOrientation: kind === PlayAimKind.SPELL ? 4 : undefined,
                };
                await sendRankedPlayAim("game", { playerId: "player", team: TeamVals.LEFT, sequence: 37, aim });
                expect(post).toHaveBeenCalledTimes(1);
                const wire = fields(post.mock.calls[0][1] as Uint8Array);
                expect(wire.get(4)).toBe(37);
                expect(wire.get(26)).toBe(kind);
                expect(wire.get(27)).toBeGreaterThan(0);
                expect(wire.has(14)).toBe(kind === PlayAimKind.MOVE);
                expect(wire.has(29)).toBe(kind !== PlayAimKind.CLEAR);
                expect(wire.has(19)).toBe(kind === PlayAimKind.SPELL);
                if (kind === PlayAimKind.SPELL)
                    expect(new TextDecoder().decode(wire.get(19) as Uint8Array)).toBe("armed_spell");
                const options = post.mock.calls[0][2];
                expect(options?.timeout).toBe(2500);
            } finally {
                post.mockRestore();
                (globalThis as { localStorage?: Storage }).localStorage = previous;
            }
        });
});
