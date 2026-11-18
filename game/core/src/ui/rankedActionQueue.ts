import { PlayActionType, type PlayActionResponse, type PlayActionTypeValue } from "../api/play_protocol";

/** Gameplay envelopes are built in order from the latest sequence, without waiting on keep-alives. */
export class RankedActionQueue {
    private tail: Promise<unknown> = Promise.resolve();
    public submit<T>(send: () => Promise<T>, type?: PlayActionTypeValue): Promise<T> {
        // PING carries expectedSequence=0 and has no player action/journal entry. Serializing its
        // network round trip here adds that entire wait to the next click, on every kind of action.
        // It still uses the normal response handler, including monotonic server-sequence updates.
        if (type === PlayActionType.PING) return Promise.resolve().then(send);

        const next = this.tail.catch(() => undefined).then(send);
        this.tail = next.catch(() => undefined);
        return next;
    }
}

/** A lost keep-alive must never clear a pending turn, rebuild its board, or trigger rejection recovery. */
export const submitRankedHeartbeat = async (
    send: () => Promise<Pick<PlayActionResponse, "accepted" | "sequence">>,
    rememberSequence: (sequence: number) => void,
): Promise<boolean> => {
    try {
        const response = await send();
        rememberSequence(response.sequence);
        return response.accepted;
    } catch {
        return false;
    }
};
