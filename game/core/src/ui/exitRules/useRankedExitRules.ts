import { useEffect, useState } from "react";

import { fetchRankedExitRules, type RankedExitRules } from "../../api/ranked_conduct_client";

let cached: RankedExitRules | undefined;
let inflight: Promise<RankedExitRules | undefined> | undefined;

/**
 * The published exit and lock rules (public GET ranked-exit-rules), read once per page load and shared. The exit dialogs
 * and the rules card use it to print the lock ladder only once it is in force. Undefined until it arrives, or when the
 * request fails (the screens then print the previous rules, which were right until the lock rules apply).
 */
export const useRankedExitRules = (): RankedExitRules | undefined => {
    const [rules, setRules] = useState<RankedExitRules | undefined>(cached);
    useEffect(() => {
        if (cached) {
            return undefined;
        }
        inflight ??= fetchRankedExitRules()
            .then((next) => {
                cached = next;
                return next;
            })
            .catch(() => {
                inflight = undefined;
                return undefined;
            });
        let cancelled = false;
        void inflight.then((next) => {
            if (!cancelled && next) {
                setRules(next);
            }
        });
        return () => {
            cancelled = true;
        };
    }, []);
    return rules;
};
