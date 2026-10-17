import { writeStorageItem, type QuotaStorage } from "../../../game/core/src/api/local_storage_quota";

/**
 * The site and the game share one origin. Sandbox replays and dev drafts fill that quota, and a
 * failed access-token write is a failed sign-in. Drop those caches and retry, same as the game client.
 */
export function writeAuthStorage(key: string, value: string, store: QuotaStorage = localStorage): void {
    writeStorageItem(store, key, value);
}
