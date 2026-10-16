export interface PlayerResourceSnapshot<T> {
    data: T | null;
    loading: boolean;
    error: string;
}

/** Keep a player's last successful response on screen while revalidating, sharing concurrent reads. */
export const createPlayerResource = <T>(fetchData: () => Promise<T>, fallbackError: () => string) => {
    const entries = new Map<
        string,
        {
            snapshot: PlayerResourceSnapshot<T>;
            listeners: Set<() => void>;
            pending: Promise<void> | null;
        }
    >();
    const signedOut: PlayerResourceSnapshot<T> = { data: null, loading: false, error: "" };

    const entryFor = (account: string) => {
        let entry = entries.get(account);
        if (!entry) {
            entry = { snapshot: { data: null, loading: true, error: "" }, listeners: new Set(), pending: null };
            entries.set(account, entry);
        }
        return entry;
    };

    return {
        getSnapshot: (account: string): PlayerResourceSnapshot<T> => (account ? entryFor(account).snapshot : signedOut),
        subscribe: (account: string, listener: () => void): (() => void) => {
            if (!account) return () => undefined;
            const entry = entryFor(account);
            entry.listeners.add(listener);
            return () => {
                entry.listeners.delete(listener);
            };
        },
        load: (account: string): Promise<void> => {
            if (!account) return Promise.resolve();
            const entry = entryFor(account);
            if (entry.pending) return entry.pending;
            const publish = (snapshot: PlayerResourceSnapshot<T>) => {
                entry.snapshot = snapshot;
                for (const listener of entry.listeners) listener();
            };
            publish({ ...entry.snapshot, loading: true, error: "" });
            entry.pending = Promise.resolve()
                .then(fetchData)
                .then((data) => publish({ data, loading: false, error: "" }))
                .catch((error: unknown) => {
                    publish({
                        ...entry.snapshot,
                        loading: false,
                        error: error instanceof Error ? error.message : fallbackError(),
                    });
                })
                .finally(() => {
                    entry.pending = null;
                });
            return entry.pending;
        },
    };
};
