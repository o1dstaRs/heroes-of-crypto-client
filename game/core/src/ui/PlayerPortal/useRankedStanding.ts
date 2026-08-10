import { useEffect, useState } from "react";

import { fetchRankedStanding, type RankedStanding } from "../../api/social_client";

/**
 * The signed-in player's ranked standing (calibration progress, or league once placed).
 *
 * Kept OUT of the portal payload on purpose: that payload is protobuf and rebuilt from full match
 * history, while this is a couple of counters that both the lobby and the portal want on their own
 * cadence. A failed load simply yields null — every caller renders nothing rather than an error, so
 * a hiccup here can never block matchmaking.
 */
export const useRankedStanding = (reloadKey: unknown = 0): RankedStanding | null => {
    const [standing, setStanding] = useState<RankedStanding | null>(null);

    useEffect(() => {
        let cancelled = false;
        void fetchRankedStanding()
            .then((next) => {
                if (!cancelled) {
                    setStanding(next);
                }
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [reloadKey]);

    return standing;
};
