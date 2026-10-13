import type { PlaySnapshot } from "../../api/play_protocol";
import { fetchPremium, type PremiumAdvice, type PremiumTurnPreview } from "../../api/premium_client";
import { currentPremiumTurn } from "./premiumFightState";

/** One request per battlefield revision, with bounded retries and no publishing after cleanup. */
export const startPremiumTurnPreview = (
    snapshot: PlaySnapshot,
    publish: (turn?: PremiumTurnPreview) => void,
    load: (gameId: string, signal: AbortSignal) => Promise<PremiumAdvice> = fetchPremium,
): (() => void) => {
    const controller = new AbortController();
    let retry: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    publish(undefined);
    const request = async (): Promise<void> => {
        attempts += 1;
        try {
            const advice = await load(snapshot.gameId, controller.signal);
            if (controller.signal.aborted) return;
            const turn = currentPremiumTurn(advice, snapshot);
            if (turn?.status === "ready") {
                publish({ ...turn, gameId: snapshot.gameId });
                return;
            }
            if (!advice.entitlement.active || turn?.status === "automatic") return;
        } catch {
            if (controller.signal.aborted) return;
        }
        if (attempts < 3) retry = setTimeout(() => void request(), 1500);
    };
    void request();
    return () => {
        controller.abort();
        clearTimeout(retry);
        publish(undefined);
    };
};
