import { expect, test } from "bun:test";
import { LIGHTNING_FRAME_MS, lightningFrameAt, lightningPath } from "./ThunderbirdLightningTiming";

test("overhead first strike, then ordered target-to-target arcs with exact frame boundaries", () => {
    const targets = [
        { x: 100, y: 200 },
        { x: 200, y: 220 },
        { x: 250, y: 180 },
    ];
    const path = lightningPath(targets, 100);
    const upperEdges = [
        { x: 100, y: 250 },
        { x: 200, y: 270 },
        { x: 250, y: 230 },
    ];
    expect(path[0].from).toEqual({ x: 122, y: 590 });
    expect(path.map((p) => p.to)).toEqual(upperEdges);
    expect(path[1].from).toEqual(upperEdges[0]);
    expect(path[2].from).toEqual(upperEdges[1]);
    expect(targets[0]).toEqual({ x: 100, y: 200 });
    expect(path.map((p) => p.delayMs)).toEqual([35, 155, 275]);
    let ms = 0;
    for (const [i, duration] of LIGHTNING_FRAME_MS.entries()) {
        expect(lightningFrameAt(ms)).toBe(i);
        expect(lightningFrameAt(ms + duration - 0.001)).toBe(i);
        ms += duration;
    }
    expect(ms).toBe(310);
    expect(lightningFrameAt(-1)).toBeUndefined();
    expect(lightningFrameAt(310)).toBeUndefined();
});

test("live and replay recipients keep primary once, preserve bounce order and suppress misses/resistance", async () => {
    const { chainLightningRecipients } = await import("./chainLightningRecipients");
    const damage = {
        amount: 10,
        render: true,
        unitPosition: { x: 1, y: 2 },
        unitIsSmall: true,
        unitId: "primary",
        secondary: [
            {
                source: "chain_lightning" as const,
                unitId: "primary",
                position: { x: 1, y: 2 },
                amount: 3,
                unitsDied: 0,
            },
            { source: "chain_lightning" as const, unitId: "second", position: { x: 3, y: 2 }, amount: 2, unitsDied: 0 },
        ],
    };
    expect(chainLightningRecipients(damage).map((p) => p.unitId)).toEqual(["primary", "second"]);
    expect(chainLightningRecipients({ ...damage, secondary: damage.secondary.slice(1) }).map((p) => p.unitId)).toEqual([
        "primary",
        "second",
    ]);
    expect(chainLightningRecipients({ ...damage, missed: true })).toEqual([]);
    expect(chainLightningRecipients({ ...damage, secondary: [] })).toEqual([]);
    expect(chainLightningRecipients({ ...damage, unitId: undefined })).toHaveLength(2);
});
