import type { PlaySnapshot } from "../api/play_protocol";

type RankedSnapshotOrder = {
    gameId: string;
    latestSequence: number;
    serverTimeMs: number;
};

/** Present the journal in order, including the entry delivered alongside an SSE or action response. */
export async function playMissingRankedSnapshotRecords(
    next: PlaySnapshot,
    current: RankedSnapshotOrder | null,
    play: (entry: PlaySnapshot["journalTail"][number], stateAfter?: PlaySnapshot) => Promise<boolean>,
    deliveredEntry?: PlaySnapshot["journalTail"][number],
): Promise<boolean> {
    const currentSequence = current?.gameId === next.gameId ? current.latestSequence : undefined;
    const entries = new Map<number, PlaySnapshot["journalTail"][number]>();
    if (currentSequence !== undefined && next.latestSequence > currentSequence) {
        for (const entry of next.journalTail) {
            if (entry.sequence > currentSequence && entry.sequence <= next.latestSequence)
                entries.set(entry.sequence, entry);
        }
    }
    if (
        deliveredEntry &&
        deliveredEntry.sequence <= next.latestSequence &&
        (currentSequence === undefined || deliveredEntry.sequence >= currentSequence)
    ) {
        entries.set(deliveredEntry.sequence, deliveredEntry);
    }
    let terminalPresented = false;
    for (const entry of [...entries.values()].sort((a, b) => a.sequence - b.sequence)) {
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
