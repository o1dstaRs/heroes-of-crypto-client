import { useEffect, useState } from "react";
import { useLocation } from "react-router";

import { fetchRankedConduct, type RankedConduct } from "../../api/ranked_conduct_client";
import { isMarkedVsAiGame } from "../../utils/aiOpponent";

export interface DraftKind {
    /** A lobby or vs-AI draft: no penalties and no ranked record. */
    casual: boolean;
    vsAi: boolean;
}

/** Whether this draft is ranked, from what the client already knows (no request). */
export const useDraftKind = (gameId: string): DraftKind => {
    const location = useLocation();
    const vsAi = isMarkedVsAiGame(gameId);
    return { casual: vsAi || (location.state as { from?: string } | null)?.from === "lobby", vsAi };
};

/**
 * What the draft screens need to state the exit rules correctly: the draft's kind plus, for a ranked draft, the player's
 * own conduct record (calibrating, whether the rules are enforced, the numbers). Loaded with the draft and again whenever
 * `refreshKey` changes, so a dialog or notice never opens on a guess.
 */
export const useDraftConduct = (gameId: string, refreshKey: unknown = 0): DraftKind & { conduct?: RankedConduct } => {
    const kind = useDraftKind(gameId);
    const [conduct, setConduct] = useState<RankedConduct | undefined>();
    useEffect(() => {
        if (kind.casual) {
            return undefined;
        }
        let cancelled = false;
        void fetchRankedConduct()
            .then((next) => {
                if (!cancelled) {
                    setConduct(next);
                }
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [kind.casual, refreshKey]);
    return { ...kind, conduct };
};
