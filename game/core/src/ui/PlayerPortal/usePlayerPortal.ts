import { type ResponsePlayerPortalObject } from "@heroesofcrypto/common";
import { useCallback, useEffect, useState } from "react";

import { fetchPlayerPortal } from "../../api/player_portal_client";

export interface PlayerPortalState {
    data: ResponsePlayerPortalObject | null;
    loading: boolean;
    error: string;
    reload: () => void;
}

/** Loads the authenticated player's portal payload, with loading/error state and a manual reload. */
export const usePlayerPortal = (): PlayerPortalState => {
    const [data, setData] = useState<ResponsePlayerPortalObject | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [nonce, setNonce] = useState(0);

    const reload = useCallback(() => setNonce((n) => n + 1), []);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError("");
        fetchPlayerPortal()
            .then((payload) => {
                if (!cancelled) {
                    setData(payload);
                }
            })
            .catch((err: unknown) => {
                if (!cancelled) {
                    setError((err as Error)?.message ?? "Unable to load profile");
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setLoading(false);
                }
            });
        return () => {
            cancelled = true;
        };
    }, [nonce]);

    return { data, loading, error, reload };
};
