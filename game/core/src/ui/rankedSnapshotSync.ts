type RankedSnapshotOrder = {
    gameId: string;
    latestSequence: number;
    serverTimeMs: number;
};

/** HTTP polls and action responses can arrive after newer SSE snapshots. */
export const isOlderRankedSnapshot = (next: RankedSnapshotOrder, current: RankedSnapshotOrder | null): boolean => {
    if (!current || next.gameId !== current.gameId) return false;
    if (next.latestSequence !== current.latestSequence) return next.latestSequence < current.latestSequence;
    // Presence and clock updates can share a journal sequence. Older servers/previews omit the clock.
    return next.serverTimeMs > 0 && current.serverTimeMs > 0 && next.serverTimeMs < current.serverTimeMs;
};

/** Wait for the current animation and any records appended while it was playing. */
export const waitForRankedPlayback = async (getPlayback: () => Promise<void>): Promise<void> => {
    let playback: Promise<void>;
    do {
        playback = getPlayback();
        await playback.catch(() => undefined);
    } while (playback !== getPlayback());
};
