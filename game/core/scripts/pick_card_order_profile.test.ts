import { describe, expect, test } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import { createPickOrderStore, validatePickOrders } from "./pick_card_order_profile";

const orders = Object.fromEntries(
    [1, 2, 3, 4].map((level) => [
        level,
        Array.from({ length: level < 3 ? 16 : 12 }, (_, index) => level * 100 + index + 1),
    ]),
);

async function withStore(run: (directory: string) => Promise<void>) {
    await fs.mkdir("tmp/pick-order-tests", { recursive: true });
    const directory = await fs.mkdtemp("tmp/pick-order-tests/profile-");
    try {
        await run(directory);
    } finally {
        await fs.rm(directory, { recursive: true, force: true });
    }
}

describe("local pick order profile", () => {
    test("preserves all four levels across restart and ignores a stale browser import", async () => {
        await withStore(async (directory) => {
            const first = createPickOrderStore(directory);
            expect(await first.read()).toBeNull();
            await first.update(() => validatePickOrders(orders, true));
            const restarted = createPickOrderStore(directory);
            const stale = { ...orders, 1: [...orders[1]].reverse() };
            expect(await restarted.update((current) => current ?? stale)).toEqual(orders);
            expect(await restarted.read()).toEqual(orders);
        });
    });
    test("serializes independent level edits and keeps recoverable history", async () => {
        await withStore(async (directory) => {
            const store = createPickOrderStore(directory);
            await store.update(() => orders);
            await Promise.all(
                [1, 2].map((level) =>
                    store.update((current) => ({ ...current, [level]: [...orders[level]].reverse() })),
                ),
            );
            expect(await store.read()).toEqual({ ...orders, 1: [...orders[1]].reverse(), 2: [...orders[2]].reverse() });
            expect((await fs.readdir(path.join(directory, "history"))).length).toBe(2);
        });
    });
    test("refuses malformed profiles and incomplete initial imports without overwriting", async () => {
        expect(() => validatePickOrders({ 1: orders[1] }, true)).toThrow();
        expect(() => validatePickOrders({ 1: Array(16).fill(1) })).toThrow();
        await withStore(async (directory) => {
            const file = path.join(directory, "settings.json");
            await fs.writeFile(file, "broken profile");
            await expect(createPickOrderStore(directory).update(() => orders)).rejects.toThrow();
            expect(await fs.readFile(file, "utf8")).toBe("broken profile");
        });
    });
});
