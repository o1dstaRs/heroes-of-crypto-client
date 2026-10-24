import { describe, expect, test } from "bun:test";

import { writeAuthStorage } from "./auth-storage";
import type { QuotaStorage } from "../../../game/core/src/api/local_storage_quota";

const quotaStore = (limit: number): { store: QuotaStorage; values: Map<string, string> } => {
    const values = new Map<string, string>();
    const store: QuotaStorage = {
        get length() {
            return values.size;
        },
        key: (index) => [...values.keys()][index] ?? null,
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => {
            const next =
                [...values.entries()]
                    .filter(([existing]) => existing !== key)
                    .reduce((sum, [, stored]) => sum + stored.length, 0) + value.length;
            if (next > limit) {
                throw new DOMException(
                    "Failed to execute 'setItem' on 'Storage': Setting the value of 'accessToken' exceeded the quota.",
                    "QuotaExceededError",
                );
            }
            values.set(key, value);
        },
        removeItem: (key) => {
            values.delete(key);
        },
    };
    return { store, values };
};

describe("site auth storage quota", () => {
    test("drops replays, then dev drafts, until the session fits", () => {
        const token = "Bearer session-token";
        const user = JSON.stringify({ email: "player@example.com", username: "Stepan" });
        const { store, values } = quotaStore(token.length + user.length + "en".length + "gold".length);
        values.set("hoc:language", "en");
        values.set("hoc:sandbox-replays:v1", "r".repeat(80));
        values.set("hoc-dev-battlefield-creature-framing-v31", "d".repeat(80));
        values.set("hoc.ranked.armyColor", "gold");

        expect(() => writeAuthStorage("accessToken", token, store)).not.toThrow();
        expect(() => writeAuthStorage("hocAuthUser", user, store)).not.toThrow();

        expect(values.get("accessToken")).toBe(token);
        expect(values.get("hocAuthUser")).toBe(user);
        expect(values.has("hoc:sandbox-replays:v1")).toBe(false);
        expect(values.has("hoc-dev-battlefield-creature-framing-v31")).toBe(false);
        expect(values.get("hoc:language")).toBe("en");
        expect(values.get("hoc.ranked.armyColor")).toBe("gold");
    });

    test("still throws when nothing disposable can make room", () => {
        const token = "Bearer session-token";
        const { store, values } = quotaStore(4);
        values.set("hoc:language", "en");

        expect(() => writeAuthStorage("accessToken", token, store)).toThrow(/quota/i);
        expect(values.get("hoc:language")).toBe("en");
        expect(values.has("accessToken")).toBe(false);
    });
});
