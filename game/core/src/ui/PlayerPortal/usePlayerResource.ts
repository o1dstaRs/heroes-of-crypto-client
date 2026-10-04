import { useCallback, useEffect, useSyncExternalStore } from "react";

import { useAuthContext } from "../auth/context/auth_context";
import { isMockPortalEnabled } from "./mockPortal";
import type { createPlayerResource } from "./playerResource";

/** The /me payload has no player id; email (or the unique username) scopes each in-memory response. */
export const usePlayerResource = <T>(resource: ReturnType<typeof createPlayerResource<T>>, reloadKey: unknown = 0) => {
    const { authenticated, user } = useAuthContext();
    const account = isMockPortalEnabled() ? "preview" : authenticated ? user?.email || user?.username || "" : "";
    const subscribe = useCallback((listener: () => void) => resource.subscribe(account, listener), [account, resource]);
    const getSnapshot = useCallback(() => resource.getSnapshot(account), [account, resource]);
    const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

    useEffect(() => {
        void resource.load(account);
    }, [account, reloadKey, resource]);

    return snapshot;
};
