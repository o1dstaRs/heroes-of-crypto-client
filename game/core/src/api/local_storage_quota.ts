/**
 * localStorage for one origin is a few megabytes, and sandbox replays pack it until a write fails.
 * A failed access-token write is a failed login, so disposable caches are dropped until the session fits.
 */

export const STORAGE_HEADROOM_CHARS = 64 * 1024;
const HEADROOM_KEY = "hoc:storage-headroom";

/** Dropped before dev tuning drafts. A local replay or model log is never worth blocking sign-in. */
const DISPOSABLE_STORAGE_KEYS = ["hoc:sandbox-replays:v1", "hoc.localModelFightLog", "hoc.localModelDraftLog"] as const;

export interface QuotaStorage {
    readonly length: number;
    key(index: number): string | null;
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

export const isQuotaExceededError = (err: unknown): boolean => {
    if (!err || typeof err !== "object") {
        return false;
    }
    const candidate = err as { name?: unknown; code?: unknown; message?: unknown };
    if (candidate.name === "QuotaExceededError" || candidate.code === 22) {
        return true;
    }
    return typeof candidate.message === "string" && /quota/i.test(candidate.message);
};

const disposableStorageKeys = (store: QuotaStorage): string[] => {
    const present = new Set<string>();
    for (let index = 0; index < store.length; index += 1) {
        const key = store.key(index);
        if (key) {
            present.add(key);
        }
    }

    const exact = DISPOSABLE_STORAGE_KEYS.filter((key) => present.has(key));
    const drafts = [...present]
        .filter((key) => key.startsWith("hoc-dev-"))
        .sort((left, right) => (store.getItem(right)?.length ?? 0) - (store.getItem(left)?.length ?? 0));
    return [...exact, ...drafts];
};

/** Write `value`, dropping replays, model logs, then the largest dev drafts, until it fits. */
export const writeStorageItem = (store: QuotaStorage, key: string, value: string): void => {
    const attempt = (): void => {
        store.setItem(key, value);
    };
    try {
        attempt();
        return;
    } catch (err) {
        if (!isQuotaExceededError(err)) {
            throw err;
        }
    }

    const removed: string[] = [];
    for (const disposable of disposableStorageKeys(store)) {
        store.removeItem(disposable);
        removed.push(disposable);
        try {
            attempt();
            console.warn(`[auth] freed local storage so ${key} could be saved: ${removed.join(", ")}`);
            return;
        } catch (err) {
            if (!isQuotaExceededError(err)) {
                throw err;
            }
        }
    }
    attempt();
};

/**
 * Confirm a just-written value left room for a later small write (the session token). Returns false when the
 * browser quota cannot hold that reserve; the caller should shrink what it stored.
 */
export const reserveStorageHeadroom = (
    store: Pick<QuotaStorage, "setItem" | "removeItem">,
    chars = STORAGE_HEADROOM_CHARS,
): boolean => {
    try {
        store.setItem(HEADROOM_KEY, " ".repeat(chars));
        store.removeItem(HEADROOM_KEY);
        return true;
    } catch (err) {
        try {
            store.removeItem(HEADROOM_KEY);
        } catch {
            // The reserve itself may be what the quota rejected.
        }
        if (!isQuotaExceededError(err)) {
            throw err;
        }
        return false;
    }
};
