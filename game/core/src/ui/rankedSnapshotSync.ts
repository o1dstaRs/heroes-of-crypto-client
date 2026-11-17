import type { PlaySnapshot } from "../api/play_protocol";

type RankedSnapshotOrder = {
    gameId: string;
    latestSequence: number;
    serverTimeMs: number;
};

/** A poll can win the race against both SSE and the submit response. Present its new journal
 * before hydration advances the scene's sequence and makes the delayed record look redundant. */
export async function playMissingRankedSnapshotRecords(
    next: PlaySnapshot,
    current: RankedSnapshotOrder | null,
    play: (entry: PlaySnapshot["journalTail"][number], stateAfter?: PlaySnapshot) => Promise<boolean>,
): Promise<boolean> {
    if (!current || next.gameId !== current.gameId || next.latestSequence <= current.latestSequence) return false;
    const entries = [...new Map(next.journalTail.map((entry) => [entry.sequence, entry])).values()]
        .filter((entry) => entry.sequence > current.latestSequence && entry.sequence <= next.latestSequence)
        .sort((a, b) => a.sequence - b.sequence);
    let terminalPresented = false;
    for (const entry of entries) {
        // Intermediate actions must not inherit the final snapshot's sequence or post-action stats.
        const terminal = entry.sequence === next.latestSequence;
        const played = await play(entry, terminal ? next : undefined);
        if (terminal) terminalPresented = played;
    }
    return terminalPresented;
}

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
