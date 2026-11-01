import { expect, test } from "bun:test";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createPickStatStore } from "./pick_stat_order_profile";
import { DEFAULT_PICK_STAT_ORDER, swapPickStats, validatePickStatOrder } from "../src/ui/pickStatOrderModel";

test("stat swaps retain every value, including hidden ranged stats", () => {
    const next = swapPickStats(DEFAULT_PICK_STAT_ORDER, "health", "movement");
    expect(next[0]).toBe("movement");
    expect(next[DEFAULT_PICK_STAT_ORDER.indexOf("movement")]).toBe("health");
    expect(next.filter((id) => id !== "shots" && id !== "shotDistance")).toHaveLength(8);
    expect(swapPickStats(next, "health", "movement")).toEqual([...DEFAULT_PICK_STAT_ORDER]);
    expect(() => validatePickStatOrder([...next.slice(1), "health"])).toThrow();
    expect(() => validatePickStatOrder(next.slice(1))).toThrow();
    expect(() => validatePickStatOrder([...next.slice(1), "unknown"])).toThrow();
});

test("local profile survives reopening and preserves the previous layout", async () => {
    const root = fileURLToPath(new URL("../../../tmp/", import.meta.url));
    await fs.mkdir(root, { recursive: true });
    const directory = await fs.mkdtemp(root + "stat-order-test-");
    try {
        const store = createPickStatStore(directory);
        expect(await store.read()).toBeNull();
        await store.write(DEFAULT_PICK_STAT_ORDER);
        const next = swapPickStats(DEFAULT_PICK_STAT_ORDER, "health", "armor");
        await store.write(next);
        expect(await createPickStatStore(directory).read()).toEqual(next);
        const history = await fs.readdir(directory + "/history");
        expect(history).toHaveLength(1);
        expect(JSON.parse(await fs.readFile(directory + "/history/" + history[0], "utf8"))).toEqual([
            ...DEFAULT_PICK_STAT_ORDER,
        ]);
        expect(() => store.write(["health"])).toThrow();
        expect(await store.read()).toEqual(next);
        await fs.writeFile(directory + "/settings.json", "broken");
        await expect(store.write(DEFAULT_PICK_STAT_ORDER)).rejects.toThrow();
        expect(await fs.readFile(directory + "/settings.json", "utf8")).toBe("broken");
    } finally {
        await fs.rm(directory, { recursive: true, force: true });
    }
});
