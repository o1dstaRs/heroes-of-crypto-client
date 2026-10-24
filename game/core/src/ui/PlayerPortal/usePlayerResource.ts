import { useCallback, useEffect, useSyncExternalStore } from "react";

import { useAuthContext } from "../auth/context/auth_context";
import { isMockPortalEnabled } from "./mockPortal";
import type { createPlayerResource } from "./playerResource";

/** An empty key disables the request; a new key immediately selects its own snapshot. */
export const usePlayerResourceForKey = <T>(
    resource: ReturnType<typeof createPlayerResource<T>>,
    key: string,
    reloadKey: unknown = 0,
) => {
    const subscribe = useCallback((listener: () => void) => resource.subscribe(key, listener), [key, resource]);
    const getSnapshot = useCallback(() => resource.getSnapshot(key), [key, resource]);
    const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

    useEffect(() => {
        void resource.load(key);
    }, [key, reloadKey, resource]);

    return snapshot;
};

/** The /me payload has no player id; email (or the unique username) scopes each in-memory response. */
export const usePlayerResource = <T>(resource: ReturnType<typeof createPlayerResource<T>>, reloadKey: unknown = 0) => {
    const { authenticated, user } = useAuthContext();
    const account = isMockPortalEnabled() ? "preview" : authenticated ? user?.email || user?.username || "" : "";
    return usePlayerResourceForKey(resource, account, reloadKey);
};
