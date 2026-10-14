import { useSyncExternalStore } from "react";

import {
    getPremiumSuggestedMoves,
    getPremiumSuggestedMovesServerSnapshot,
    subscribePremiumSuggestedMoves,
} from "../../settings/premiumSuggestedMoves";

export const usePremiumSuggestedMoves = (): boolean =>
    useSyncExternalStore(
        subscribePremiumSuggestedMoves,
        getPremiumSuggestedMoves,
        getPremiumSuggestedMovesServerSnapshot,
    );
