import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { fetchPlayerMatchHistory, type MatchHistoryScope } from "../../api/player_portal_client";
import { filterPortalMatches, type MatchHistoryFilter, type PortalMatchData } from "./matchHistoryModel";
import { matchHistoryPageCursor, normalizeHistorySearch, searchPortalMatches } from "./matchHistorySearch";
import { isMockPortalEnabled } from "./mockPortal";

interface HistorySnapshot {
    key: string;
    matches: readonly PortalMatchData[];
    nextCursor: string | null;
    loading: boolean;
    loadingMore: boolean;
    error: boolean;
}

export const useMatchHistorySearch = (
    initialMatches: readonly PortalMatchData[],
    query: string,
    scope: MatchHistoryScope,
    result: MatchHistoryFilter,
    enabled: boolean,
) => {
    const normalizedQuery = normalizeHistorySearch(query);
    const key = JSON.stringify([normalizedQuery, scope, result]);
    const currentKey = useRef(key);
    currentKey.current = key;
    const moreRequest = useRef<AbortController | null>(null);
    const [retryKey, setRetryKey] = useState(0);
    const [snapshot, setSnapshot] = useState<HistorySnapshot>({
        key,
        matches: initialMatches,
        nextCursor: null,
        loading: false,
        loadingMore: false,
        error: false,
    });
    const preview = useMemo(
        () => filterPortalMatches(searchPortalMatches(initialMatches, normalizedQuery, scope), result),
        [initialMatches, normalizedQuery, result, scope],
    );

    useEffect(() => {
        const controller = new AbortController();
        const initial = !normalizedQuery && scope === "either" && result === "all";
        moreRequest.current?.abort();
        setSnapshot({
            key,
            matches: preview,
            nextCursor:
                enabled && initial && initialMatches.length >= 50
                    ? matchHistoryPageCursor(initialMatches.at(-1))
                    : null,
            loading: enabled && !initial,
            loadingMore: false,
            error: false,
        });
        if (!enabled || initial)
            return () => {
                controller.abort();
                moreRequest.current?.abort();
            };

        const timer = setTimeout(() => {
            if (isMockPortalEnabled()) {
                setSnapshot({
                    key,
                    matches: preview,
                    nextCursor: null,
                    loading: false,
                    loadingMore: false,
                    error: false,
                });
                return;
            }
            void fetchPlayerMatchHistory({ query: normalizedQuery, scope, result }, controller.signal)
                .then((page) => {
                    if (controller.signal.aborted || currentKey.current !== key) return;
                    setSnapshot({ key, ...page, loading: false, loadingMore: false, error: false });
                })
                .catch(() => {
                    if (controller.signal.aborted || currentKey.current !== key) return;
                    setSnapshot((previous) => ({ ...previous, loading: false, error: true }));
                });
        }, 250);
        return () => {
            clearTimeout(timer);
            controller.abort();
            moreRequest.current?.abort();
        };
    }, [enabled, initialMatches, key, normalizedQuery, preview, result, retryKey, scope]);

    const loadMore = useCallback(() => {
        if (!snapshot.nextCursor || snapshot.loading || snapshot.loadingMore || moreRequest.current) return;
        const controller = new AbortController();
        moreRequest.current = controller;
        const before = snapshot.nextCursor;
        setSnapshot((previous) => ({ ...previous, loadingMore: true, error: false }));
        void fetchPlayerMatchHistory({ query: normalizedQuery, scope, result, before }, controller.signal)
            .then((page) => {
                if (controller.signal.aborted || currentKey.current !== key) return;
                setSnapshot((previous) => {
                    const existing = new Set(previous.matches.map((match) => match.game_id));
                    return {
                        ...previous,
                        matches: [...previous.matches, ...page.matches.filter((match) => !existing.has(match.game_id))],
                        nextCursor: page.nextCursor,
                        loadingMore: false,
                    };
                });
            })
            .catch(() => {
                if (controller.signal.aborted || currentKey.current !== key) return;
                setSnapshot((previous) => ({ ...previous, loadingMore: false, error: true }));
            })
            .finally(() => {
                if (moreRequest.current === controller) moreRequest.current = null;
            });
    }, [key, normalizedQuery, result, scope, snapshot]);

    return {
        matches: snapshot.key === key ? snapshot.matches : preview,
        loading: snapshot.key !== key || snapshot.loading,
        loadingMore: snapshot.loadingMore,
        error: snapshot.key === key && snapshot.error,
        hasMore: snapshot.key === key && !!snapshot.nextCursor,
        loadMore,
        retry: () => (snapshot.nextCursor ? loadMore() : setRetryKey((value) => value + 1)),
    };
};
